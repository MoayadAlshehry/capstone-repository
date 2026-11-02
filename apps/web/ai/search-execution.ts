import 'server-only';
import { findMetadataMembership } from './metadata-search';
import { metadataIntent, type MetadataIntent } from './metadata-intent';
import { parsePublicCatalogue } from '../public-adoption/discovery-query';
import type { AccountView } from '@capstone/db/auth';
import { owner, namespace } from './runtime';
import { digest } from './core';
import { AIError, type AILocale, type Emit } from './types';
import { assertCurrentGeneration } from './generation';
import {
  searchSnapshot,
  resolveSearchIntent,
  matchesConstraints,
  publicSearchRows,
  type SearchSnapshot,
} from './search-services';
import {
  overridesSchema,
  searchIdentity,
  type SearchIntent,
  type SearchOverrides,
  type ResolvedMention,
  type Constraints,
} from './search-contract';
import { SharedWork } from './shared-work';
import { searchCount, searchCounters } from './search-observer';
// Membership computed before subject-preserving admission must not be reused.
const VERSION = 'public-search-metadata-v3-subject-bound';
type Plan = {
  version: string;
  authority: string;
  revision: string;
  originalQuery: string;
  intent: SearchIntent;
  resolved: ResolvedMention[];
  ignored: { id: string; facet: string; text: string }[];
  relations: Record<string, string[]>;
  effective: Constraints;
  ids: string[];
  witnesses: Record<string, string[]>;
  preferredSort: string | null;
  trace: Record<string, unknown>;
  sourceStates: Record<string, never>;
  warnings: string[];
  degraded: boolean;
};
const membershipWork = new SharedWork<Plan>();
type Input = {
  query: string;
  locale: AILocale;
  filters: Record<string, string>;
  overrides?: SearchOverrides | undefined;
};
const authority = (account: AccountView | null) =>
  digest([namespace(), account?.id ?? null, account?.sessionId ?? null]);
