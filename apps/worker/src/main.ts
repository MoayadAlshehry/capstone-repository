import { createServer } from 'node:http';
import { loadAccountMailConfig } from '@capstone/config/account-mail';
import { createAccountMailWorker } from '@capstone/infrastructure/account-mail-worker';
import { createCommitteeMailWorker } from '@capstone/infrastructure/committee-mail';
import { createEvaluationEventWorker } from '@capstone/infrastructure/evaluation-events';
import { createPublicViewsMaintenance } from '@capstone/infrastructure/public-views';
import { createNativeStorage } from '@capstone/storage/native';
import {
  loadServerConfig,
  loadInfrastructureConfig,
} from '@capstone/config/server';
import {
  createGovernanceWorker,
  JOBS,
} from '@capstone/infrastructure/governance-worker';
try {
  const config = loadServerConfig(3002),
    infra = loadInfrastructureConfig();
  const worker = await createGovernanceWorker({
    jobDatabaseUrl: process.env['JOB_DATABASE_URL'] ?? '',
    storageRoot: infra.storageRoot,
    workspaceRoot: config.WORKSPACE_ROOT,
    environment: config.APP_ENV,
    legacyAllocation: false,
  });
  const mail = createAccountMailWorker(
    process.env['JOB_DATABASE_URL'] ?? '',
    loadAccountMailConfig(),
  );
  const committeeMail = createCommitteeMailWorker(
    process.env['JOB_DATABASE_URL'] ?? '',
    loadAccountMailConfig(),
  );
  const originals = await createNativeStorage(
    infra.storageRoot,
    config.WORKSPACE_ROOT,
    config.APP_ENV,
  );
  const evaluationEvents = createEvaluationEventWorker(
    process.env['JOB_DATABASE_URL'] ?? '',
    async (f) =>
      originals.verify(f.key, { size: Number(f.size), sha256: f.sha256 }),
  );
  const publicViews = createPublicViewsMaintenance(
    process.env['JOB_DATABASE_URL'] ?? '',
  );
  const server = createServer((req, res) => {
    void (async () => {
      const ready = await worker.ready();
      await mail.ready();
      await committeeMail.ready();
      await evaluationEvents.ready();
      if (!(await publicViews.ready()))
        throw Error('PUBLIC_METRICS_SCHEMA_UNAVAILABLE');
      res.writeHead(
        req.url === '/health/ready' || req.url === '/health/live'
          ? ready
            ? 200
            : 503
          : 404,
        { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      );
      res.end(
        JSON.stringify({
          service: 'worker',
          phase: 'PHASE_32',
          status: ready ? 'infrastructure-ready' : 'unavailable',
          jobs: [...JOBS],
        }),
      );
    })().catch(() => {
      res.writeHead(503);
      res.end('{"status":"unavailable"}');
    });
  });
  if (process.argv.includes('--once')) {
    await worker.close();
    await mail.close();
    await committeeMail.close();
    await evaluationEvents.close();
    await publicViews.close();
  } else {
    await new Promise<void>((resolve) =>
      server.listen(config.SERVICE_PORT, config.BIND_HOST, resolve),
    );
    console.log(
      JSON.stringify({
        service: 'worker',
        status: 'infrastructure-ready',
        jobs: [...JOBS],
      }),
    );
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        server.close();
        void Promise.all([
          worker.close(),
          mail.close(),
          committeeMail.close(),
          evaluationEvents.close(),
          publicViews.close(),
        ]).then(() => process.exit(0));
      });
  }
} catch {
  console.error(
    'Worker runtime could not start. Check private configuration and applied migrations.',
  );
  process.exitCode = 1;
}
