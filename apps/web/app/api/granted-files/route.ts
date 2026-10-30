import { nativeFileHandler } from '../../../native-files/server';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => nativeFileHandler(request, 'granted');
export const HEAD = GET;
