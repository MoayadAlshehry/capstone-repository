import { visualMediaHandler } from '../../../../visual-media/server';
export const runtime = 'nodejs';
export const POST = (request: Request) =>
  visualMediaHandler(request, 'resolve');
