import { nativeFileHandler } from '../../../native-files/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const GET = (request: Request) => nativeFileHandler(request, 'public');
export const HEAD = GET;
