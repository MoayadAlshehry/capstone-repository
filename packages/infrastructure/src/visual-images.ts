import 'server-only';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import {
  IMAGE_UPLOAD_BYTES,
  visualCrop,
  centeredFraming,
  type VisualFraming,
} from '@capstone/domain';

export class VisualImageError extends Error {
  constructor(
    readonly code:
      | 'IMAGE_TYPE'
      | 'IMAGE_SIZE'
      | 'IMAGE_DIMENSIONS'
      | 'IMAGE_INVALID'
      | 'IMAGE_BUSY',
  ) {
    super(code);
  }
}
let decoding = 0;
export async function normalizeVisualImage(
  input: Uint8Array,
  kind: 'cover' | 'avatar',
  framing: VisualFraming = centeredFraming,
) {
  if (!input.length || input.length > IMAGE_UPLOAD_BYTES)
    throw new VisualImageError('IMAGE_SIZE');
  const bytes = Buffer.from(input);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw new VisualImageError('IMAGE_TYPE');
  if (decoding >= 2) throw new VisualImageError('IMAGE_BUSY');
  decoding++;
  try {
    const image = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: 'error',
      animated: false,
    });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1
    )
      throw new VisualImageError('IMAGE_INVALID');
    const minimum = kind === 'cover' ? 200 : 64;
    if (
      !meta.width ||
      !meta.height ||
      Math.min(meta.width, meta.height) < minimum ||
      Math.max(meta.width, meta.height) > 8192
    )
      throw new VisualImageError('IMAGE_DIMENSIONS');
    const swapped =
      (meta.orientation ?? 1) >= 5 && (meta.orientation ?? 1) <= 8;
    const crop = visualCrop(
      swapped ? meta.height : meta.width,
      swapped ? meta.width : meta.height,
      kind,
      framing,
    );
    const main = await image
      .rotate()
      .extract(crop)
      .resize(kind === 'cover' ? 1600 : 256, kind === 'cover' ? 1000 : 256, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const small = await sharp(main.data)
      .resize(kind === 'cover' ? 640 : 64, kind === 'cover' ? 400 : 64, {
        fit: 'cover',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return {
      main,
      small,
      inputHash: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    if (error instanceof VisualImageError) throw error;
    throw new VisualImageError('IMAGE_INVALID');
  } finally {
    decoding--;
  }
}
