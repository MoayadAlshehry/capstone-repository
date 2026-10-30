import 'server-only';
import { createAllocationEngine } from '@capstone/domain/allocation-engine';
import { join } from 'node:path';
import { PgBoss, getConstructionPlans } from 'pg-boss';
import pino from 'pino';
import { createJobRepository } from '@capstone/db/governance';
import { createNativeStorage } from '@capstone/storage/native';
import { createTransferStorage } from '@capstone/storage/transfers';
import { uuid } from '@capstone/domain/notification-types';
export const JOBS = [
  'deadline-reminder-v1',
  'expired-staging-v1',
  'durable-event-check-v1',
  'evaluation-allocation-v1',
] as const;
export async function createGovernanceWorker(config: {
  jobDatabaseUrl: string;
  storageRoot: string;
  workspaceRoot: string;
  environment: 'local' | 'test' | 'production';
  schedule?: boolean;
  consume?: boolean;
  legacyAllocation?: boolean;
}) {
  const repo = createJobRepository(config.jobDatabaseUrl),
    objects = await createNativeStorage(
      config.storageRoot,
      config.workspaceRoot,
      config.environment,
    ),
    transfers = await createTransferStorage(
      join(config.storageRoot, 'transfers'),
      config.workspaceRoot,
      config.environment,
    ),
    log = pino({ name: 'capstone-worker', base: null }),
    boss = new PgBoss({
      connectionString: config.jobDatabaseUrl,
      schema: 'jobs',
      application_name: 'capstone-worker-v1',
      migrate: false,
      ...(config.environment === 'test'
        ? {
            monitorIntervalSeconds: 1,
            maintenanceIntervalSeconds: 1,
            superviseIntervalSeconds: 1,
          }
        : {}),
    });
  const allocator = createAllocationEngine(
    config.jobDatabaseUrl,
    async (file) => {
      try {
        return await objects.verify(file.key, {
          size: Number(file.size),
          sha256: file.sha256,
        });
      } catch {
        return false;
      }
    },
  );
  const scheduleAllocationEvents = async () => {
    for (const id of await repo.allocationEvents()) {
      await boss.send(JOBS[3], { event: id }, { id, singletonKey: id });
      await repo.allocationEventQueued(id);
    }
  };
  let running = false,
    failed = false;
  boss.on('error', () => {
    failed = true;
    log.error({ code: 'QUEUE_UNAVAILABLE' }, 'Worker queue unavailable');
  });
  try {
    await repo.prepareQueue(
      getConstructionPlans('jobs').replace(
        'CREATE SCHEMA IF NOT EXISTS jobs;',
        '',
      ),
    );
    await boss.start();
    for (const name of JOBS)
      await boss.createQueue(name, {
        retryLimit: 5,
        retryDelay: 5,
        retryBackoff: true,
        expireInSeconds: 120,
      });
    const scheduleReviews = async () => {
      for (const target of await repo.pendingReviewReminders())
        await boss.send(
          JOBS[0],
          { id: target.id },
          {
            id: target.id,
            singletonKey: target.id,
            startAfter: new Date(Date.parse(target.deadline) - 86400000),
          },
        );
    };
    await scheduleReviews();
    await scheduleAllocationEvents();
    if (config.consume !== false) {
      await boss.work<{ id: string }>(
        JOBS[0],
        { pollingIntervalSeconds: 2, batchSize: 1, localConcurrency: 1 },
        async (jobs) => {
          for (const job of jobs) {
            if (!uuid(job.data.id)) throw Error('INVALID_TARGET');
            const descriptors = await repo.reminderEvidence(job.data.id);
            let readable = descriptors !== null;
            for (const file of descriptors ?? []) {
              try {
                if (
                  !(await objects.verify(file.key, {
                    size: Number(file.size),
                    sha256: file.sha256,
                  }))
                )
                  readable = false;
              } catch {
                readable = false;
              }
            }
            const outcome = readable
              ? await repo.deliver(job.data.id)
              : 'suppressed';
            log.info(
              { jobId: job.id, kind: JOBS[0], outcome },
              'Reminder checked',
            );
          }
        },
      );
      await boss.work(
        JOBS[1],
        { pollingIntervalSeconds: 5, batchSize: 1, localConcurrency: 1 },
        async () => {
          const count = await repo.cleanup((key, kind) =>
            kind === 'object'
              ? objects.removeStaging(key)
              : transfers.remove(key),
          );
          log.info({ kind: JOBS[1], count }, 'Staging cleanup completed');
        },
      );
      await boss.work(
        JOBS[2],
        { pollingIntervalSeconds: 5, batchSize: 1, localConcurrency: 1 },
        async () => {
          const count = await repo.events();
          await scheduleReviews();
          await scheduleAllocationEvents();
          log.info({ kind: JOBS[2], count }, 'Durable events verified');
        },
      );
    }
    if (config.consume !== false)
      await boss.work(
        JOBS[3],
        { pollingIntervalSeconds: 2, batchSize: 1, localConcurrency: 1 },
        async (jobs) => {
          for (const job of jobs) {
            if (config.legacyAllocation === false) continue;
            // An empty queue has no allocation workflow to execute. Explicit engine runs
            // and every nonempty policy run retain their original transactional audit.
            if (!(await allocator.hasCases())) {
              log.info(
                { jobId: job.id, kind: JOBS[3] },
                'Allocation queue is empty',
              );
              continue;
            }
            await allocator.run(job.id);
            await scheduleReviews();
            log.info({ jobId: job.id, kind: JOBS[3] }, 'Allocation checked');
          }
        },
      );
    if (config.schedule !== false) {
      await boss.schedule(
        JOBS[3],
        '*/15 * * * *',
        {},
        { tz: 'UTC', key: 'allocation-v1' },
      );
      await boss.send(JOBS[3], {}, { singletonKey: 'startup-v1' });
      await boss.schedule(
        JOBS[1],
        '*/15 * * * *',
        {},
        { tz: 'UTC', key: 'cleanup-v1' },
      );
      await boss.schedule(
        JOBS[2],
        '* * * * *',
        {},
        { tz: 'UTC', key: 'events-v1' },
      );
    }
    running = true;
    return {
      boss,
      repo,
      async schedule(
        id: string,
        recipient: string,
        kind: 'review-offer' | 'review-task',
        deadline: string,
      ) {
        await repo.register(id, recipient, kind, deadline);
        return boss.send(
          JOBS[0],
          { id },
          {
            id,
            singletonKey: id,
            startAfter: new Date(Date.parse(deadline) - 86400000),
          },
        );
      },
      async ready() {
        if (!running) return false;
        try {
          const queues = await boss.getQueues([...JOBS]);
          failed = !JOBS.every((name) =>
            queues.some((queue) => queue.name === name),
          );
          return !failed;
        } catch {
          return false;
        }
      },
      async close() {
        running = false;
        await boss.stop({ graceful: true, timeout: 10000 });
        await allocator.close();
        await repo.close();
      },
    };
  } catch {
    await boss.stop({ graceful: false }).catch(() => {});
    await allocator.close();
    await repo.close();
    throw Error('WORKER_START_FAILED');
  }
}
