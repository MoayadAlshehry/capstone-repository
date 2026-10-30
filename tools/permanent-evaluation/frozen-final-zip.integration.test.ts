import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { permanentFixture } from './fixture.js';
import { createNativeReadRepository } from '@capstone/db/native-reads';

it('uses the exact frozen FINAL scope for ZIP without widening any file access', async () => {
  const x = await permanentFixture(),
    reader = createNativeReadRepository(x.f.runtime);
  try {
    const p = await x.prepare('P5 frozen final permitted ZIP', 2),
      round = await x.academic.round(x.f.faculty.actor, p.submission);
    for (const actor of [
      x.f.lead.actor,
      x.f.author.actor,
      x.f.faculty.actor,
      x.f.admin,
    ]) {
      const direct = await reader.list(
          actor,
          round.project,
          round.version,
          p.submission,
        ),
        zip = await reader.list(
          { kind: 'internal-zip', actor },
          round.project,
          round.version,
          p.submission,
        );
      expect(zip.map((f) => [f.id, f.sha256])).toEqual(
        direct.map((f) => [f.id, f.sha256]),
      );
      expect(zip).toHaveLength(2);
      await expect(
        reader.list(
          { kind: 'internal-zip', actor },
          randomUUID(),
          round.version,
          p.submission,
        ),
      ).rejects.toThrow();
      await expect(
        reader.list(
          { kind: 'internal-zip', actor },
          round.project,
          randomUUID(),
          p.submission,
        ),
      ).rejects.toThrow();
      await expect(
        reader.list(
          { kind: 'internal-zip', actor },
          round.project,
          round.version,
          randomUUID(),
        ),
      ).rejects.toThrow();
    }
    await expect(
      reader.list({ kind: 'public' }, round.project, round.version),
    ).rejects.toThrow();
    await expect(
      reader.list(
        { kind: 'internal-zip', actor: x.f.platform },
        round.project,
        round.version,
        p.submission,
      ),
    ).rejects.toThrow();
  } finally {
    await reader.close();
    await x.close();
  }
});
