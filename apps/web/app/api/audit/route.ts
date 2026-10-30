import { governanceHandler } from '../../../governance/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => governanceHandler(req, 'audit');
export const POST = (req: Request) => governanceHandler(req, 'audit');
