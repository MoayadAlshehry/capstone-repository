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
// Historical scenario exclusions are explicit in TESTING.md and test:inventory.
// Selected engineering results never promote the historical academic registry.
if (
  sourceExecutionDeferred &&
  process.env.CAPSTONE_TEST_POLICY_NOTICE !== 'shown'
) {
  process.env.CAPSTONE_TEST_POLICY_NOTICE = 'shown';
  process.stderr.write(
    '[test-policy] Historical TC-numbered scenarios are NOT_RUN by this engineering profile. Run corepack pnpm test:inventory and read TESTING.md; selected suite counts are not the full source count.\n',
  );
}
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
