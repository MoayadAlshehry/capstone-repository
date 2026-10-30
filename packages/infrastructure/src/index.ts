import 'server-only';
import { loadInfrastructureConfig } from '@capstone/config/server';
import { createRuntimeDatabase } from '@capstone/db';
import { createPrivateStorage } from '@capstone/storage';
import type { RuntimeService } from '@capstone/domain';

let database: ReturnType<typeof createRuntimeDatabase> | undefined;
let databaseUrl: string | undefined;
export async function infrastructureReadiness(service: RuntimeService) {
  const dependencies = { database: 'unavailable', storage: 'unavailable' };
  try {
    const config = loadInfrastructureConfig();
    if (database && databaseUrl !== config.databaseUrl) {
      await database.close();
      database = undefined;
    }
    databaseUrl = config.databaseUrl;
    database ??= createRuntimeDatabase(config.databaseUrl);
    await Promise.all([
      database
        .ready()
        .then(() => {
          dependencies.database = 'ready';
        })
        .catch(() => {}),
      createPrivateStorage(config.storageRoot, config)
        .then((storage) => storage.ready())
        .then(() => {
          dependencies.storage = 'ready';
        })
        .catch(() => {}),
    ]);
  } catch {
    /* only safe dependency state is exposed */
  }
  const ready =
    dependencies.database === 'ready' && dependencies.storage === 'ready';
  return {
    service,
    phase: 'PHASE_03',
    status: ready ? 'infrastructure-ready' : 'unavailable',
    businessWorkflowsAvailable: false,
    dependencies,
    ...(ready
      ? {}
      : {
          message:
            'Infrastructure unavailable. Check PostgreSQL, applied migrations and private storage configuration.',
        }),
  };
}
export async function closeInfrastructure() {
  if (database) {
    await database.close();
    database = undefined;
    databaseUrl = undefined;
  }
}
