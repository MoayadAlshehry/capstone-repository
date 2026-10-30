import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createRuntimeDatabase } from '@capstone/db';
const cookieName = 'capstone.public-view.v1',
  uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie, User-Agent',
  'X-Content-Type-Options': 'nosniff',
};
let database: ReturnType<typeof createRuntimeDatabase> | undefined;
const db = () =>
  (database ??= createRuntimeDatabase(process.env['DATABASE_URL'] ?? ''));
const mac = (value: string) =>
  createHmac('sha256', process.env['AUTH_SECRET'] ?? '')
    .update('public-view-v1|' + value)
    .digest('base64url');
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
function visitor(request: NextRequest) {
  const value = request.cookies.get(cookieName)?.value ?? '',
    parts = value.split('.');
  return parts.length === 2 &&
    /^[A-Za-z0-9_-]{22}$/.test(parts[0]!) &&
    equal(parts[1]!, mac('cookie|' + parts[0]))
    ? parts[0]!
    : null;
}
function admitted(request: NextRequest) {
  const origin = process.env['AUTH_BASE_URL'] ?? '',
    ua = request.headers.get('user-agent') ?? '';
  return (
    !!process.env['AUTH_SECRET'] &&
    !!origin &&
    request.headers.get('host') === new URL(origin).host &&
    request.headers.get('sec-fetch-site') === 'same-origin' &&
    (!request.headers.get('origin') ||
      request.headers.get('origin') === origin) &&
    /(Chrome|Firefox|Safari|Edg)/i.test(ua) &&
    !/(bot|crawl|spider|headless|preview|monitor)/i.test(ua)
  );
}
/** Stateless two-second proof plus anonymous browser/day dedup; this is not an access capability. */
export async function engagement(request: NextRequest) {
  if (!admitted(request))
    return new NextResponse(null, { status: 204, headers });
  if (request.method === 'GET') {
    const project = request.nextUrl.searchParams.get('project') ?? '',
      version = request.nextUrl.searchParams.get('version') ?? '';
    if (
      request.nextUrl.searchParams.size !== 2 ||
      !uuid.test(project) ||
      !uuid.test(version)
    )
      return new NextResponse(null, { status: 400, headers });
    const id = visitor(request) ?? randomBytes(16).toString('base64url'),
      issued = Date.now(),
      nonce = issued + '.' + mac([id, project, version, issued].join('|'));
    const response = NextResponse.json({ nonce }, { headers });
    response.cookies.set(cookieName, id + '.' + mac('cookie|' + id), {
      httpOnly: true,
      secure: new URL(process.env['AUTH_BASE_URL']!).protocol === 'https:',
      sameSite: 'lax',
      path: '/',
      maxAge: 86400,
    });
    return response;
  }
  if (request.method !== 'POST')
    return new NextResponse(null, { status: 405, headers });
  if (
    request.headers.get('origin') !== process.env['AUTH_BASE_URL'] ||
    !request.headers.get('content-type')?.startsWith('application/json')
  )
    return new NextResponse(null, { status: 403, headers });
  const reader = request.body?.getReader();
  if (!reader) return new NextResponse(null, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 2048) {
        await reader.cancel();
        return new NextResponse(null, { status: 413, headers });
      }
      chunks.push(next.value);
    }
  } catch {
    return new NextResponse(null, { status: 400, headers });
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(bytes),
    ) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400, headers });
  }
  if (
    !body ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) => !['project', 'version', 'nonce'].includes(k),
    ) ||
    typeof body.project !== 'string' ||
    typeof body.version !== 'string' ||
    typeof body.nonce !== 'string' ||
    !uuid.test(body.project) ||
    !uuid.test(body.version) ||
    !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(body.nonce)
  )
    return new NextResponse(null, { status: 400, headers });
  const id = visitor(request),
    [time, signature] = body.nonce.split('.'),
    issued = Number(time),
    age = Date.now() - issued,
    network = request.headers.get('x-capstone-public-visitor-key') ?? '';
  if (
    !id ||
    !Number.isSafeInteger(issued) ||
    age < 2000 ||
    age > 300000 ||
    !signature ||
    !equal(
      signature,
      mac([id, body.project, body.version, issued].join('|')),
    ) ||
    !/^[a-f0-9]{64}$/.test(network)
  )
    return new NextResponse(null, { status: 204, headers });
  const day = new Date().toISOString().slice(0, 10),
    digest = createHmac('sha256', process.env['AUTH_SECRET']!)
      .update(
        ['public-view-dedup-v1', id, day, body.project, body.version].join('|'),
      )
      .digest('hex');
  try {
    await db().query('SELECT app.public_view_record($1,$2,$3,$4)', [
      body.project,
      body.version,
      digest,
      network,
    ]);
    return new NextResponse(null, { status: 204, headers });
  } catch {
    return new NextResponse(null, { status: 503, headers });
  }
}
