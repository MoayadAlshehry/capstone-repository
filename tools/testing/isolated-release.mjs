import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { verifyOwned } from '../../scripts/verify-owned.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)).replace(
  /\/$/,
  '',
);
if (process.cwd() !== root || process.argv.length !== 2)
  throw Error(
    'Run from the owned installation; arbitrary targets/arguments are not accepted.',
  );
const { state, proof } = await verifyOwned();
const cfg = JSON.parse(await readFile('.local/database/config.json', 'utf8'));
if (cfg.workspaceRoot !== root || cfg.developmentPort !== state.ports.db)
  throw Error('FOREIGN_DATABASE_FIXTURE_REFUSED');
console.log(
  'OPT_IN_ISOLATED_ENGINEERING | Historical TC scenarios remain NOT_RUN; selected release integration only.',
);
const env = {
  ...process.env,
  APP_ENV: 'local',
  PERMANENT_QA_MAILPIT_SMTP_PORT: String(state.ports.smtp),
  PERMANENT_QA_MAILPIT_HTTP_PORT: String(state.ports.mail_ui),
};
await mkdir('.local/public-checks', { recursive: true, mode: 0o700 });
const started = Date.now();
const child = spawn(
  'corepack',
  [
    'pnpm',
    'exec',
    'vitest',
    'run',
    '--config',
    'config/testing/vitest.release.config.ts',
    '--reporter=json',
    '--outputFile=.local/public-checks/isolated-release-results.json',
  ],
  { cwd: root, env, stdio: 'inherit', shell: false },
);
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});
await writeFile(
  '.local/public-checks/isolated-release-receipt.json',
  JSON.stringify(
    {
      outcome: code === 0 ? 'PASS_SELECTED_SUITE' : 'FAIL',
      exit: code,
      milliseconds: Date.now() - started,
      target_ownership_verified: proof,
      historical_source_scenarios: 'NOT_RUN',
      fixture_databases:
        'Separately disposable on the owned local PostgreSQL service',
    },
    null,
    2,
  ),
);
process.exitCode = code ?? 1;
