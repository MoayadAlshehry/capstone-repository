import 'server-only';
import {
  createEvaluationEngine,
  EvaluationError,
} from '@capstone/domain/evaluations-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { submissionUuid, type AssessmentCommand } from '@capstone/domain';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
import { privateReadError } from '../semester/private-read-error';
let service: Promise<ReturnType<typeof createEvaluationEngine>> | undefined;
export function evaluations() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    environment = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(environment))
    throw Error('INVALID_ENVIRONMENT');
  service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    environment as 'local' | 'test' | 'production',
  ).then((storage) =>
    createEvaluationEngine(process.env['DATABASE_URL'] ?? '', storage),
  );
  return service;
}
const reply = (status: number, body: unknown) =>
  Response.json(body, { status, headers: privateFileHeaders });
export async function evaluationHandler(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return reply(403, { code: 'FORBIDDEN' });
    const actor = await currentAccount(request.headers);
    if (!actor) return reply(404, { code: 'NOT_FOUND' });
    const engine = await evaluations();
    if (request.method === 'GET') {
      const url = new URL(request.url),
        sub = url.searchParams.get('submission');
      if (url.searchParams.size !== 1 || !submissionUuid(sub))
        return reply(400, { code: 'INVALID_INPUT' });
      return reply(200, await engine.read(actor, sub));
    }
    if (request.method !== 'POST')
      return reply(405, { code: 'METHOD_NOT_ALLOWED' });
    if (
      request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
      !request.headers.get('content-type')?.startsWith('application/json')
    )
      return reply(403, { code: 'FORBIDDEN' });
    const reader = request.body?.getReader();
    if (!reader) return reply(400, { code: 'INVALID_INPUT' });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > 131072) {
          await reader.cancel();
          return reply(400, { code: 'INVALID_INPUT' });
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const c = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks)),
    ) as Record<string, unknown>;
    const keys = [
      'submission',
      'revision',
      'assignmentRevision',
      'command',
      'layer',
      'criteria',
      'overall',
      'calibration',
      'members',
      'assessedOn',
      'attestation',
    ];
    if (
      !c ||
      typeof c !== 'object' ||
      Array.isArray(c) ||
      Object.keys(c).some((k) => !keys.includes(k))
    )
      return reply(400, { code: 'INVALID_INPUT' });
    return reply(
      200,
      await engine.finalize(actor, c as unknown as AssessmentCommand),
    );
  } catch (e) {
    if (request.method === 'GET') {
      const failure = privateReadError(e);
      return reply(failure.status, { code: failure.code });
    }
    if (e instanceof EvaluationError)
      return reply(409, { code: e.code, issues: e.issues });
    return reply(409, {
      code: 'ASSESSMENT_UNAVAILABLE',
    });
  }
}
