import { readdir, readFile, readlink, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Refuse the supported Next writer while its output is being served. */
export function servesWebDirectory(appDirectory, cwd, args) {
  if (resolve(cwd) !== resolve(appDirectory)) return false;
  const server = resolve(appDirectory, 'server.mjs');
  return (
    args.some((arg) => arg === server) ||
    args[0]?.startsWith('next-server') ||
    (args.some((arg) => /next\/dist\/bin\/next$/.test(arg)) &&
      args.some((arg) => arg === 'start' || arg === 'dev'))
  );
}

export async function assertWebOutputIdle(appDirectory) {
  // The active working agreement runs implementation commands in Linux/WSL.
  // Preserve the historical Windows launcher without claiming a Windows probe.
  if (process.platform !== 'linux') return;
  const directory = await realpath(appDirectory);
  for (const entry of await readdir('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    let cwd, args;
    try {
      cwd = await readlink(`/proc/${entry}/cwd`);
      if (resolve(cwd) !== directory) continue;
      args = (await readFile(`/proc/${entry}/cmdline`, 'utf8'))
        .split('\0')
        .filter(Boolean);
    } catch (error) {
      if (['ENOENT', 'ESRCH', 'EACCES', 'EPERM'].includes(error.code)) continue;
      throw error;
    }
    if (servesWebDirectory(directory, cwd, args))
      throw new Error(
        `WEB_OUTPUT_IN_USE: process ${entry} serves ${directory}. Build in an isolated checkout and promote a verified artifact after a controlled web stop.`,
      );
  }
}
