import 'server-only';
import { createShowcaseEngine } from '@capstone/domain/showcase-engine';
import { currentAccount } from '../auth/server';
import { privateFileHeaders } from '../native-files/server';
let engine: ReturnType<typeof createShowcaseEngine> | undefined;
export function showcase() {
  return (engine ??= createShowcaseEngine(process.env['DATABASE_URL'] ?? ''));
}
export async function showcaseHandler(request: Request) {
  if (request.method !== 'GET')
    return Response.json(
      { code: 'METHOD_NOT_ALLOWED' },
      { status: 405, headers: privateFileHeaders },
    );
  try {
    const account = await currentAccount(request.headers);
    return Response.json(
      await showcase().read(new URL(request.url).searchParams, account),
      { headers: privateFileHeaders },
    );
  } catch (error) {
    const invalid =
      error instanceof Error && error.message === 'INVALID_FILTER';
    return Response.json(
      { code: invalid ? 'INVALID_PUBLIC_FILTER' : 'PUBLIC_UNAVAILABLE' },
      { status: invalid ? 400 : 503, headers: privateFileHeaders },
    );
  }
}
