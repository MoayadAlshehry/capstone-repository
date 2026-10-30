import 'server-only';
import { createShowcaseRepository } from '@capstone/db/showcase';
import type { AccountView } from '@capstone/db/auth';
import {
  parseShowcase,
  selectShowcase,
  type ShowcaseCandidate,
} from './showcase.js';
export function createShowcaseEngine(url: string) {
  const repo = createShowcaseRepository(url);
  return {
    async read(params: URLSearchParams, a?: AccountView | null) {
      const filters = parseShowcase(params),
        snapshot = await repo.snapshot<ShowcaseCandidate[]>(a);
      return {
        ...selectShowcase(snapshot, filters),
        filters,
        facets: {
          universities: [
            ...new Map(
              snapshot.map((c) => [
                c.publication.university.nameEn,
                c.publication.university,
              ]),
            ).values(),
          ].sort((a, b) => (a.nameEn < b.nameEn ? -1 : 1)),
          academicYears: [
            ...new Set(snapshot.map((c) => c.publication.academicYear)),
          ]
            .sort()
            .reverse(),
          domains: [
            ...new Set(snapshot.map((c) => c.publication.domain)),
          ].sort(),
        },
      };
    },
    close: repo.close,
  };
}
