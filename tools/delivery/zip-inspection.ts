// Test-only ZIP inspection of bounded controlled output; never a product ingestion path.
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
export function inspectZip(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (b.length > 32_000_000)
    throw Error('Controlled archive exceeds inspection bound');
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--)
    if (b.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0 || b.readUInt16LE(eocd + 4) || b.readUInt16LE(eocd + 6))
    throw Error('Incomplete archive');
  const count = b.readUInt16LE(eocd + 10),
    entries = [];
  let cursor = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (b.readUInt32LE(cursor) !== 0x02014b50)
      throw Error('Invalid central directory');
    const method = b.readUInt16LE(cursor + 10),
      compressed = b.readUInt32LE(cursor + 20),
      size = b.readUInt32LE(cursor + 24),
      names = b.readUInt16LE(cursor + 28),
      extra = b.readUInt16LE(cursor + 30),
      comment = b.readUInt16LE(cursor + 32),
      local = b.readUInt32LE(cursor + 42);
    const path = b.toString('utf8', cursor + 46, cursor + 46 + names);
    if (size > 16_000_000 || b.readUInt32LE(local) !== 0x04034b50)
      throw Error('Unsafe controlled entry');
    const start =
        local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28),
      source = b.subarray(start, start + compressed);
    const data =
      method === 0
        ? source
        : method === 8
          ? inflateRawSync(source, { maxOutputLength: 16_000_000 })
          : null;
    if (!data || data.length !== size)
      throw Error('Invalid controlled entry length');
    entries.push({
      path,
      bytes: data,
      sha256: createHash('sha256').update(data).digest('hex'),
    });
    cursor += 46 + names + extra + comment;
  }
  return entries;
}
