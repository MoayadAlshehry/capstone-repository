import { authentication } from '../../../../auth/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return authentication().handler(request);
}
export async function POST(request: Request) {
  return authentication().handler(request);
}
