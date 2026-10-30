import { nativeFileHandler } from '../../../native-files/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (r: Request) => nativeFileHandler(r, 'review');
export const HEAD = GET;
