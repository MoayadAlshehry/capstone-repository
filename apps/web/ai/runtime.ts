import 'server-only';
import { countSearchEndpoint } from './search-observer';
import {
  readFile,
  writeFile,
  mkdir,
  lstat,
  rename,
  open,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { freemem } from 'node:os';
import { execFile } from 'node:child_process';
import { AIError } from './types';
import {
  GENERATION_MODEL,
  EMBEDDING_MODEL,
  LIMITS,
  digest,
  unitVector,
} from './core';
export function dataDirectory() {
  const dir =
    process.env['CAPSTONE_AI_DATA_DIR'] ?? '';
  if (!isAbsolute(dir)) throw new AIError('AI_CONFIGURATION');
  for (const workspace of [process.cwd(), process.env['WORKSPACE_ROOT']].filter(
    (value): value is string => !!value,
  )) {
    const path = relative(resolve(/*turbopackIgnore: true*/ workspace), resolve(/*turbopackIgnore: true*/ dir));
    if (!path.startsWith('..') && !isAbsolute(path))
      throw new AIError('AI_CONFIGURATION');
  }
  return resolve(/*turbopackIgnore: true*/ dir);
}
export function hasCommitteeContext(headers: Headers) {
  return /(?:^|;\s*)capstone_committee_[a-f0-9-]+=/i.test(
    headers.get('cookie') ?? '',
  );
}
export async function aiEnabled(headers?: Headers) {
  if (headers && hasCommitteeContext(headers)) return false;
  if (process.env['AI_ENABLED'] !== 'true') return false;
  try {
    return (
      (
        JSON.parse(
          await readFile(resolve(dataDirectory(), 'control.json'), 'utf8'),
        ) as { enabled?: boolean }
      ).enabled !== false
    );
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT';
  }
}
export function namespace() {
  return digest([
    process.env['DATABASE_URL'],
    process.env['PRIVATE_STORAGE_ROOT'],
    'Q8_0',
    'ai-v1',
  ]).slice(0, 24);
}
export async function secureDirectory(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const s = await lstat(dir);
  if (
    !s.isDirectory() ||
    s.isSymbolicLink() ||
    s.mode & 0o077 ||
    (process.getuid && s.uid !== process.getuid())
  )
    throw new AIError('AI_CONFIGURATION');
}
export class DerivedStore {
  readonly root = resolve(dataDirectory(), namespace());
  private lru = new Map<string, { bytes: number; value: unknown }>();
  private bytes = 0;
  file(key: string, extension: string) {
    if (!/^[a-f0-9]{64}$/.test(key) || !['json', 'f32'].includes(extension))
      throw new AIError('INVALID_CACHE_KEY', 400);
    return resolve(this.root, key + '.' + extension);
  }
  async read<T>(key: string): Promise<T | null> {
    const hit = this.lru.get(key);
    if (hit) {
      this.lru.delete(key);
      this.lru.set(key, hit);
      return hit.value as T;
    }
    try {
      const path = this.file(key, 'json'),
        s = await lstat(path);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.size > 1_200_000 ||
        s.mode & 0o077
      )
        return null;
      const text = await readFile(path, 'utf8'),
        value = JSON.parse(text) as T;
      this.remember(key, value, Buffer.byteLength(text));
      return value;
    } catch {
      return null;
    }
  }
  private remember(key: string, value: unknown, bytes: number) {
    if (bytes > 700_000) return;
    const old = this.lru.get(key);
    if (old) this.bytes -= old.bytes;
    this.lru.delete(key);
    this.lru.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.bytes > 3_000_000 || this.lru.size > 12) {
      const first = this.lru.keys().next().value;
      if (!first) break;
      this.bytes -= this.lru.get(first)!.bytes;
      this.lru.delete(first);
    }
  }
  async write(key: string, value: unknown, vectors?: Float32Array[]) {
    await secureDirectory(dataDirectory());
    await secureDirectory(this.root);
    if (vectors)
      await this.atomic(
        this.file(key, 'f32'),
        Buffer.concat(
          vectors.map((v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength)),
        ),
      );
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text) > 1_200_000) throw new AIError('INDEX_LIMIT');
    await this.atomic(this.file(key, 'json'), text);
    this.remember(key, value, Buffer.byteLength(text));
  }
  private async atomic(path: string, bytes: string | Buffer) {
    const temp = path + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temp, bytes, { mode: 0o600, flag: 'wx' });
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
  }
  async vectors(key: string, count: number) {
    const path = this.file(key, 'f32'),
      s = await lstat(path);
    if (
      s.isSymbolicLink() ||
      !s.isFile() ||
      s.mode & 0o077 ||
      s.size !== count * 1024 * 4 ||
      count > LIMITS.chunks
    )
      throw new AIError('INVALID_VECTOR');
    const b = await readFile(path),
      all = new Float32Array(new Uint8Array(b).buffer);
    if (![...all].every(Number.isFinite)) throw new AIError('INVALID_VECTOR');
    return Array.from({ length: count }, (_, i) =>
      all.subarray(i * 1024, (i + 1) * 1024),
    );
  }
}
type Waiting = {
  key: string;
  background: boolean;
  controller: AbortController;
  subscribers: number;
  work: (signal: AbortSignal) => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  promise: Promise<unknown>;
};
export class AIQueue {
  private waiting: Waiting[] = [];
  private jobs = new Map<string, Waiting>();
  private active: Waiting | null = null;
  get state() {
    return {
      active: !!this.active,
      waiting: this.waiting.filter((x) => !x.background).length,
      ownerPID: process.pid,
    };
  }
  cancelAll() {
    for (const job of this.jobs.values()) job.controller.abort();
  }
  run<T>(
    key: string,
    work: (signal: AbortSignal) => Promise<T>,
    options: {
      signal?: AbortSignal;
      background?: boolean;
      queued?: (position: number) => void;
    } = {},
  ): Promise<T> {
    if (options.signal?.aborted)
      return Promise.reject(new AIError('CANCELLED', 499));
    let job = this.jobs.get(key);
    if (!job) {
      if (this.waiting.length >= LIMITS.queue)
        return Promise.reject(new AIError('BUSY', 429));
      let yes!: (v: unknown) => void, no!: (e: unknown) => void;
      const promise = new Promise<unknown>((resolve, reject) => {
        yes = resolve;
        no = reject;
      });
      job = {
        key,
        background: !!options.background,
        controller: new AbortController(),
        subscribers: 0,
        work,
        resolve: yes,
        reject: no,
        promise,
      };
      this.jobs.set(key, job);
      this.waiting.push(job);
    }
    job.subscribers++;
    if (!options.background) job.background = false;
    options.queued?.(
      this.active
        ? Math.max(
            1,
            this.waiting.filter((x) => !x.background).indexOf(job) + 1,
          )
        : 0,
    );
    const current = job;
    const result = new Promise<T>((resolve, reject) => {
      let settled = false;
      const release = () => {
        if (settled) return false;
        settled = true;
        current.subscribers--;
        options.signal?.removeEventListener('abort', cancel);
        return true;
      };
      const cancel = () => {
        if (release()) {
          if (!current.subscribers) {
            current.controller.abort();
            const index = this.waiting.indexOf(current);
            if (index >= 0) {
              this.waiting.splice(index, 1);
              this.jobs.delete(current.key);
              current.reject(new AIError('CANCELLED', 499));
            }
          }
          reject(new AIError('CANCELLED', 499));
        }
      };
      options.signal?.addEventListener('abort', cancel, { once: true });
      current.promise.then(
        (value) => {
          if (release()) resolve(value as T);
        },
        (e) => {
          if (release()) reject(e);
        },
      );
    });
    void this.drain();
    return result;
  }
  private async drain() {
    if (this.active) return;
    this.waiting.sort((a, b) => Number(a.background) - Number(b.background));
    const job = this.waiting.shift();
    if (!job) return;
    this.active = job;
    try {
      if (job.controller.signal.aborted) throw new AIError('CANCELLED', 499);
      job.resolve(await job.work(job.controller.signal));
    } catch (e) {
      job.reject(e);
    } finally {
      this.jobs.delete(job.key);
      this.active = null;
      void this.drain();
    }
  }
}
const stateKey = Symbol.for('capstone.ai-v1.owner');
type Owner = {
  queue: AIQueue;
  store: DerivedStore;
  rate: Map<string, number[]>;
  shutdownHandlerRegistered?: boolean;
};
const globalOwner = globalThis as typeof globalThis & { [stateKey]?: Owner };
export const owner = (globalOwner[stateKey] ??= {
  queue: new AIQueue(),
  store: new DerivedStore(),
  rate: new Map(),
});
// The owned web server emits this before draining HTTP connections. The
// process-wide owner aborts real upstream work so an active SSE cannot hold reset.
if (!owner.shutdownHandlerRegistered) {
  owner.shutdownHandlerRegistered = true;
  process.on('capstone.ai-v1.shutdown', () => owner.queue.cancelAll());
}
export function checkRate(key: string, inference: boolean) {
  const now = Date.now(),
    limit = inference ? 12 : 180,
    identity = key + (inference ? ':write' : ':read');
  if (!owner.rate.has(identity) && owner.rate.size >= 400) {
    for (const [k, v] of owner.rate)
      if (now - v.at(-1)! > 60_000) owner.rate.delete(k);
    if (owner.rate.size >= 400) throw new AIError('BUSY', 429);
  }
  const times = (owner.rate.get(identity) ?? []).filter(
    (t) => now - t < 60_000,
  );
  if (times.length >= limit) throw new AIError('RATE_LIMITED', 429);
  times.push(now);
  owner.rate.set(identity, times);
  if (owner.rate.size > 400)
    for (const [k, v] of owner.rate)
      if (now - v.at(-1)! > 60_000) owner.rate.delete(k);
}
export async function endpoint(
  path: '/v1/chat/completions' | '/v1/embeddings' | '/api/v1/chat',
  body: unknown,
  signal: AbortSignal,
) {
  const base = new URL(
      process.env['CAPSTONE_AI_BASE_URL'] ?? 'http://127.0.0.1:1234',
    ),
    ip = base.hostname;
  if (
    base.pathname !== '/' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.protocol !== 'http:' ||
    !isIP(ip) ||
    !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  )
    throw new AIError('AI_CONFIGURATION');
  const file =
      process.env['CAPSTONE_AI_TOKEN_FILE'] ?? '',
    stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new AIError('AI_CONFIGURATION');
  const token = (await readFile(file, 'utf8')).trim();
  await countSearchEndpoint();
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(LIMITS.generationMs)]),
  }).catch((e) => {
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    throw new AIError(
      e instanceof Error && /timeout/i.test(e.name) ? 'TIMED_OUT' : 'OFFLINE',
    );
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new AIError('OFFLINE');
  }
  return response;
}
export async function embed(
  texts: string[],
  signal: AbortSignal,
  query = false,
) {
  if (
    texts.length > LIMITS.embeddingBatch ||
    texts.some((t) => t.length > 3500)
  )
    throw new AIError('EMBEDDING_LIMIT');
  const r = await endpoint(
    '/v1/embeddings',
    {
      model: EMBEDDING_MODEL,
      input: texts.map((t) =>
        query
          ? 'Instruct: Given a question, retrieve the relevant passage that answers it.\nQuery: ' +
            t
          : t,
      ),
      encoding_format: 'float',
    },
    signal,
  );
  const data = (await r.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  if (!Array.isArray(data.data) || data.data.length !== texts.length)
    throw new AIError('INVALID_VECTOR');
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((row) => unitVector(row.embedding));
}
export type GenerationStats = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  modelFirstTokenMs?: number;
  tokensPerSecond?: number;
};
export async function generate(
  system: string,
  user: string,
  signal: AbortSignal,
  options: {
    maxTokens: number;
    reasoning?: 'off' | 'on';
    onStage?: (
      stage: 'prompt-processing' | 'reasoning' | 'composing',
    ) => Promise<void>;
    schema?: Record<string, unknown>;
    onText?: (text: string) => Promise<void>;
  },
) {
  if (system.length + user.length > LIMITS.promptCharacters + 4500)
    throw new AIError('PROMPT_LIMIT', 400);
  if (options.reasoning !== undefined)
    return generateNative(system, user, signal, options);
  const response = await endpoint(
    '/v1/chat/completions',
    {
      model: GENERATION_MODEL,
      temperature: 0,
      reasoning_effort: 'none',
      max_tokens: options.maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      ...(options.schema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'project_intelligence',
                strict: true,
                schema: options.schema,
              },
            },
          }
        : {}),
      stream: true,
      stream_options: { include_usage: true },
    },
    signal,
  );
  if (!response.body) throw new AIError('OFFLINE');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    content = '',
    finish: string | null = null;
  const stats: GenerationStats = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new AIError('CANCELLED', 499);
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, boundary).trim();
        pending = pending.slice(boundary + 1);
        if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]')
          continue;
        const data = JSON.parse(line.slice(5)) as {
          choices?: {
            delta?: { content?: string; reasoning_content?: string };
            finish_reason?: string;
          }[];
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            completion_tokens_details?: { reasoning_tokens?: number };
          };
        };
        if (data.usage) {
          stats.inputTokens = data.usage.prompt_tokens;
          stats.outputTokens = data.usage.completion_tokens;
          stats.reasoningTokens =
            data.usage.completion_tokens_details?.reasoning_tokens ?? 0;
        }
        for (const choice of data.choices ?? []) {
          if (choice.finish_reason) finish = choice.finish_reason;
          if (choice.delta?.reasoning_content)
            throw new AIError('REASONING_NOT_DISABLED');
          const text = choice.delta?.content;
          if (text) {
            content += text;
            if (content.length > 12_000) throw new AIError('OUTPUT_LIMIT');
            await options.onText?.(text);
          }
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (finish === 'length')
    throw new AIError('OUTPUT_TRUNCATED', 422, {
      stage: 'composition',
      finishReason: finish,
      ...stats,
    });
  if (!content.trim()) throw new AIError('INVALID_OUTPUT', 422);
  if (stats.reasoningTokens) throw new AIError('REASONING_NOT_DISABLED');
  return { content, stats, finishReason: finish ?? 'unknown' };
}

