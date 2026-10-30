import 'server-only';
import { readFile, lstat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { AIError } from './types';
/** The existing demo pointer/fence is the reset authority. Checking only a
 * process's old DB URL would allow an in-flight answer during cutover. */
export async function assertCurrentGeneration() {
  if (process.env['P53_DEMO_ENVIRONMENT'] !== 'true') return;
  const root = process.env['CAPSTONE_DEMO_PRIVATE'];
  if (!root || !isAbsolute(root)) throw new AIError('SOURCE_CHANGED', 409);
  try {
    const paths = [
      resolve(root, 'current.json'),
      resolve(root, 'maintenance.json'),
    ];
    for (const path of paths) {
      const s = await lstat(path);
      if (!s.isFile() || s.isSymbolicLink() || s.mode & 0o077)
        throw new AIError('SOURCE_CHANGED', 409);
    }
    const current = JSON.parse(await readFile(paths[0]!, 'utf8')) as {
      database: string;
      storage: string;
      epoch: number;
    };
    const fence = JSON.parse(await readFile(paths[1]!, 'utf8')) as {
      maintenance: boolean;
      epoch: number;
    };
    const database = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(
      1,
    );
    if (
      fence.maintenance !== false ||
      fence.epoch !== current.epoch ||
      current.database !== database ||
      current.storage !== process.env['PRIVATE_STORAGE_ROOT']
    )
      throw new AIError('SOURCE_CHANGED', 409);
  } catch {
    throw new AIError('SOURCE_CHANGED', 409);
  }
}
