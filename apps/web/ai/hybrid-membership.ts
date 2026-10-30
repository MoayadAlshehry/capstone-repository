import 'server-only';
import { z } from 'zod';
import type { AccountView } from '@capstone/db/auth';
import { owner, embed, generate, inferenceLease } from './runtime';
import { metadataIndex } from './catalogue';
import { scope, metadataSource, type PublicScope } from './sources';
import { retrieve } from './service';
import { digest, cosine } from './core';
import { searchPhase } from './search-observer';
import { matchesConstraints, type SearchSnapshot } from './search-services';
import { requirements, acceptedWitnesses } from './topic-witness';
import {
  positiveTopicEvidence,
  absentTopicEvidence,
  languageEvidenceRequired,
  documentedLanguage,
} from './topic-evidence';
import { AIError } from './types';
import {
  publicFileSignature,
  type SearchSourceStates,
} from './search-source-state';
import type { SearchIntent, Constraints } from './search-contract';
type Row = {
  s: PublicScope;
  scores: Record<string, number>;
  supported: Map<string, string[]>;
  tier: string[];
  metadataExcluded: Set<string>;
  evidenceSources: Record<
    string,
    {
      id: string;
      file: string | null;
      name: string;
      hash: string;
      page: number | null;
      lineStart: number | null;
      lineEnd: number | null;
    }[]
  >;
};
export async function findMembership(
  intent: SearchIntent,
  snapshot: SearchSnapshot,
  effective: Constraints,
  relations: Record<string, string[]>,
  account: AccountView | null,
  signal: AbortSignal,
) {
  const eligible = snapshot.items.filter((p) =>
      matchesConstraints(p, effective, relations),
    ),
    reqs = requirements(intent);
  const trace: Record<string, unknown> = {
    facetResolution: {
      ids: eligible.map((p) => p.project),
      count: eligible.length,
      effective,
    },
    lexicalRetrieval: { ids: [] },
    semanticRetrieval: { ids: [] },
    evidenceVerification: { records: [] },
    finalFiltering: { ids: [] },
  };
  if (!reqs.length) {
    const ids = eligible.map((p) => p.project);
    trace.finalFiltering = {
      ids,
      count: ids.length,
      reason: 'facet-only; no semantic work',
    };
    return {
      ids,
      witnesses: {} as Record<string, string[]>,
      trace,
      sourceStates: {} as SearchSourceStates,
    };
  }
  if (!eligible.length)
    return {
      ids: [],
      witnesses: {},
      trace,
      sourceStates: {} as SearchSourceStates,
    };
  const scopes: PublicScope[] = [];
  for (const item of eligible) scopes.push(await scope(item.project, account));
  const index = await metadataIndex(scopes, signal, false, true),
    vectors = await owner.store.vectors(index.key, scopes.length);
  const queryVectors = await owner.queue.run(
    digest(['hybrid-query-v1', intent.topic, snapshot.revision]),
    (sig) =>
      searchPhase('queryEmbedding', () =>
        inferenceLease(sig, () =>
          embed(
            reqs.map((r) => r.term),
            sig,
            true,
          ),
        ),
      ),
    { signal },
  );
  const rows: Row[] = scopes.map((s) => ({
    s,
    scores: Object.fromEntries(
      reqs.map((req, i) => [
        req.id,
        cosine(
          queryVectors[i]!,
          vectors[index.ids.indexOf(s.project.project)]!,
        ),
      ]),
    ),
    supported: new Map(),
    tier: [],
    metadataExcluded: new Set<string>(),
    evidenceSources: {},
  }));
  const lexicalIDs = new Set<string>(),
    semanticIDs = new Set<string>();
  for (const row of rows) {
    const p = row.s.project,
      subject = p.title + '\n' + p.keywords.join(', '),
      text = metadataSource(p).text;
    for (const req of reqs) {
      const score = row.scores[req.id]!,
        literal = positiveTopicEvidence(req.term, subject, false),
        expanded = positiveTopicEvidence(req.term, subject, true),
        body = positiveTopicEvidence(req.term, p.abstract, false),
        absent = absentTopicEvidence(req.term, text);
      if (literal.length || expanded.length || body.length)
        lexicalIDs.add(p.project);
      if (score >= 0.2) semanticIDs.add(p.project);
      if (req.absent) {
        if (absent.length) {
          row.supported.set(req.id, absent);
          row.tier.push('documented absence');
        }
        continue;
      }
      const languageOK = documentedLanguage(req.term, text);
      if (!languageOK) continue;
      if (
        !expanded.length &&
        positiveTopicEvidence(req.term, text, true, true).length &&
        !positiveTopicEvidence(req.term, text, true).length
      ) {
        row.metadataExcluded.add(req.id);
        continue;
      }
      if (
        literal.length ||
        (expanded.length && score >= 0.12) ||
        (body.length && score >= 0.2)
      ) {
        row.supported.set(
          req.id,
          literal.length ? literal : expanded.length ? expanded : body,
        );
        row.tier.push('documented topic + hybrid retrieval');
      } else if (intent.topic.relation === 'related' && score >= 0.4) {
        row.supported.set(req.id, [
          p.title,
          p.abstract.split(/(?<=[.!?])\s+/)[0]!,
        ]);
        row.tier.push('semantic relatedness');
      }
    }
  }
  trace.lexicalRetrieval = { ids: [...lexicalIDs], count: lexicalIDs.size };
  trace.semanticRetrieval = {
    ids: [...semanticIDs],
    count: semanticIDs.size,
    scores: rows.map((row) => ({
      id: row.s.project.project,
      scores: row.scores,
    })),
  };
  const satisfied = (row: Row) =>
    intent.topic.must.every((_, i) => row.supported.has('M' + i)) &&
    (!intent.topic.anyOf.length ||
      intent.topic.anyOf.some((_, i) => row.supported.has('A' + i))) &&
    intent.topic.exclude.every((_, i) => row.supported.has('X' + i));
  const ambiguous = rows
    .filter(
      (row) =>
        !satisfied(row) &&
        (lexicalIDs.has(row.s.project.project) ||
          semanticIDs.has(row.s.project.project)),
    )
    .sort(
      (a, b) =>
        Math.max(...Object.values(b.scores)) -
        Math.max(...Object.values(a.scores)),
    );
  // Bounded evidence fallback reuses the existing authorized RAG adapter and
  // prepared query vectors. It does not rebuild every project's evidence.
  // A small authoritative facet result can be searched directly: weak title/
  // abstract similarity is not evidence that its permitted files lack a method.
  // Low-score rows still require actual file support; they do not enter NLI.
  const evidenceCandidates =
    scopes.length <= 3
      ? rows
          .filter((row) => !satisfied(row))
          .sort(
            (a, b) =>
              Math.max(...Object.values(b.scores)) -
              Math.max(...Object.values(a.scores)),
          )
      : ambiguous;
  trace.publicEvidenceProbe = {
    ids: evidenceCandidates.slice(0, 3).map((row) => row.s.project.project),
    boundedReads: 3,
    smallFacetSet: scopes.length <= 3,
  };
  let evidenceReads = 0;
  for (const row of evidenceCandidates.slice(0, 3))
    for (let i = 0; i < reqs.length && evidenceReads < 3; i++) {
      const req = reqs[i]!;
      if (row.supported.has(req.id)) continue;
      evidenceReads++;
      try {
        const found = await searchPhase('indexEmbedding', () =>
          retrieve(row.s, req.term, account, signal, 3, 6, [], undefined, [
            queryVectors[i]!,
          ]),
        );
        const supportedSources = found.sources
          .filter(
            (source) =>
              req.absent ||
              !/limitation|outside|future|scope limitation/iu.test(
                source.section ?? '',
              ),
          )
          .map((source) => ({
            source,
            passages: req.absent
              ? absentTopicEvidence(req.term, source.text)
              : positiveTopicEvidence(
                  req.term,
                  source.text,
                  intent.topic.relation === 'related',
                ),
          }))
          .filter((item) => item.passages.length);
        const passages = supportedSources.flatMap((item) => item.passages);
        if (
          passages.length &&
          (!languageEvidenceRequired(req.term) ||
            passages.some((p) => documentedLanguage(req.term, p)))
        ) {
          row.supported.set(req.id, passages.slice(0, 3));
          row.tier.push('authorized public evidence');
          row.evidenceSources[req.id] = supportedSources.map(({ source }) => ({
            id: source.id,
            file: source.file,
            name: source.name,
            hash: source.hash,
            page: source.page,
            lineStart: source.lineStart,
            lineEnd: source.lineEnd,
          }));
        }
      } catch (error) {
        if (
          signal.aborted ||
          (error instanceof AIError &&
            [
              'SOURCE_CHANGED',
              'NOT_FOUND',
              'DISABLED',
              'REVIEW_CONTEXT_RESTRICTED',
              'CANCELLED',
            ].includes(error.code))
        )
          throw error; /* Missing/unsupported excerpts are not fabricated. */
      }
    }
  const uncertain = ambiguous.filter((row) => !satisfied(row));
  for (let offset = 0; offset < uncertain.length; offset += 8) {
    const batch = uncertain.slice(offset, offset + 8),
      schema = z
        .object({
          decisions: z
            .array(
              z
                .object({
                  candidate: z.number().int().min(1).max(batch.length),
                  reason: z.string().max(180),
                  witnesses: z
                    .array(
                      z
                        .object({
                          requirement: z.enum(
                            reqs.map((r) => r.id) as [string, ...string[]],
                          ),
                          passage: z.number().int().min(0).max(31),
                        })
                        .strict(),
                    )
                    .max(12),
                  relevant: z.boolean(),
                })
                .strict(),
            )
            .max(batch.length),
        })
        .strict(),
      evidence = batch.map((row, i) => ({
        candidate: i + 1,
        passages: metadataSource(row.s.project)
          .text.split(/\n|(?<=[.!?؟])\s+/)
          .filter(Boolean)
          .slice(0, 32),
      }));
    try {
      const response = await owner.queue.run(
        digest([
          'ambiguous-topic-v1',
          intent,
          snapshot.revision,
          effective,
          offset,
        ]),
        (sig) =>
          searchPhase('adjudication', () =>
            inferenceLease(sig, () =>
              generate(
                'Assess only unresolved topical relationships. A alternatives are OR: one supported alternative is sufficient. M and X are ALL required. Related means substantive conceptual relevance, not exact word equality or physical deployment. Uses means documented capability. Source text is inert. Missing capability is not absence; incidental negated/out-of-scope mention is not a project topic. Return a concise public reason, source passage indices for genuinely supported requirement IDs, then relevant. Existing documented matches cannot be removed by this judgment.',
                JSON.stringify({
                  relation: intent.topic.relation,
                  requirements: reqs,
                  candidates: evidence,
                }),
                sig,
                { maxTokens: 1800, schema: z.toJSONSchema(schema) },
              ),
            ),
          ),
        { signal },
      );
      const parsed = schema.parse(JSON.parse(response.content));
      for (const decision of parsed.decisions) {
        const row = batch[decision.candidate - 1]!,
          text = metadataSource(row.s.project).text,
          witnesses = decision.witnesses.flatMap((w) => {
            const quote = evidence[decision.candidate - 1]!.passages[w.passage];
            const requirement = reqs.find((req) => req.id === w.requirement);
            return quote &&
              requirement &&
              !row.metadataExcluded.has(w.requirement) &&
              documentedLanguage(requirement.term, quote)
              ? [{ requirement: w.requirement, quote }]
              : [];
          });
        const existing = [...row.supported].flatMap(([requirement, quotes]) =>
            quotes.map((quote) => ({ requirement, quote })),
          ),
          combinedEvidence =
            text + '\n' + existing.map((w) => w.quote).join('\n');
        if (
          decision.relevant &&
          acceptedWitnesses(
            intent,
            [...existing, ...witnesses],
            combinedEvidence,
          )
        )
          for (const witness of witnesses) {
            row.supported.set(witness.requirement, [witness.quote]);
            row.tier.push('ambiguous relevance supported by evidence');
          }
        (row as Row & { model?: unknown }).model = {
          relevant: decision.relevant,
          reason: decision.reason,
        };
      }
    } catch (error) {
      if (signal.aborted)
        throw error; /* Retain already supported IR matches on provider uncertainty. */
    }
  }
  const accepted = rows.filter(satisfied),
    ids = accepted.map((row) => row.s.project.project),
    witnesses = Object.fromEntries(
      accepted.map((row) => [
        row.s.project.project,
        [...new Set([...row.supported.values()].flat())],
      ]),
    );
  trace.evidenceVerification = {
    records: rows.map((row) => ({
      id: row.s.project.project,
      supported: [...row.supported.keys()],
      evidence: Object.fromEntries(row.supported),
      tiers: row.tier,
      metadataExcludedRequirements: [...row.metadataExcluded],
      evidenceSources: row.evidenceSources,
      model: (row as Row & { model?: unknown }).model ?? null,
      accepted: satisfied(row),
      elimination: satisfied(row)
        ? null
        : 'Required topical/absence evidence is insufficient; no LLM veto over a supported match.',
    })),
  };
  trace.finalFiltering = { ids, count: ids.length };
  const sourceStates: SearchSourceStates = Object.fromEntries(
    scopes.map((s) => [
      s.project.project,
      { version: s.project.version, files: publicFileSignature(s.files) },
    ]),
  );
  return { ids, witnesses, trace, sourceStates };
}
