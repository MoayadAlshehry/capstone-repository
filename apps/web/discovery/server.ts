import 'server-only';
import { createDiscoveryEngine } from '@capstone/domain/discovery-engine';
let engine: ReturnType<typeof createDiscoveryEngine> | undefined;
export function discovery() {
  return (engine ??= createDiscoveryEngine(process.env['DATABASE_URL'] ?? ''));
}
export function searchParams(
  values: Record<string, string | string[] | undefined>,
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values))
    if (Array.isArray(v)) for (const x of v) p.append(k, x);
    else if (v !== undefined) p.append(k, v);
  return p;
}
export function publicOrigin() {
  const url = new URL(process.env['AUTH_BASE_URL'] ?? 'http://localhost:3000');
  return url.origin;
}
