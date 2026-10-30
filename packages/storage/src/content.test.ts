import { it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { validateContent } from './content.js';
import { createNativeStorage } from './native.js';

function officeOriginal() {
  const members = [
    [
      '[Content_Types].xml',
      '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<Relationships><Relationship Type="officeDocument" Target="word/document.xml"/></Relationships>',
    ],
    [
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
    ],
  ];
  const local: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0,
    metadataOffset = 0;
  for (const [name, text] of members) {
    const path = Buffer.from(name!),
      bytes = Buffer.from(text!),
      data = deflateRawSync(bytes);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(path.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    if (!metadataOffset) metadataOffset = offset + header.length + path.length;
    local.push(header, path, data);
    directory.push(central, path);
    offset += header.length + path.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(3, 8);
  end.writeUInt16LE(3, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return { bytes: Buffer.concat([...local, central, end]), metadataOffset };
}

it('validates a genuine stored deflated Office original without extracting or executing it', async () => {
  const workspace = process.cwd(),
    root = join(workspace, '.local/infra-tests', 'r09-office-' + randomUUID()),
    storage = await createNativeStorage(root, workspace, 'test'),
    key = randomUUID(),
    original = officeOriginal();
  try {
    await storage.write(
      key,
      (async function* () {
        yield original.bytes;
      })(),
      original.bytes.length,
    );
    expect(
      await validateContent(storage, key, 'docx', original.bytes.length),
    ).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('a simulated Office metadata read failure rejects admission without an uncaught stream error', async () => {
  const workspace = process.cwd(),
    root = join(
      workspace,
      '.local/infra-tests',
      'r09-office-failure-' + randomUUID(),
    ),
    storage = await createNativeStorage(root, workspace, 'test'),
    key = randomUUID(),
    original = officeOriginal();
  try {
    await storage.write(
      key,
      (async function* () {
        yield original.bytes;
      })(),
      original.bytes.length,
    );
    const faulted = {
      ...storage,
      slice: async (id: string, offset: number, length: number) => {
        if (offset === original.metadataOffset)
          throw Error('Simulated storage read failure');
        return storage.slice(id, offset, length);
      },
    };
    await expect(
      validateContent(faulted, key, 'docx', original.bytes.length),
    ).rejects.toMatchObject({ code: 'DOCUMENT_STRUCTURE' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 4000);