async function orders(
  snapshot: SearchSnapshot,
  ids: string[],
  account: AccountView | null,
) {
  const result: Record<string, string[]> = {
    relevance: ids,
    newest: snapshot.items
      .filter((p) => ids.includes(p.project))
      .map((p) => p.project),
  };
  for (const sort of ['highest', 'popular']) {
    const next = await searchSnapshot(account, sort);
    if (next.revision !== snapshot.revision)
      throw new AIError('SOURCE_CHANGED', 409);
    result[sort] = next.items
      .filter((p) => ids.includes(p.project))
      .map((p) => p.project);
    if (result[sort]!.length !== ids.length)
      throw new AIError('RESULT_PROJECTION_LIMIT', 409);
  }
  return result;
}
async function deliver(
  plan: Plan,
  key: string,
  snapshot: SearchSnapshot,
  account: AccountView | null,
  locale: AILocale,
  emit: Emit,
  cache: boolean,
) {
  if (
    plan.authority !== authority(account) ||
    plan.revision !== snapshot.revision
  )
    throw new AIError('SOURCE_CHANGED', 409);
  const ids = new Set(plan.ids),
    items = snapshot.items
      .filter(
        (p) =>
          ids.has(p.project) &&
          matchesConstraints(p, plan.effective, plan.relations),
      )
      .sort(
        (a, b) => plan.ids.indexOf(a.project) - plan.ids.indexOf(b.project),
      );
  if (items.length !== plan.ids.length)
    throw new AIError('SOURCE_CHANGED', 409);
  const ordering = await orders(snapshot, plan.ids, account);
  const current = await searchSnapshot(account);
  if (current.revision !== snapshot.revision)
    throw new AIError('SOURCE_CHANGED', 409);
  await assertCurrentGeneration();
  await emit({
    type: 'result',
    value: {
      status: plan.degraded && !items.length ? 'unavailable' : 'ready',
      key,
      cache,
      items: publicSearchRows(items),
      total: items.length,
      context: namespace(),
      originalQuery: plan.originalQuery,
      intent: plan.intent,
      resolved: plan.resolved,
      ignored: plan.ignored,
      effective: plan.effective,
      orders: ordering,
      preferredSort: plan.preferredSort,
      revision: plan.revision,
      warnings: plan.warnings,
      reasons: items.map((p) => ({
        id: p.project,
        title: p.title,
        href: '/' + locale + '/catalogue/' + p.project,
        excerpt:
          plan.witnesses[p.project]?.join(' · ').slice(0, 500) ??
          p.abstract.slice(0, 250),
      })),
    },
  });
  await emit({
    type: 'metrics',
    value: {
      cache,
      counters: JSON.stringify(searchCounters()),
      membership: key,
      metadataInspected: snapshot.items.length,
      verifiedMembership: items.length,
      eliminationTrace: JSON.stringify({
        ...plan.trace,
        finalDelivery: {
          ids: items.map((p) => p.project),
          count: items.length,
          revision: snapshot.revision,
        },
      }),
    },
  });
}
export async function unifiedSearch(
  input: Input,
  account: AccountView | null,
  signal: AbortSignal,
  emit: Emit,
) {
  parsePublicCatalogue(new URLSearchParams(input.filters));
  await searchCount('searchRequests');
  const snapshot = await searchSnapshot(account),
    overrides = overridesSchema.parse(input.overrides ?? {});
  const interpreted: MetadataIntent = await metadataIntent(
    input.query,
    snapshot,
    signal,
    digest([authority(account), input.locale]),
  );
  const intent = interpreted.intent;
  intent.topic = {
    relation: 'related',
    must: [],
    anyOf: interpreted.groups.map((g) => g.text),
    exclude: interpreted.exclusions.map((g) => g.text),
  };
  await emit({
    type: 'notice',
    text:
      input.locale === 'ar'
        ? 'جارٍ التحقق من الجهات والأسماء العامة…'
        : 'Resolving public entities and names…',
  });
  const resolution = await resolveSearchIntent(
    intent,
    snapshot,
    input.filters,
    overrides,
    account,
  );
  if (
    intent.clarification ||
    resolution.choices.length ||
    resolution.conflicts.length
  ) {
    await emit({
      type: 'result',
      value: {
        status: resolution.conflicts.length ? 'conflict' : 'clarification',
        items: [],
        total: 0,
        context: namespace(),
        originalQuery: input.query,
        intent,
        resolved: resolution.resolved,
        choices: resolution.choices,
        effective: resolution.effective,
        conflicts: resolution.conflicts,
        ignored: resolution.ignored,
        warnings: [
          ...(intent.clarification ? [intent.clarification] : []),
          ...resolution.choices
            .filter((c) => !c.options.length)
            .map((c) =>
              input.locale === 'ar'
                ? 'لا يوجد تطابق في البيانات العامة للاسم المطلوب: ' + c.text
                : 'No matching public ' + c.facet + ' was found for: ' + c.text,
            ),
        ],
      },
    });
    return;
  }
  const key = digest([
    VERSION,
    'membership',
    authority(account),
    searchIdentity(input.query),
    input.locale,
    intent,
    resolution.effective,
    snapshot.revision,
    overrides,
  ]);
  let plan = await owner.store.read<Plan>(key);
  if (plan && plan.revision !== snapshot.revision) plan = null;
  const cache = !!plan;
  if (!plan)
    await emit({
      type: 'notice',
      text:
        input.locale === 'ar'
          ? 'جارٍ مطابقة الموضوع مع القيود المتحقق منها…'
          : 'Finding matches within verified constraints…',
    });
  if (!plan)
    plan = await membershipWork.run(
      key,
      signal,
      async (sig) => {
        const again = await owner.store.read<Plan>(key);
        if (again && again.revision === snapshot.revision) return again;
        const found = await findMetadataMembership(
          input.query,
          interpreted,
          snapshot,
          resolution.effective,
          resolution.relations,
          input.locale,
          sig,
        );
        const value: Plan = {
          version: VERSION,
          authority: authority(account),
          revision: snapshot.revision,
          originalQuery: input.query,
          intent,
          resolved: resolution.resolved,
          ignored: resolution.ignored,
          relations: resolution.relations,
          effective: resolution.effective,
          ...found,
          preferredSort: intent.sort,
        };
        await assertCurrentGeneration();
        if (!value.degraded) await owner.store.write(key, value);
        return value;
      },
      () => {
        void searchCount('coalesced');
      },
    );
  if (signal.aborted) throw new AIError('CANCELLED', 499);
  await deliver(plan, key, snapshot, account, input.locale, emit, cache);
}
export async function projectSearchResult(
  input: { key: string; locale: AILocale },
  account: AccountView | null,
  signal: AbortSignal,
  emit: Emit,
) {
  await searchCount('projectionRequests');
  const plan = await owner.store.read<Plan>(input.key);
  if (
    !plan ||
    plan.version !== VERSION ||
    plan.authority !== authority(account)
  )
    throw new AIError('SOURCE_CHANGED', 409);
  const snapshot = await searchSnapshot(account);
  if (signal.aborted) throw new AIError('CANCELLED', 499);
  await deliver(plan, input.key, snapshot, account, input.locale, emit, true);
}
