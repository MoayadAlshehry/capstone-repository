import 'server-only';
import type { AccountView } from '@capstone/db/auth';
import { createDiscoveryRepository } from '@capstone/db/discovery';
import { parseDiscovery, type DiscoveryResult } from './discovery.js';
import { submissionUuid } from './submissions.js';
import type { PublicationProjection } from './publications.js';
export function createDiscoveryEngine(url: string) {
  const db = createDiscoveryRepository(url);
  return {
    list: async (params: URLSearchParams, account?: AccountView | null) =>
      db.list<DiscoveryResult>(parseDiscovery(params), account),
    detail: (project: string, account?: AccountView | null) => {
      if (!submissionUuid(project)) throw Error('NOT_FOUND');
      return db.detail<PublicationProjection>(project, account);
    },
    routes: db.routes,
    close: db.close,
  };
}