/** Native LM Studio adapter: reasoning text is discarded, never retained or emitted.
 * Installed Qwen exposes off/on (medium/high return HTTP400). Balanced/Deep
 * intentionally use on with different evidence and total-generation budgets. */
async function generateNative(
  system: string,
  user: string,
  signal: AbortSignal,
  options: {
    maxTokens: number;
    reasoning?: 'off' | 'on';
    onText?: (text: string) => Promise<void>;
    onStage?: (
      stage: 'prompt-processing' | 'reasoning' | 'composing',
    ) => Promise<void>;
  },
) {
  // Conservative mixed-language context estimate; leave room for formatting/output
  // within the already verified 16K context. Never silently lower requested effort.
  const prompt = system + user;
  const nonAscii = (prompt.match(/[^\x00-\x7f]/g) ?? []).length;
  const estimated =
    Math.ceil((prompt.length - nonAscii) / 2 + nonAscii * 1.5) + 256;
  if (estimated + options.maxTokens > 16000)
    throw new AIError('PROMPT_LIMIT', 400);
  const response = await endpoint(
    '/api/v1/chat',
    {
      model: GENERATION_MODEL,
      system_prompt: system,
      input: user,
      reasoning: options.reasoning,
      max_output_tokens: options.maxTokens,
      context_length: 16384,
      temperature: 0,
      store: false,
      stream: true,
    },
    signal,
  );
  if (!response.body) throw new AIError('OFFLINE');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    content = '',
    ended = false;
  const stats: GenerationStats = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted) throw new AIError('CANCELLED', 499);
      pending += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, boundary).trim();
        pending = pending.slice(boundary + 1);
        if (!line.startsWith('data:')) continue;
        const data = JSON.parse(line.slice(5)) as {
          type: string;
          content?: string;
          result?: { stats?: Record<string, number> };
          stats?: Record<string, number>;
        };
        if (data.type === 'error') throw new AIError('INVALID_OUTPUT', 422);
        if (data.type === 'prompt_processing.start')
          await options.onStage?.('prompt-processing');
        if (data.type === 'reasoning.start')
          await options.onStage?.('reasoning');
        if (data.type === 'message.start') await options.onStage?.('composing');
        // DO NOT store reasoning.delta or aggregated output (which contains reasoning).
        if (data.type === 'message.delta' && data.content) {
          content += data.content;
          if (content.length > 32000) throw new AIError('OUTPUT_LIMIT');
          await options.onText?.(data.content);
        }
        if (data.type === 'chat.end') {
          const usage = data.result?.stats ?? data.stats;
          if (!usage) throw new AIError('INVALID_OUTPUT', 422);
          stats.inputTokens = usage['input_tokens'] ?? 0;
          stats.outputTokens = usage['total_output_tokens'] ?? 0;
          stats.reasoningTokens = usage['reasoning_output_tokens'] ?? 0;
          stats.modelFirstTokenMs =
            (usage['time_to_first_token_seconds'] ?? 0) * 1000;
          stats.tokensPerSecond = usage['tokens_per_second'] ?? 0;
          ended = true;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!ended || !content.trim())
    throw new AIError(
      stats.outputTokens >= options.maxTokens
        ? 'OUTPUT_TRUNCATED'
        : 'INVALID_OUTPUT',
      422,
      {
        stage: stats.reasoningTokens ? 'reasoning' : 'generation',
        ended,
        finalCharacters: content.length,
        maxOutputTokens: options.maxTokens,
        ...stats,
      },
    );
  return { content, stats, finishReason: ended ? 'chat.end' : 'interrupted' };
}

