import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PartnerOverview } from './studio';
import type { PartnerProfile } from '../partners/types';
import type { AccessRecord } from './presentation';
it('the real organization template keeps its own destination across32 locale/status/pending/grant combinations', () => {
  const task: AccessRecord = {
    id: 'controlled-request',
    project: 'controlled-project',
    version: 'controlled-version',
    title: 'Controlled project',
    organization: 'Controlled institution',
    state: 'pending',
    date: '2026-10-13T00:00:00Z',
    dateKind: 'requested',
    action: {
      kind: 'request',
      href: '/en/partner/requests/controlled-request',
    },
    kind: 'request',
    versionNumber: 1,
  };
  for (const locale of ['en', 'ar'] as const)
    for (const status of [
      'pending',
      'approved',
      'rejected',
      'suspended',
    ] as const)
      for (const pending of [false, true])
        for (const active of [false, true]) {
          const profile: PartnerProfile = {
            id: 'own-partner',
            name: 'Controlled partner',
            email: 'controlled@capstone.local',
            organization: 'Controlled organization',
            accountStatus: 'active',
            status,
            revision: 1,
            reason: null,
            createdAt: task.date,
            updatedAt: task.date,
            decidedAt: null,
            history: [],
          };
          const html = renderToStaticMarkup(
            createElement(PartnerOverview, {
              locale,
              profile,
              data: {
                now: task.date,
                active: active
                  ? [
                      {
                        ...task,
                        id: 'controlled-grant',
                        state: 'active',
                        kind: 'grant',
                        action: {
                          kind: 'files',
                          href:
                            '/' + locale + '/partner/grants/controlled-grant',
                        },
                      },
                    ]
                  : [],
                pending: pending ? [task] : [],
                history: [],
                groups: [],
                canRequest: status === 'approved',
              },
            }),
          );
          expect(html).toMatch(
            new RegExp('href="/' + locale + '/partner/eligibility"[^>]*>'),
          );
          expect(html).toContain(
            locale === 'en' ? 'View organization' : 'عرض المؤسسة',
          );
          expect(html).toContain(
            locale === 'en' ? 'Awaiting a decision' : 'بانتظار قرار',
          );
          expect(
            html.includes(
              locale === 'en' ? 'Needs your attention' : 'يحتاج انتباهك',
            ),
          ).toBe(status === 'rejected');
        }
});
