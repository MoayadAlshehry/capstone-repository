import { queryIdentity } from './search-contract';
export type MetadataRecord = {
  project: string;
  version: string;
  title: string;
  abstract: string;
  keywords: string[];
};
export type SoftGroup = { text: string; alternatives: string[] };
const common = new Set(
  'a an and are as at be by do does for from in into is of on or our that the their this to using with without want way project projects study studies research work method system systems search find looking show checking check about related please i me can would like عن في من الى علي و او التي الذي هذا هذه ابحث اريد مشروع مشاريع دراسات'.split(
    ' ',
  ),
);
export function normalizeMetadata(value: string) {
  return queryIdentity(value)
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
// Deliberately conservative morphology. A blind /es$/ replacement mangled
// 'queues' into 'queu' while the singular 'queue' was unchanged. Keep domain
// subjects distinguishable instead of applying open-ended fuzzy stemming.
function metadataLemma(raw: string) {
  let x = raw.replace(/^ال(?=.{3})/u, '');
  if (!/^[a-z]+$/.test(x)) return x;
  if (/^sens(?:or|ors|ing|ed|es)?$/.test(x)) return 'sens';
  if (/^remote(?:ly)?$/.test(x)) return 'remote';
  if (/^deploy(?:ment|ments|ed|s|ing)?$/.test(x)) return 'deploy';
  if (/^execut(?:e|ed|es|ing|ion|ions)?$/.test(x)) return 'execute';
  if (/^rout(?:e|es|ing|ed)?$/.test(x)) return 'route';
  if (/^queu(?:e|es|ing|ed)?$/.test(x)) return 'queue';
  if (/^reconcil(?:e|es|ing|ed|iation|iations)$/.test(x)) return 'reconcil';
  if (/^synch(?:ronize|ronized|ronizing|ronization|ronizations)$/.test(x))
    return 'sync';
  if (x.endsWith('ies') && x.length > 4) return x.slice(0, -3) + 'y';
  if (x.endsWith('ing') && x.length > 5) {
    x = x.slice(0, -3).replace(/([b-df-hj-np-tv-z])\1$/, '$1');
    return x;
  }
  if (x.endsWith('ed') && x.length > 5) return x.slice(0, -2);
  if (x.endsWith('s') && !x.endsWith('ss') && x.length > 4)
    return x.slice(0, -1);
  return x;
}
export function metadataTokens(text: string) {
  return normalizeMetadata(text)
    .split(/\s+/)
    .filter((w) => w && !common.has(w))
    .map(metadataLemma);
}
export function metadataFields(p: MetadataRecord) {
  const m = /^([\p{L}\p{N}_.-]{2,24}):\s+(.+)$/u.exec(p.title),
    brand = m?.[1];
  const scrub = (s: string) =>
    brand
      ? s
          .replace(
            new RegExp(
              '(?<![\\p{L}\\p{N}])' +
                brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                '(?![\\p{L}\\p{N}])',
              'giu',
            ),
            ' ',
          )
          .replace(/\s+/g, ' ')
          .trim()
      : s;
  return {
    title: m?.[2] ?? p.title,
    abstract: scrub(p.abstract),
    keywords: p.keywords.map(scrub).filter(Boolean),
  };
}
export function metadataText(p: MetadataRecord) {
  const f = metadataFields(p);
  return (
    'Title: ' +
    f.title +
    '\nAbstract: ' +
    f.abstract +
    '\nKeywords: ' +
    f.keywords.join(', ')
  );
}
export function exactMetadataProjects(rows: MetadataRecord[], query: string) {
  const q = normalizeMetadata(query);
  return rows.filter(
    (p) =>
      normalizeMetadata(p.title) === q ||
      normalizeMetadata(/^([^:]{2,24}):/.exec(p.title)?.[1] ?? '') === q,
  );
}
export function browseMetadataQuery(query: string) {
  return !metadataTokens(query).length;
}
// Positive support must come from descriptive public metadata, never from a
// project brand, a negated claim, an uploaded file or a model-generated guess.
// The title and keywords are one descriptive record: a qualified concept may
// be distributed across them. Individual abstract sentences remain scoped to
// avoid stitching together unrelated or negated sentences.
// Keep each coordinated negative object separate: tokens from "cloud deployment"
// and "field benchmark" cannot establish the different object "field deployment".
function abstractClauses(p: MetadataRecord) {
  return metadataFields(p)
    .abstract.split(/(?<=[.!?؟])\s+/)
    .filter(Boolean);
}
function negativeSubjectMatches(text: string, wanted: string[]) {
  const words = metadataTokens(text).filter(
    (word) =>
      ![
        'claim',
        'assert',
        'stat',
        'use',
        'used',
        'present',
        'exist',
        'يوجد',
        'توجد',
        'موجود',
        'موجودة',
      ].includes(word),
  );
  if (!wanted.length) return false;
  // Require the requested subject to occur as a coherent ordered phrase.
  for (let i = 0; i + wanted.length <= words.length; i++)
    if (wanted.every((word, j) => words[i + j] === word)) {
      // For compound restrictions, evidence must begin with the forbidden
      // object itself. "not limited to field deployment" does not negate
      // field deployment, and "no cloud field deployment" is only a subtype.
      if (wanted.length > 1 && i !== 0) continue;
      // A bare subject is not proved absent by negating only a subtype.
      if (wanted.length === 1 && i + 1 < words.length) continue;
      return true;
    }
  // A blanket denial of a broader activity ("execute uploads") covers a
  // narrower requested activity ("execute uploaded programs"). It must be
  // the complete source object and contain at least the first two terms.
  return (
    wanted.length >= 3 &&
    words.length >= 2 &&
    words.length < wanted.length &&
    words.every((word, i) => wanted[i] === word)
  );
}
function negatedClaim(clause: string, wanted: string[]) {
  const separators =
    /([,;،؛]|\b(?:and|or|nor|but|however|whereas)\b|(?<![\p{L}\p{N}])(?:و|أو|او|ولا|ولكن|لكن)(?![\p{L}\p{N}]))/giu;
  const marker =
    /(?<![\p{L}\p{N}])(?:no|not|without|never|cannot|omits|excludes|outside|out\s+of|beyond|لا|ليس|ليست|لم|لن|بدون|دون|خارج)(?![\p{L}\p{N}])/iu;
  const pieces = clause.split(separators);
  let inherited = false;
  let precedingObjects: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const part = pieces[i]!.trim();
    if (!part) continue;
    if (i % 2 === 1) {
      if (/^(?:but|however|whereas|ولكن|لكن)$/iu.test(part)) {
        inherited = false;
        precedingObjects = [];
      }
      continue;
    }
    const negation = marker.exec(part);
    if (negation) {
      const after = part.slice(negation.index + negation[0].length);
      if (negativeSubjectMatches(after, wanted)) return true;
      // "Field deployment is not claimed" is explicit, but "not limited
      // to field deployment" and "not excluded" are not absence evidence.
      if (
        /^not$/iu.test(negation[0]) &&
        /^(?:claimed|asserted|reported|stated)\b/iu.test(after.trim()) &&
        negativeSubjectMatches(part.slice(0, negation.index), wanted)
      )
        return true;
      // A postposed "outside scope" applies to each coordinated object,
      // separately; it never joins terms across those objects.
      if (
        /^(?:outside|out\s+of|beyond|خارج)$/iu.test(negation[0]) &&
        /scope|demonstrator|project|نطاق/iu.test(after)
      ) {
        // Do not project a trailing "outside scope" across an independent
        // prior affirmative clause ("calibration is performed and field
        // trials are outside scope"). It can cover coordinated bare nouns.
        const independentPredicate =
          /\b(?:is|are|was|were|has|have|will|can|does|did)\b/iu;
        const subjects = [
          ...precedingObjects.filter(
            (subject) => !independentPredicate.test(subject),
          ),
          part.slice(0, negation.index),
        ];
        if (subjects.some((subject) => negativeSubjectMatches(subject, wanted)))
          return true;
      }
      precedingObjects = [];
      inherited = true;
    } else if (
      inherited &&
      !/\b(?:is|are|was|were|has|have)\s+(?:supported|provided|available|enabled|implemented|performed|conducted|demonstrated|used|validated|deployed|executed|included|completed)\b/iu.test(
        part,
      ) &&
      negativeSubjectMatches(part, wanted)
    ) {
      return true;
    } else if (!inherited) {
      precedingObjects.push(part);
    }
  }
  return false;
}
function sufficientSubjectMatch(
  have: string[],
  wanted: string[],
  full = false,
) {
  if (!wanted.length) return false;
  const matched = wanted.filter((w) => have.includes(w)).length;
  // In the title+keyword bundle only, two of three qualified tokens may
  // establish a *partial* subject match. Never admit on a lone fragment.
  return full || wanted.length < 3
    ? matched === wanted.length
    : matched >= 2 && matched >= Math.ceil((wanted.length * 2) / 3);
}
// A restricted set of equivalent noun-phrase forms is used for **negation**
// as well as for positive matching. "calibration of sensors" and "sensor
// calibration" are the same two-word activity, but a scrambled bag of
// distant words is not evidence. Only reverse a single X-of-Y noun phrase;
// negativeSubjectMatches still requires an adjacent, scoped phrase.
function negativeSubjectForms(term: string, wanted: string[]) {
  const forms = [wanted];
  const simpleOf = /^\s*([\p{L}]+)\s+of\s+(?:the\s+)?([\p{L}]+)\s*$/iu.exec(
    term,
  );
  if (simpleOf && wanted.length === 2) {
    const left = metadataTokens(simpleOf[1]!);
    const right = metadataTokens(simpleOf[2]!);
    if (left.length === 1 && right.length === 1) {
      const reordered = [...right, ...left];
      if (reordered.some((word, i) => word !== wanted[i]))
        forms.push(reordered);
    }
  }
  return forms;
}
export function sourceSupport(p: MetadataRecord, term: string, absent = false) {
  // "claimed" qualifies the assertion, not the forbidden activity itself.
  const wanted = [...new Set(metadataTokens(term))].filter(
    (w) => !absent || !['claim', 'assert', 'stat'].includes(w),
  );
  if (!wanted.length) return [];
  const f = metadataFields(p);
  const clauses = abstractClauses(p);
  const negatedForms = negativeSubjectForms(term, wanted);
  const negatedForSubject = (part: string) =>
    negatedForms.some((form) => negatedClaim(part, form));
  // A negated/out-of-scope sentence can enumerate several distinct objects.
  // Do not combine the objects into a positive "sensor calibration" witness
  // merely because "sensor" and "calibration" appear in the same sentence.
  // Positive free-form descriptive prose keeps its existing flexibility.
  const positiveSubjectInClause = (part: string) => {
    const hasScopeBoundary =
      /\b(?:no|not|without|never|cannot|outside|out\s+of|beyond|excludes|excluded|omits)\b|(?<![\p{L}\p{N}])(?:لا|ليس|ليست|لم|لن|بدون|دون|خارج)(?![\p{L}\p{N}])/iu.test(
        part,
      );
    const chunks = hasScopeBoundary
      ? part.split(
          /[,;،؛]|\b(?:and|or|nor|but|however|whereas)\b|(?<![\p{L}\p{N}])(?:و|أو|او|ولا|ولكن|لكن)(?![\p{L}\p{N}])/iu,
        )
      : [part];
    return chunks.some((chunk) =>
      sufficientSubjectMatch(metadataTokens(chunk), wanted, true),
    );
  };
  const matches = clauses.filter(positiveSubjectInClause);
  // In an explicit negative assertion, "does not execute uploads" also
  // rules out executing uploaded programs. Require a coherent negated clause
  // and at least two subject tokens, never an inferred absence from silence.
  const negativeMatches = clauses.filter(
    (part) =>
      negatedForSubject(part) &&
      sufficientSubjectMatch(metadataTokens(part), wanted),
  );
  const titleIsNegated =
    sufficientSubjectMatch(metadataTokens(f.title), wanted) &&
    negatedForSubject(f.title);
  const explicitNegation = negativeMatches.length > 0 || titleIsNegated;
  if (absent) {
    // An explicit negative claim is necessary; silence does not prove absence.
    // The single-token case must identify exactly the excluded activity.
    const found = negativeMatches;
    return titleIsNegated ? ['Title: ' + f.title, ...found] : found;
  }
  if (explicitNegation) return [];
  const evidence: string[] = [];
  const descriptive = [f.title, ...f.keywords].filter(Boolean).join(' · ');
  if (sufficientSubjectMatch(metadataTokens(descriptive), wanted))
    evidence.push(
      'Title: ' +
        f.title +
        (f.keywords.length ? ' · Keywords: ' + f.keywords.join(', ') : ''),
    );
  for (const part of matches) if (!negatedForSubject(part)) evidence.push(part);
  return [...new Set(evidence)];
}
// Controlled, evidence-checked related concepts are *partial* matches, not
// direct claims about implemented technology. Expand only recognized relations
// that are narrower and visibly grounded in the published title/metadata.
const relatedSubjects: Record<string, string[]> = {
  water: [
    'flood',
    'tide',
    'rainfall',
    'irrigation',
    'leak',
    'water monitoring',
  ],
  'water projects': ['flood', 'tide', 'rainfall', 'irrigation', 'leak'],
  'internet of things': ['sensor networking', 'sensor message routing'],
  iot: ['sensor networking', 'sensor message routing'],
  'device synchronization': ['offline sync'],
  'disconnected devices': ['offline sync'],
};
const genericActivities = new Set(
  'experiment experiments trial trials test testing method methods methodology study studies research researchwork project projects prototype prototypes development checking check evaluation evaluations analysis analyses work workflow solution solutions platform platforms process processes'
    .split(' ')
    .map(metadataLemma),
);
function topicalGroup(group: SoftGroup) {
  const words = metadataTokens(group.text);
  return words.some((w) => !genericActivities.has(w));
}
// Parse an explicit English negative activity without relying on a generator.
// The project still has to explicitly document the absence for admission.
export function explicitNegativeActivity(query: string) {
  const m = /\b(?:without|not using)\s+([^.!?،؟;]{3,120})/iu.exec(query);
  return m?.[1]?.trim() ?? null;
}
export function safeAlternatives(group: SoftGroup, rows: MetadataRecord[]) {
  const terms = metadataTokens(group.text);
  const brands = new Set(
    rows
      .map((p) => normalizeMetadata(/^([^:]{2,24}):/.exec(p.title)?.[1] ?? ''))
      .filter(Boolean),
  );
  return [
    ...new Set([
      group.text,
      ...group.alternatives,
      ...(relatedSubjects[normalizeMetadata(group.text)] ?? []),
    ]),
  ].filter((s) => {
    const t = metadataTokens(s);
    return (
      t.length > 0 &&
      !brands.has(normalizeMetadata(s)) &&
      !(terms.length > 1 && t.length === 1 && terms.includes(t[0]!))
    );
  });
}
export function rankMetadata(
  rows: MetadataRecord[],
  groups: SoftGroup[],
  lexical: { id: string; score: number }[],
  dense: Record<string, number>,
  exclude: string[],
  strict: boolean,
) {
  const byId = new Map(rows.map((p) => [p.project, p])),
    lr = new Map(
      [...lexical]
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
        .map((r, i) => [r.id, i + 1]),
    ),
    dr = new Map(
      Object.entries(dense)
        .filter(([, s]) => Number.isFinite(s))
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([id], i) => [id, i + 1]),
    );
  const df = new Map<string, number>();
  for (const p of rows)
    for (const w of new Set(metadataTokens(metadataText(p))))
      df.set(w, (df.get(w) ?? 0) + 1);
  const candidates = [...new Set([...lr.keys(), ...dr.keys()])].filter((id) =>
    byId.has(id),
  );
  const evaluated = candidates.map((id) => {
    const p = byId.get(id)!,
      hits = groups.map((g) => {
        const alternatives = safeAlternatives(g, rows);
        const evidence = alternatives.flatMap((t) =>
          sourceSupport(p, t).map((text) => ({
            term: t,
            text,
            direct:
              normalizeMetadata(t) === normalizeMetadata(g.text) &&
              metadataTokens(t).every((w) => metadataTokens(text).includes(w)),
          })),
        );
        return { concept: g.text, evidence };
      }),
      covered = hits.filter((h) => h.evidence.length),
      direct = hits.filter((h) => h.evidence.some((e) => e.direct)),
      excluded = exclude.map((term) => ({
        term,
        evidence: sourceSupport(p, term, true),
      }));
    const topical = hits.filter((_h, i) => topicalGroup(groups[i]!));
    const coveredTopical = topical.filter((h) => h.evidence.length);
    const directlyCoveredTopical = topical.filter((h) =>
      h.evidence.some((e) => e.direct),
    );
    // A procedural term such as "experiments" cannot by itself establish
    // relevance to the missing subjects "quantum teleportation" or "dinosaurs".
    const supported =
      (topical.length ? coveredTopical.length > 0 : covered.length > 0) &&
      (!strict || direct.length === groups.length) &&
      excluded.every((x) => x.evidence.length > 0);
    const rarity = coveredTopical.reduce(
      (s, h) =>
        s +
        Math.max(
          ...h.evidence.map((e) =>
            metadataTokens(e.term).reduce(
              (a, w) =>
                a + Math.log(1 + (rows.length + 1) / ((df.get(w) ?? 0) + 1)),
              0,
            ),
          ),
        ),
      0,
    );
    const score =
      (lr.has(id) ? 1 / (60 + lr.get(id)!) : 0) +
      (dr.has(id) ? 1 / (60 + dr.get(id)!) : 0);
    const limitation = p.abstract
      .split(/(?<=[.!?؟])\s+/)
      .find((s) =>
        /\b(?:no|not|outside|limited|omits|excludes)\b|لا\s|ليس|خارج/iu.test(s),
      );
    return {
      id,
      grade:
        directlyCoveredTopical.length === topical.length &&
        direct.length === groups.length
          ? 'strong'
          : 'partial',
      supported,
      coverage: coveredTopical.length,
      direct: directlyCoveredTopical.length,
      score,
      rarity,
      hits,
      unverified: hits
        .filter((h) => !h.evidence.some((e) => e.direct))
        .map((h) => h.concept),
      limitation,
      lexicalRank: lr.get(id) ?? null,
      denseRank: dr.get(id) ?? null,
    };
  });
  const selected = evaluated
    .filter((r) => r.supported)
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.direct - a.direct ||
        b.rarity - a.rarity ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    );
  return {
    selected,
    evaluated,
    lexicalIDs: [...lr.keys()],
    semanticIDs: [...dr.keys()],
  };
}
