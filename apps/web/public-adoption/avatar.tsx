'use client';
import { useState } from 'react';
import { useVisualMedia } from '@capstone/ui/visual-media';
export function ArchivedAvatar({
  project,
  version,
  order,
  name,
}: {
  project: string;
  version: string;
  order: number;
  name: string;
}) {
  const media = useVisualMedia({
      kind: 'avatar',
      project,
      version,
      published: true,
      person: 'author',
      order,
    }),
    src = media.data?.image?.smallSrc,
    [failed, setFailed] = useState<string | null>(null);
  return src && src !== failed ? (
    <img src={src} alt="" onError={() => setFailed(src)} />
  ) : (
    <>
      {name
        .split(' ')
        .map((s) => s[0])
        .slice(0, 2)
        .join('')}
    </>
  );
}