let memory: { at: number; headroom: number } | null = null;
export async function precomputeAllowed() {
  if (process.memoryUsage().rss > 650_000_000 || freemem() < 600_000_000)
    return false;
  if (process.env['CAPSTONE_AI_WINDOWS_MEMORY_CHECK'] !== 'true') return true;
  if (!memory || Date.now() - memory.at > 30_000) {
    const headroom = await new Promise<number>((yes) =>
      execFile(
        '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory',
        ],
        { timeout: 10000, maxBuffer: 1000 },
        (e, out) =>
          yes(!e && /^\s*\d+\s*$/.test(out) ? Number(out.trim()) * 1024 : 0),
      ),
    );
    memory = { at: Date.now(), headroom };
  }
  return memory.headroom >= 850_000_000;
}
export async function inferenceLease<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  await secureDirectory(dataDirectory());
  const file = resolve(dataDirectory(), 'inference.lock');
  let fd: Awaited<ReturnType<typeof open>> | null = null;
  const started = Date.now();
  while (!fd) {
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    try {
      fd = await open(file, 'wx', 0o600);
      await fd.writeFile(
        JSON.stringify({
          pid: process.pid,
          started: (await readFile('/proc/self/stat', 'utf8'))
            .split(') ')[1]!
            .split(' ')[19],
          nonce: randomUUID(),
        }),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      try {
        const s = await lstat(file),
          value = JSON.parse(await readFile(file, 'utf8')) as {
            pid: number;
            started?: string;
          };
        if (
          s.isSymbolicLink() ||
          !s.isFile() ||
          s.mode & 0o077 ||
          !Number.isInteger(value.pid)
        )
          throw new AIError('AI_CONFIGURATION');
        try {
          process.kill(value.pid, 0);
          const started = (
            await readFile('/proc/' + value.pid + '/stat', 'utf8')
          )
            .split(') ')[1]!
            .split(' ')[19];
          if (
            value.started &&
            value.started !== started &&
            (await lstat(file)).ino === s.ino
          )
            await unlink(file);
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code === 'ESRCH' &&
            (await lstat(file)).ino === s.ino
          )
            await unlink(file);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (Date.now() - started > 60000) throw new AIError('BUSY', 429);
      await new Promise<void>((yes) => setTimeout(yes, 100));
    }
  }
  const inode = (await fd.stat()).ino;
  try {
    return await work();
  } finally {
    await fd.close();
    if ((await lstat(file).catch(() => null))?.ino === inode)
      await unlink(file);
  }
}
