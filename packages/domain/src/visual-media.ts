import { z } from 'zod';

export const IMAGE_UPLOAD_BYTES = 5_000_000;
export const visualFramingSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    zoom: z.number().min(1).max(3),
  })
  .strict();
export type VisualFraming = z.infer<typeof visualFramingSchema>;
export const centeredFraming: VisualFraming = { x: 0.5, y: 0.5, zoom: 1 };
export const visualAspectRatio = { cover: 1.6, avatar: 1 } as const;
/** Coordinates are relative to the oriented source, shared by preview and normalization. */
export function visualCrop(
  width: number,
  height: number,
  kind: 'cover' | 'avatar',
  framing: VisualFraming = centeredFraming,
) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw Error('IMAGE_DIMENSIONS');
  const frame = visualFramingSchema.parse(framing),
    ratio = visualAspectRatio[kind];
  const cropWidth = Math.max(
    1,
    Math.floor(Math.min(width, height * ratio) / frame.zoom),
  );
  const cropHeight = Math.max(1, Math.floor(cropWidth / ratio));
  return {
    left: Math.round((width - cropWidth) * frame.x),
    top: Math.round((height - cropHeight) * frame.y),
    width: cropWidth,
    height: cropHeight,
  };
}
export const visualTargetSchema = z
  .object({
    kind: z.enum(['cover', 'avatar']),
    project: z.uuid().optional(),
    version: z.uuid().optional(),
    submission: z.uuid().optional(),
    user: z.uuid().optional(),
    published: z.boolean().optional(),
    person: z.enum(['author', 'supervisor']).optional(),
    order: z.number().int().min(1).max(1000).optional(),
    grant: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    const invalid =
      v.kind === 'cover'
        ? !v.project || !!v.user || !!v.person || v.order !== undefined
        : v.published
          ? !v.project ||
            !!v.user ||
            !v.person ||
            (v.person === 'author' && !v.order)
          : !v.user || !!v.person || v.order !== undefined;
    if (
      invalid ||
      (v.submission && (!v.project || v.published)) ||
      (v.version && !v.project) ||
      (v.grant &&
        (v.kind !== 'cover' ||
          !v.project ||
          !v.version ||
          v.published ||
          v.submission))
    )
      c.addIssue({ code: 'custom', message: 'INVALID_MEDIA_TARGET' });
  });
export type VisualTarget = z.infer<typeof visualTargetSchema>;
export interface VisualImage {
  id: string;
  width: number;
  height: number;
  smallWidth: number;
  smallHeight: number;
  src: string;
  smallSrc: string;
}
export interface VisualState {
  image: VisualImage | null;
  revision: number;
  canEdit: boolean;
}
export const visualWriteSchema = z
  .object({
    target: visualTargetSchema,
    revision: z.number().int().min(0).max(2147483646),
    command: z.uuid(),
    framing: visualFramingSchema.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.target.published ||
      v.target.submission ||
      v.target.person ||
      v.target.grant ||
      (v.target.kind === 'cover' && !v.target.version) ||
      (v.target.kind === 'avatar' && (v.target.project || v.target.version))
    )
      c.addIssue({ code: 'custom', message: 'READ_ONLY_MEDIA_TARGET' });
  });
export function visualKey(target: VisualTarget) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(target)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}
