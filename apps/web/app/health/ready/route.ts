import { infrastructureReadiness } from '@capstone/infrastructure';
import { serializeError } from '@capstone/domain';
import { createRequestId } from '@capstone/domain/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  const headers = { 'cache-control': 'no-store', 'x-request-id': requestId };
  try {
    const readiness = await infrastructureReadiness('web');
    return Response.json(readiness, {
      headers,
      status: readiness.status === 'infrastructure-ready' ? 200 : 503,
    });
  } catch (error) {
    return Response.json(serializeError(error, requestId), {
      status: 503,
      headers,
    });
  }
}
