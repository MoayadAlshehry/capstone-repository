import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const policy = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../docs/registries/validation-policy.json', import.meta.url),
    ),
    'utf8',
  ),
) as { sourceExecution: string };
export const sourceExecutionDeferred = policy.sourceExecution === 'deferred';
// Full thesis scenarios stay available for the owner's dedicated validation pass.
export const engineeringTestNames = sourceExecutionDeferred
  ? /^(?!.*\bTC[-_ ]?\d+\b).*$/i
  : undefined;

export const engineeringPhaseDirectory = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../docs/registries/phase-status.json', import.meta.url),
    ),
    'utf8',
  ),
)
  .current_phase.toLowerCase()
  .replace('_', '-') as string;
