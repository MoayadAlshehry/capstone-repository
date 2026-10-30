import { draftHandler } from '../../../../drafts/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = (r: Request) => draftHandler(r, true);
