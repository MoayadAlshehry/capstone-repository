import 'server-only';
import { createRuntimeDatabase } from '@capstone/db';
import { owner, embed, inferenceLease, namespace } from './runtime';
import { digest, cosine, EMBEDDING_MODEL, LIMITS } from './core';
import { searchPhase, searchCount } from './search-observer';
import { SharedWork } from './shared-work';
import { matchesConstraints, type SearchSnapshot } from './search-services';
import type { Constraints } from './search-contract';
import type { MetadataIntent } from './metadata-intent';
import {
  metadataFields,
  metadataText,
  metadataTokens,
  rankMetadata,
  safeAlternatives,
  type MetadataRecord,
} from './metadata-ranking';
import { AIError, type AILocale } from './types';
let db: ReturnType<typeof createRuntimeDatabase> | undefined;
const indexWork = new SharedWork<{ key: string; ids: string[] }>();
async function metadataVectors(rows: MetadataRecord[], signal: AbortSignal) {
  const sorted = [...rows].sort((a, b) => a.project.localeCompare(b.project)),
    ids = sorted.map((p) => p.project),
    key = digest([
      'public-search-metadata-v1',
      namespace(),
      EMBEDDING_MODEL,
      'document:Title,Abstract,Keywords;brand-prefix-and-repetitions-removed;query:existing-Qwen-instruction',
      sorted.map((p) => [p.project, p.version, metadataText(p)]),
    ]);
  const cached = await owner.store.read<{ ids: string[] }>(key);
  if (cached && JSON.stringify(cached.ids) === JSON.stringify(ids)) {
    await owner.store.vectors(key, ids.length);
    return { key, ids };
  }
  return indexWork.run(
    key,
    signal,
    async (sig) => {
      const again = await owner.store.read<{ ids: string[] }>(key);
      if (again && JSON.stringify(again.ids) === JSON.stringify(ids)) {
        await owner.store.vectors(key, ids.length);
        return { key, ids };
      }
      const vectors: Float32Array[] = [];
      for (let i = 0; i < sorted.length; i += LIMITS.embeddingBatch) {
        const texts = sorted
          .slice(i, i + LIMITS.embeddingBatch)
          .map(metadataText);
        vectors.push(
          ...(await owner.queue.run(
            key + ':' + i,
            (ss) =>
              searchPhase('indexEmbedding', () =>
                inferenceLease(ss, () => embed(texts, ss)),
              ),
            { signal: sig },
          )),
        );
      }
      await owner.store.write(key, { ids }, vectors);
      return { key, ids };
    },
    () => {
      void searchCount('coalesced');
    },
  );
}
async function lexical(
  rows: MetadataRecord[],
  query: string,
  plan: MetadataIntent,
) {
  const texts = [
      query,
      ...plan.groups.flatMap((g) => safeAlternatives(g, rows)),
    ],
    tokens = [...new Set(texts.flatMap(metadataTokens))];
  if (!tokens.length) return [];
  const documents = rows.map((p) => {
    const f = metadataFields(p);
    return {
      id: p.project,
      title: metadataTokens(f.title).join(' '),
      abstract: metadataTokens(f.abstract).join(' '),
      keywords: metadataTokens(f.keywords.join(' ')).join(' '),
    };
  });
  db ??= createRuntimeDatabase(process.env.DATABASE_URL ?? '');
  return db.transactions.run(async (tx) => {
    await tx.query(
      'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
    );
    return tx.query<{ id: string; score: number }>(
      `WITH documents AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(id text,title text,abstract text,keywords text)), ranked AS (SELECT id,setweight(to_tsvector('simple',title),'A')||setweight(to_tsvector('simple',keywords),'B')||setweight(to_tsvector('simple',abstract),'C') vector,title,keywords FROM documents) SELECT id,(ts_rank_cd(vector,to_tsquery('simple',$2))+greatest(public.word_similarity($3,title),public.word_similarity($3,keywords))/10)::float8 score FROM ranked ORDER BY score DESC,id`,
      [
        JSON.stringify(documents),
        tokens.join(' | '),
        metadataTokens(query).join(' '),
      ],
    );
  });
}
export async function findMetadataMembership(
  query: string,
  plan: MetadataIntent,
  snapshot: SearchSnapshot,
  effective: Constraints,
  relations: Record<string, string[]>,
  locale: AILocale,
  signal: AbortSignal,
) {
  const eligible = snapshot.items.filter((p) =>
      matchesConstraints(p, effective, relations),
    ),
    warnings = [...plan.warnings];
  const trace: Record<string, unknown> = {
    version: 'metadata-only-v2',
    fieldScope: ['descriptive title', 'abstract', 'keywords'],
    rawQuerySHA256: digest(query),
    rawQueryCharacters: query.length,
    facetResolution: {
      ids: eligible.map((p) => p.project),
      count: eligible.length,
      effective,
    },
    generativeAdjudicationCalls: 0,
    rerankerCalls: 0,
    projectFileReads: 0,
  };
  if (plan.browse || plan.exactIDs.length) {
    const ids = eligible
      .filter((p) => !plan.exactIDs.length || plan.exactIDs.includes(p.project))
      .map((p) => p.project);
    trace.finalFiltering = {
      ids,
      count: ids.length,
      reason: plan.exactIDs.length ? 'exact-project-name' : 'canonical browse',
    };
    return {
      ids,
      witnesses: {} as Record<string, string[]>,
      trace,
      sourceStates: {},
      warnings,
      degraded: false,
    };
  }
  if (!eligible.length)
    return {
      ids: [],
      witnesses: {},
      trace,
      sourceStates: {},
      warnings,
      degraded: false,
    };
  const lexicalRows = await lexical(eligible, query, plan),
    dense: Record<string, number> = {};
  let degraded = false;
  try {
    const index = await metadataVectors(snapshot.items, signal),
      vectors = await owner.store.vectors(index.key, index.ids.length);
    const q = await owner.queue.run(
      digest(['metadata-search-query', namespace(), query, snapshot.revision]),
      (ss) =>
        searchPhase('queryEmbedding', () =>
          inferenceLease(ss, () => embed([query], ss, true)),
        ),
      { signal },
    );
    for (const p of eligible)
      dense[p.project] = cosine(q[0]!, vectors[index.ids.indexOf(p.project)]!);
    trace.embedding = {
      model: EMBEDDING_MODEL,
      indexKey: index.key,
      indexRows: index.ids.length,
      originalQueryUnchanged: true,
    };
  } catch {
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    degraded = true;
    warnings.push(
      locale === 'ar'
        ? 'التضمين الدلالي غير متاح؛ النتائج من البيانات الوصفية النصية فقط.'
        : 'Semantic retrieval is unavailable; results use literal published metadata only.',
    );
  }
  const exclusionTerms = plan.exclusions.map((g) => g.text),
    ranked = rankMetadata(
      eligible,
      plan.groups,
      lexicalRows,
      dense,
      exclusionTerms,
      plan.strict,
    ),
    ids = ranked.selected.map((r) => r.id),
    witnesses: Record<string, string[]> = {};
  for (const r of ranked.selected) {
    const p = eligible.find((p) => p.project === r.id)!,
      source = [
        ...new Set(r.hits.flatMap((h) => h.evidence.map((e) => e.text))),
      ];
    const label =
      r.grade === 'strong'
        ? locale === 'ar'
          ? 'مطابقة مباشرة'
          : 'Direct metadata match'
        : locale === 'ar'
          ? 'مطابقة ذات صلة / جزئية'
          : 'Related / partial metadata match';
    const missing = r.unverified.length
      ? (locale === 'ar' ? 'غير مثبت بالكامل: ' : 'Not fully established: ') +
        r.unverified.join('; ')
      : '';
    witnesses[r.id] = [
      label,
      ...source.slice(0, 1),
      ...(missing ? [missing] : []),
      ...(r.limitation ? [r.limitation] : []),
    ];
    if (missing) warnings.push(p.title + ' — ' + label + '. ' + missing);
  }
  if (!ids.length && warnings.length) degraded = true;
  if (!ids.length && !degraded)
    warnings.push(
      locale === 'ar'
        ? 'لم يثبت تطابق مناسب في الأوصاف العامة المنشورة؛ لم يتم البحث في الملفات أو المواد الخاصة.'
        : 'No supported match was established in published descriptions. Files and private materials were not searched.',
    );
  trace.lexicalRetrieval = {
    ids: ranked.lexicalIDs,
    count: ranked.lexicalIDs.length,
  };
  trace.semanticRetrieval = {
    ids: ranked.semanticIDs,
    count: ranked.semanticIDs.length,
  };
  trace.evidenceVerification = { records: ranked.evaluated };
  trace.finalFiltering = { ids, count: ids.length };
  return { ids, witnesses, trace, sourceStates: {}, warnings, degraded };
}
