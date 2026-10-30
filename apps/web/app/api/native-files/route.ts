import { nativeFileHandler } from '../../../native-files/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => nativeFileHandler(request);
export const HEAD = GET;
