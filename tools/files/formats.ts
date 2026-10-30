import { deflateRawSync } from 'node:zlib';
// Technical fixtures only. Office package generation never enters runtime imports.
function crc(bytes: Uint8Array) {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function office(format: 'docx' | 'pptx' | 'zip') {
  const main = format === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
  const content =
    format === 'docx'
      ? 'wordprocessingml.document'
      : 'presentationml.presentation';
  const members: Record<string, string> =
    format === 'zip'
      ? { 'random.txt': 'generic archive' }
      : {
          '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${content}.main+xml"/></Types>`,
          '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${main}"/></Relationships>`,
          [main]:
            format === 'docx'
              ? '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>'
              : '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
        };
  const locals: Buffer[] = [],
    dirs: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(members)) {
    const name = Buffer.from(path),
      data = Buffer.from(text),
      packed = deflateRawSync(data),
      checksum = crc(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    dirs.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const central = Buffer.concat(dirs),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(members).length, 8);
  end.writeUInt16LE(Object.keys(members).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
export function formatFixture(ext: string): Uint8Array {
  if (['docx', 'pptx', 'zip'].includes(ext))
    return office(ext as 'docx' | 'pptx' | 'zip');
  const known: Record<string, Uint8Array> = {
    png: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
      'base64',
    ),
    jpg: Buffer.from([0xff, 0xd8, 0xff, 0xdb, ...Array<number>(30).fill(0)]),
    webp: Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([30, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
      Buffer.alloc(30),
    ]),
    pdf: Buffer.from('%PDF-1.7\n%%EOF\n'),
    mp4: Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom'),
      Buffer.alloc(24),
    ]),
    mp3: Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Array<number>(100).fill(0)]),
    wav: Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([40, 0, 0, 0]),
      Buffer.from('WAVEfmt '),
      Buffer.alloc(30),
    ]),
  };
  if (!known[ext]) throw Error('Unknown technical format fixture');
  return known[ext];
}
