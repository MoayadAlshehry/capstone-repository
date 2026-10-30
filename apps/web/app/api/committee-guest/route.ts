import { committeeHandler } from '../../../committee/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => committeeHandler(request);
export const POST = GET;
