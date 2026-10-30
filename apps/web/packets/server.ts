import 'server-only';
import {
  createPacketEngine,
  PacketError,
} from '@capstone/domain/packets-engine';
import { createNativeStorage } from '@capstone/storage/native';
import { DatabaseError } from '@capstone/db';
import type { PacketDraft } from '@capstone/domain/packets';
import { currentAccount } from '../auth/server';
let service: Promise<ReturnType<typeof createPacketEngine>> | undefined;
export function packets() {
  const root = process.env['WORKSPACE_ROOT'] ?? process.cwd(),
    env = process.env['APP_ENV'] ?? 'local';
  if (!['local', 'test', 'production'].includes(env))
    throw Error('INVALID_ENVIRONMENT');
  return (service ??= createNativeStorage(
    process.env['PRIVATE_STORAGE_ROOT'] ?? root + '/.local/storage',
    root,
    env as 'local' | 'test' | 'production',
  ).then((storage) =>
    createPacketEngine(process.env['DATABASE_URL'] ?? '', storage),
  ));
}
const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export async function packetHandler(req: Request) {
  try {
    const a = await currentAccount(req.headers);
    if (!a) return reply({ error: 'UNAUTHORIZED' }, 401);
    if (
      req.headers.has('X-Workspace-Actor') &&
      req.headers.get('X-Workspace-Actor') !== a.id
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const url = new URL(req.url);
    const service = await packets();
    if (req.method === 'GET') {
      if (
        [...url.searchParams.keys()].some(
          (k) => !['project', 'version'].includes(k),
        )
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      const project = url.searchParams.get('project') ?? '',
        version = url.searchParams.get('version') ?? '';
      return reply(
        (await service.fullFinalView(a, project, version)) ??
          (await service.view(a, project, version)),
      );
    }
    if (req.method !== 'POST')
      return reply({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (
      req.headers.get('Origin') !==
        new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000')
          .origin ||
      !req.headers.get('Content-Type')?.startsWith('application/json')
    )
      return reply({ error: 'FORBIDDEN' }, 403);
    const parts: Uint8Array[] = [];
    let size = 0;
    if (req.body)
      for await (const part of req.body) {
        size += part.length;
        if (size > 1048576) return reply({ error: 'INVALID_INPUT' }, 400);
        parts.push(part);
      }
    const b = JSON.parse(Buffer.concat(parts).toString('utf8')) as Record<
      string,
      unknown
    >;
    if (!b || typeof b !== 'object' || Array.isArray(b))
      return reply({ error: 'INVALID_INPUT' }, 400);
    const op = b['operation'];
    if (op === 'authorize-final') {
      const fields = [
        'operation',
        'project',
        'version',
        'revision',
        'hash',
        'acknowledged',
        'command',
      ];
      if (
        Object.keys(b).length !== fields.length ||
        Object.keys(b).some((k) => !fields.includes(k)) ||
        typeof b['project'] !== 'string' ||
        typeof b['version'] !== 'string' ||
        typeof b['command'] !== 'string' ||
        typeof b['revision'] !== 'number' ||
        typeof b['hash'] !== 'string' ||
        b['acknowledged'] !== true
      )
        return reply({ error: 'INVALID_INPUT' }, 400);
      return reply(
        await service.authorizeFinal(a, {
          project: b['project'],
          version: b['version'],
          revision: b['revision'],
          hash: b['hash'],
          acknowledged: true,
          command: b['command'],
        }),
      );
    }
    const fields =
      op === 'save'
        ? [
            'operation',
            'project',
            'version',
            'case',
            'revision',
            'body',
            'command',
          ]
        : op === 'authorize'
          ? [
              'operation',
              'project',
              'version',
              'case',
              'revision',
              'hash',
              'supersedes',
              'command',
            ]
          : op === 'revoke'
            ? [
                'operation',
                'project',
                'version',
                'packet',
                'revision',
                'reason',
                'command',
              ]
            : [];
    if (
      !fields.length ||
      Object.keys(b).length !== fields.length ||
      Object.keys(b).some((k) => !fields.includes(k)) ||
      ['project', 'version', 'command'].some((k) => typeof b[k] !== 'string') ||
      typeof b['revision'] !== 'number'
    )
      return reply({ error: 'INVALID_INPUT' }, 400);
    const common = {
      project: b['project'] as string,
      version: b['version'] as string,
      command: b['command'] as string,
      revision: b['revision'],
    };
    if (op === 'save' && typeof b['case'] === 'string')
      return reply(
        await service.save(a, {
          ...common,
          case: b['case'],
          body: b['body'] as PacketDraft,
        }),
      );
    if (
      op === 'authorize' &&
      typeof b['case'] === 'string' &&
      typeof b['hash'] === 'string' &&
      (b['supersedes'] === null || typeof b['supersedes'] === 'string')
    )
      return reply(
        await service.authorize(a, {
          ...common,
          case: b['case'],
          hash: b['hash'],
          supersedes: b['supersedes'],
        }),
      );
    if (
      op === 'revoke' &&
      typeof b['packet'] === 'string' &&
      typeof b['reason'] === 'string'
    )
      return reply(
        await service.revoke(a, {
          ...common,
          packet: b['packet'],
          reason: b['reason'],
        }),
      );
    return reply({ error: 'INVALID_INPUT' }, 400);
  } catch (e) {
    const state = e instanceof DatabaseError ? e.sqlState : '';
    if (e instanceof PacketError)
      return reply(
        { error: e.code, issues: e.issues },
        e.code === 'EVIDENCE_UNAVAILABLE' || e.code === 'INVALID_MANIFEST'
          ? 503
          : 400,
      );
    return reply(
      {
        error:
          state === 'P0002'
            ? 'NOT_FOUND'
            : state === '42501'
              ? 'FORBIDDEN'
              : state === '40001'
                ? 'CONFLICT'
                : state?.startsWith('22') || e instanceof SyntaxError
                  ? 'INVALID_INPUT'
                  : 'UNAVAILABLE',
      },
      state === 'P0002'
        ? 404
        : state === '42501'
          ? 403
          : state === '40001'
            ? 409
            : state?.startsWith('22') || e instanceof SyntaxError
              ? 400
              : 503,
    );
  }
}
