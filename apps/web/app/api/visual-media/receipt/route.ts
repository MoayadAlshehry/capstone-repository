import { visualMediaHandler } from '../../../../visual-media/server';
export const runtime = 'nodejs';
export const GET = (request: Request) => visualMediaHandler(request, 'receipt');
