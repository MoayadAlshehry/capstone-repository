import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  sourceExecutionDeferred,
  engineeringPhaseDirectory,
} from '../testing/source-policy.js';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import {
  processIdentity,
  terminateOwnedTree,
  type Identity,
} from './identity.js';

export type Outcome =
  'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_AVAILABLE' | 'NOT_RUN' | 'N/A';
export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const hash = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');
export const workspaceId = (workspace: string) => hash(resolve(workspace));
export function engineeringEvidencePath(path: string) {
  if (
    sourceExecutionDeferred &&
    path.startsWith(join(root, '.local/evidence-raw'))
  )
    return path.replace(
      /([\\/])\.local([\\/])evidence-raw([\\/])phase-(0[1-9]|1\d|2[0-5])(?=[\\/])/,
      `$1.local$2evidence-raw$3${engineeringPhaseDirectory}$3engineering-regressions$3phase-$4`,
    );
  return path;
}
export async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(engineeringEvidencePath(path), 'utf8')) as T;
}
export async function saveJson(path: string, value: unknown) {
  path = engineeringEvidencePath(path);
  if (
    path.endsWith('/docs/registries/acceptance-status.json') &&
    sourceExecutionDeferred
  )
    throw Error('Historical source registry is read-only');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}
export function contained(base: string, child: string) {
  const path = resolve(base, child);
  const rel = relative(resolve(base), path);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new Error('Path escapes the declared workspace/namespace.');
  return path;
}
export async function noLinks(base: string, path: string) {
  const target = contained(base, path);
  let cursor = target;
  while (cursor !== resolve(base)) {
    try {
      if ((await lstat(cursor)).isSymbolicLink())
        throw new Error('Symlink/junction artifact refused.');
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    }
    cursor = dirname(cursor);
  }
  return target;
}
export interface CommandResult {
  pid?: number | null;
  command: string;
  exitCode: number | null;
  outcome: Outcome;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  logPath: string;
}
export type Execute = (
  executable: string,
  args: string[],
  options?: {
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    logPath?: string;
  },
) => Promise<CommandResult>;
export const execute: Execute = async (executable, args, options = {}) => {
  const start = Date.now();
  const cwd = options.cwd ?? root;
  const timeout = options.timeoutMs ?? 30000;
  const logPath =
    options.logPath ??
    join(
      cwd,
      '.local/automation/diagnostics',
      `${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
  await mkdir(dirname(logPath), { recursive: true });
  return await new Promise<CommandResult>((done) => {
    let stdout = '',
      stderr = '',
      timedOut = false,
      settled = false;
    const child = spawn(executable, args, {
      cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    let fact: Identity | null = null;
    if (child.pid)
      void processIdentity(child.pid).then((value) => {
        fact = value;
      });
    const finish = async (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await writeFile(logPath, stdout + '\n' + stderr);
      done({
        pid: child.pid ?? null,
        command: [executable, ...args].join(' '),
        exitCode,
        outcome: timedOut ? 'BLOCKED' : exitCode === 0 ? 'PASS' : 'FAIL',
        timedOut,
        durationMs: Date.now() - start,
        stdout,
        stderr,
        logPath,
      });
    };
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      void (async () => {
        if (fact) await terminateOwnedTree(fact);
        else child.kill('SIGKILL');
        child.stdout?.destroy();
        child.stderr?.destroy();
        await finish(null);
      })();
    }, timeout);
    child.once('error', () => {
      stderr += 'Subprocess unavailable or could not start.';
      void finish(null);
    });
    child.once('close', (code) => {
      void finish(code);
    });
  });
};
export async function corepackFile() {
  for (const candidate of [
    join(dirname(process.execPath), 'node_modules/corepack/dist/corepack.js'),
    resolve(
      dirname(process.execPath),
      '../lib/node_modules/corepack/dist/corepack.js',
    ),
  ]) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      /* try next normal layout */
    }
  }
  throw new Error(
    'Native Corepack entry not found; use the documented Node/Corepack prerequisite, without global configuration changes.',
  );
}
export async function pnpm(
  args: string[],
  options: Parameters<Execute>[2] = {},
) {
  return execute(
    process.execPath,
    [await corepackFile(), 'pnpm', ...args],
    options,
  );
}
export async function portFree(port: number) {
  return await new Promise<boolean>((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => server.close(() => done(true)));
  });
}
export async function httpReady(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return response.status === 200;
  } catch {
    return false;
  }
}
export function phaseNumber(value: string | undefined) {
  if (
    !value ||
    !/^\d{1,2}$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > 40
  )
    throw new Error('Phase must be an integer 01..40.');
  return Number(value);
}
export function aggregate(outcomes: Outcome[]): Outcome {
  if (outcomes.length === 0) return 'BLOCKED';
  if (outcomes.includes('FAIL')) return 'FAIL';
  if (
    outcomes.some((value) => value === 'BLOCKED' || value === 'NOT_AVAILABLE')
  )
    return 'BLOCKED';
  if (outcomes.includes('NOT_RUN')) return 'NOT_RUN';
  return outcomes.every((value) => value === 'PASS' || value === 'N/A')
    ? 'PASS'
    : 'BLOCKED';
}
export async function walk(
  base: string,
  ignored = new Set([
    'node_modules',
    '.git',
    '.local',
    '.pnpm-store',
    '.next',
    'dist',
    'coverage',
  ]),
): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(base, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Symlink source input refused.');
    if (entry.isDirectory()) result.push(...(await walk(path, ignored)));
    else result.push(path);
  }
  return result.sort();
}
