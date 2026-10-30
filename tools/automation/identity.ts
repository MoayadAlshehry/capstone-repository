import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
export interface Identity {
  pid: number;
  start: string;
  executable: string;
  command: string;
}
const exec = promisify(execFile);
export async function processIdentity(pid: number): Promise<Identity | null> {
  if (!Number.isInteger(pid) || pid < 1) return null;
  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if($p){@{pid=$p.ProcessId;start=$p.CreationDate.ToUniversalTime().ToString('o');executable=$p.ExecutablePath;command=$p.CommandLine}|ConvertTo-Json -Compress}`,
        ],
        { timeout: 6000, windowsHide: true },
      );
      if (!stdout.trim()) return null;
      return JSON.parse(stdout) as Identity;
    } catch {
      return null;
    }
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return {
      pid,
      start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]!,
      executable: await realpath(`/proc/${pid}/exe`),
      command: (await readFile(`/proc/${pid}/cmdline`, 'utf8'))
        .replaceAll('\0', ' ')
        .trim(),
    };
  } catch {
    try {
      const a = await exec('ps', ['-p', String(pid), '-o', 'lstart='], {
        timeout: 5000,
      });
      const b = await exec('ps', ['-p', String(pid), '-o', 'args='], {
        timeout: 5000,
      });
      const c = await exec('ps', ['-p', String(pid), '-o', 'comm='], {
        timeout: 5000,
      });
      if (!a.stdout.trim()) return null;
      return {
        pid,
        start: a.stdout.trim(),
        command: b.stdout.trim(),
        executable: c.stdout.trim(),
      };
    } catch {
      return null;
    }
  }
}
export function sameIdentity(a: Identity, b: Identity | null) {
  return (
    !!b &&
    a.pid === b.pid &&
    a.start === b.start &&
    a.executable === b.executable &&
    a.command === b.command
  );
}
export async function windowsChildren(pid: number): Promise<Identity[]> {
  try {
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `@(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${pid}'|ForEach-Object{@{pid=$_.ProcessId;start=$_.CreationDate.ToUniversalTime().ToString('o');executable=$_.ExecutablePath;command=$_.CommandLine}})|ConvertTo-Json -Compress`,
      ],
      { timeout: 6000, windowsHide: true },
    );
    if (!stdout.trim()) return [];
    const data = JSON.parse(stdout) as Identity | Identity[];
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}
export async function terminateOwnedTree(owner: Identity) {
  if (!sameIdentity(owner, await processIdentity(owner.pid))) return false;
  if (process.platform !== 'win32') {
    try {
      process.kill(-owner.pid, 'SIGKILL');
      return true;
    } catch {
      return false;
    }
  }
  const descendants: Identity[] = [];
  const queue = [owner.pid];
  for (let index = 0; index < queue.length && index < 100; index++) {
    for (const child of await windowsChildren(queue[index]!)) {
      descendants.push(child);
      queue.push(child.pid);
    }
  }
  if (!sameIdentity(owner, await processIdentity(owner.pid))) return false;
  for (const child of descendants.reverse())
    if (sameIdentity(child, await processIdentity(child.pid)))
      try {
        process.kill(child.pid, 'SIGKILL');
      } catch {
        /* already ended */
      }
  if (sameIdentity(owner, await processIdentity(owner.pid)))
    try {
      process.kill(owner.pid, 'SIGKILL');
    } catch {
      /* already ended */
    }
  return true;
}
