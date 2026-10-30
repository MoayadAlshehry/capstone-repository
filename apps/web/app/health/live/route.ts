import { foundationReadiness } from '@capstone/domain';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(foundationReadiness('web'), {
    headers: { 'cache-control': 'no-store' },
  });
}
