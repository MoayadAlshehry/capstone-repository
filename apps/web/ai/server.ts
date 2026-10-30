import 'server-only';
import { DatabaseError } from '@capstone/db';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import {
  aiEnabled,
  owner,
  checkRate,
  namespace,
  hasCommitteeContext,
} from './runtime';
import { requestSchema, generationDeadlineMs } from './core';
import { AIError, type AIEvent } from './types';
import { scope } from './sources';
import { assertCurrentGeneration } from './generation';
import { ask, snapshot, cachedSnapshot } from './service';
import { smartDiscovery, beginWarm, warmStatus } from './catalogue';
import { unifiedSearch, projectSearchResult } from './unified-search';
const headers = {
  ...privateFileHeaders,
  'Content-Security-Policy': "default-src 'none'",
};
function status(error: unknown) {
  if (error instanceof AIError) return error;
  if (
    (error instanceof DatabaseError &&
      ['P0002', '42501'].includes(error.sqlState ?? '')) ||
    (error instanceof Error && error.message === 'NOT_FOUND')
  )
    return new AIError('NOT_FOUND', 404);
  if (error instanceof Error && /TimeoutError/.test(error.name))
    return new AIError('TIMED_OUT', 504);
  if (error instanceof Error && /AbortError/.test(error.name))
    return new AIError('CANCELLED', 499);
  if (error instanceof Error && error.name === 'ZodError')
    return new AIError('INVALID_OUTPUT', 422);
  return new AIError('UNAVAILABLE');
}
function assertOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin &&
      origin !== new URL(process.env['AUTH_BASE_URL'] ?? request.url).origin) ||
    (request.method === 'POST' && !origin)
  )
    throw new AIError('FORBIDDEN', 403);
  if (hasCommitteeContext(request.headers))
    throw new AIError('REVIEW_CONTEXT_RESTRICTED', 403);
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AIError('INVALID_INPUT', 400);
  if (Number(request.headers.get('content-length') ?? '0') > 24000)
    throw new AIError('INVALID_INPUT', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AIError('INVALID_INPUT', 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 24000) throw new AIError('INVALID_INPUT', 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AIError('INVALID_INPUT', 400);
  }
}
export async function aiGET(request: Request) {
  try {
    assertOrigin(request);
    if (!(await aiEnabled())) {
      owner.queue.cancelAll();
      return Response.json(
        { enabled: false, code: 'DISABLED' },
        { status: 404, headers },
      );
    }
    const account = await currentAccount(request.headers);
    checkRate(
      account?.id ??
        request.headers.get('x-capstone-public-visitor-key') ??
        'local',
      false,
    );
    const q = new URL(request.url).searchParams;
    if (q.get('status') === '1' && q.size === 1) {
      await assertCurrentGeneration();
      return Response.json(
        {
          enabled: true,
          context: namespace(),
          ...(account?.role === 'platform_admin'
            ? { preparation: warmStatus() }
            : {}),
        },
        { headers },
      );
    }
    if (
      [...q.keys()].some(
        (k) => !['project', 'locale', 'version', 'briefSize'].includes(k),
      ) ||
      q.getAll('project').length !== 1 ||
      q.getAll('locale').length !== 1 ||
      q.getAll('version').length > 1 ||
      q.getAll('briefSize').length > 1 ||
      (q.has('briefSize') &&
        !['compact', 'standard', 'hero'].includes(q.get('briefSize')!)) ||
      (q.has('version') && !/^[a-f0-9-]{36}$/i.test(q.get('version')!)) ||
      !requestSchema.safeParse({
        action: 'snapshot',
        project: q.get('project'),
        locale: q.get('locale'),
        ...(q.has('version') ? { version: q.get('version') } : {}),
      }).success ||
      !['en', 'ar'].includes(q.get('locale') ?? '')
    )
      throw new AIError('INVALID_INPUT', 400);
    const s = await scope(q.get('project')!, account);
    if (q.has('version') && q.get('version') !== s.project.version)
      throw new AIError('SOURCE_CHANGED', 409);
    const hit = await cachedSnapshot(
      s,
      q.get('locale') as 'en' | 'ar',
      account,
      (q.get('briefSize') ?? 'standard') as import('./types').BriefSize,
    );
    return Response.json(
      { enabled: true, snapshot: hit, cache: !!hit },
      { headers },
    );
  } catch (e) {
    const err = status(e);
    return Response.json({ code: err.code }, { status: err.status, headers });
  }
}
export async function aiPOST(request: Request) {
  try {
    assertOrigin(request);
    if (!(await aiEnabled())) {
      owner.queue.cancelAll();
      throw new AIError('DISABLED', 404);
    }
    const account = await currentAccount(request.headers),
      raw = await body(request);
    if (
      raw &&
      typeof raw === 'object' &&
      Object.keys(raw).length === 1 &&
      'action' in raw &&
      raw.action === 'prepare'
    ) {
      if (account?.role !== 'platform_admin')
        throw new AIError('FORBIDDEN', 403);
      beginWarm();
      return Response.json(
        { preparation: warmStatus() },
        { status: 202, headers },
      );
    }
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) throw new AIError('INVALID_INPUT', 400);
    const input = parsed.data;
    checkRate(
      account?.id ??
        request.headers.get('x-capstone-public-visitor-key') ??
        'local',
      input.action !== 'searchView',
    );
    // Authorize before opening the streaming response; rechecks also occur before every answer/citation.
    if (input.action === 'snapshot' || input.action === 'ask') {
      const authorized = await scope(input.project, account);
      if (input.version && input.version !== authorized.project.version)
        throw new AIError('SOURCE_CHANGED', 409);
    }
    const controller = new AbortController(),
      signal = AbortSignal.any([controller.signal, request.signal]);
    let closed = false,
      pulse: ReturnType<typeof setInterval> | undefined;
    const requestStarted = performance.now();
    let generationStarted = false;
    let deadline = setTimeout(
      () => controller.abort(new AIError('TIMED_OUT', 504)),
      120000,
    );
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        const emit = async (event: AIEvent) => {
          if (
            input.action === 'ask' &&
            !generationStarted &&
            event.type === 'status' &&
            event.state === 'generating'
          ) {
            generationStarted = true;
            clearTimeout(deadline);
            deadline = setTimeout(
              () => controller.abort(new AIError('TIMED_OUT', 504)),
              generationDeadlineMs(
                input.effort,
                performance.now() - requestStarted,
              ),
            );
          }
          if (
            closed ||
            request.signal.aborted ||
            (signal.aborted && event.type !== 'error')
          )
            throw new AIError('CANCELLED', 499);
          streamController.enqueue(
            encoder.encode('data: ' + JSON.stringify(event) + '\n\n'),
          );
        };
        pulse = setInterval(() => {
          if (!closed && !signal.aborted)
            streamController.enqueue(encoder.encode(': keep-alive\n\n'));
        }, 15000);
        let insufficient = false;
        const send = async (event: AIEvent) => {
          if (event.type === 'status' && event.state === 'insufficient')
            insufficient = true;
          await emit(event);
        };
        const task = async () => {
          if (input.action === 'ask') await ask(input, account, signal, send);
          else if (input.action === 'search')
            await unifiedSearch(input, account, signal, send);
          else if (input.action === 'searchView')
            await projectSearchResult(input, account, signal, send);
          else if (input.action === 'discover')
            await smartDiscovery(
              input.query,
              input.locale,
              account,
              signal,
              send,
            );
          else {
            const start = performance.now();
            const existing = await cachedSnapshot(
              await scope(input.project, account),
              input.locale,
              account,
              input.briefSize,
            );
            if (!existing)
              await emit({
                type: 'status',
                state: owner.queue.state.active ? 'queued' : 'generating',
              });
            const result = existing
              ? { snapshot: existing, cache: true, stats: null }
              : await snapshot(
                  input.project,
                  input.locale,
                  account,
                  signal,
                  false,
                  input.briefSize,
                  emit,
                );
            await emit({ type: 'result', value: result });
            await emit({
              type: 'metrics',
              value: {
                cache: result.cache,
                totalMs: performance.now() - start,
                ...(result.stats ?? {}),
              },
            });
          }
          if (!insufficient) await emit({ type: 'status', state: 'completed' });
          await emit({ type: 'done' });
        };
        void task()
          .catch(async (error) => {
            if (!closed && !request.signal.aborted) {
              const e =
                controller.signal.reason instanceof AIError
                  ? controller.signal.reason
                  : status(error);
              const state =
                e.code === 'CANCELLED'
                  ? 'cancelled'
                  : ['TIMED_OUT', 'DEADLINE_BEFORE_REPAIR'].includes(e.code)
                    ? 'timed-out'
                    : ['BUSY', 'RATE_LIMITED'].includes(e.code)
                      ? 'busy'
                      : [
                            'INVALID_OUTPUT',
                            'OUTPUT_TRUNCATED',
                            'FORMAT_VALIDATION_FAILED',
                            'INCOMPLETE_ANSWER',
                            'UNSUPPORTED_CLAIM',
                            'UNSUPPORTED_QUOTE',
                            'UNSUPPORTED_CITATION',
                            'TOOL_LIMIT',
                            'INVALID_TOOL_INPUT',
                          ].includes(e.code)
                        ? 'invalid-output'
                        : 'offline';
              await emit({
                type: 'error',
                code: e.code,
                state,
                ...(typeof e.diagnostic?.['correlation'] === 'string'
                  ? { requestId: e.diagnostic['correlation'] }
                  : {}),
              }).catch(() => undefined);
            }
          })
          .finally(() => {
            if (pulse) clearInterval(pulse);
            clearTimeout(deadline);
            if (!closed) {
              closed = true;
              streamController.close();
            }
          });
      },
      cancel() {
        closed = true;
        controller.abort();
        if (pulse) clearInterval(pulse);
        clearTimeout(deadline);
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch (e) {
    const err = status(e);
    return Response.json({ code: err.code }, { status: err.status, headers });
  }
}
