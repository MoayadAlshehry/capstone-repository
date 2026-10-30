import {
  queryIdentity,
  facetNames,
  type SearchIntent,
} from './search-contract';
import {
  getSearchFacets,
  knownMentions,
  mentionId,
  type SearchSnapshot,
} from './search-services';
import { AIError } from './types';
import { explicitFacetOperator } from './facet-negation';
import { absentTopicEvidence } from './topic-evidence';
/** Reconcile model concepts with source operators and authoritative aliases.
 * Never use a rewritten topic as the identity of the original request. */
export function reconcileInterpretation(
  intent: SearchIntent,
  query: string,
  snapshot: SearchSnapshot,
) {
  const known = knownMentions(query, snapshot),
    facets = getSearchFacets(snapshot),
    original = queryIdentity(query);
  const optionFor = (facet: string, text: string) =>
    facets[facet as keyof typeof facets]?.find((option) =>
      option.aliases.some(
        (alias) => queryIdentity(alias) === queryIdentity(text),
      ),
    );
  // Models sometimes expand "universities other than X" into every remaining
  // catalogue option. Only a complete, exact registry complement is equivalent
  // to the source exclusion. Partial/unknown enumerations remain unresolved.
  for (const facet of [
    'university',
    'department',
    'academicYear',
    'domain',
  ] as const) {
    const named = known.filter((m) => m.facet === facet),
      proposed = intent.mentions.filter((m) => m.facet === facet);
    if (
      !named.length ||
      named.some((m) => m.operator !== 'exclude') ||
      !proposed.length ||
      proposed.some((m) => m.operator !== 'include' || m.join !== 'any')
    )
      continue;
    const excluded = new Set(named.map((m) => optionFor(facet, m.text)?.value)),
      complement = facets[facet]
        .map((o) => o.value)
        .filter((v) => !excluded.has(v)),
      values = proposed.map((m) => optionFor(facet, m.text)?.value);
    let unmatched = original;
    for (const m of known)
      unmatched = unmatched.replace(queryIdentity(m.text), ' ');
    if (
      facet === 'university' &&
      (/\buniversity\b/iu.test(unmatched) ||
        /(?:^|\s)جامعة(?:\s|$)/u.test(unmatched))
    )
      continue;
    if (
      complement.length &&
      values.every((v) => v !== undefined) &&
      new Set(values).size === complement.length &&
      complement.every((v) => values.includes(v))
    )
      intent.mentions = intent.mentions.filter((m) => m.facet !== facet);
  }
  for (const mention of intent.mentions) {
    if (original.includes(queryIdentity(mention.text))) continue;
    const option = optionFor(mention.facet, mention.text),
      literal = known.find(
        (k) =>
          k.facet === mention.facet &&
          option?.aliases.some(
            (alias) => queryIdentity(alias) === queryIdentity(k.text),
          ),
      );
    if (!literal) throw new AIError('UNRESOLVED_SEARCH_MENTION', 422);
    mention.text = literal.text;
  }
  for (const actual of known) {
    const option = optionFor(actual.facet, actual.text),
      existing = intent.mentions.find(
        (m) =>
          m.facet === actual.facet &&
          option?.aliases.some(
            (alias) => queryIdentity(alias) === queryIdentity(m.text),
          ),
      );
    if (existing) {
      const at = original.indexOf(queryIdentity(actual.text));
      const attached = explicitFacetOperator(
        original.slice(Math.max(0, at - 60), at),
      );
      if (attached) existing.operator = attached;
    } else intent.mentions.push(actual);
  }
  intent.mentions = [
    ...new Map(intent.mentions.map((m) => [mentionId(m), m])).values(),
  ];
  const nonTopics = [
    ...new Set(
      intent.mentions
        .flatMap((m) => [
          m.text,
          ...(optionFor(m.facet, m.text)?.aliases ?? []),
        ])
        .map(queryIdentity),
    ),
  ].sort((a, b) => b.length - a.length);
  const facetLabels = new Set(
    intent.mentions.flatMap((m) => [
      m.facet.toLowerCase(),
      ...(m.facet === 'academicYear' ? ['academic year'] : []),
    ]),
  );
  const clean = (term: string) => {
    const raw = queryIdentity(term);
    if (nonTopics.includes(raw)) return '';
    const prefixed = /^([a-z ]+)\s*[:=]\s*(.*)$/i.exec(raw);
    if (
      prefixed &&
      facetLabels.has(prefixed[1]!.trim()) &&
      nonTopics.includes(prefixed[2]!.trim())
    )
      return '';
    const text = raw
      .replace(/[:=,;]/g, ' ')
      .split(/\s+/)
      .filter(
        (word) =>
          ![
            'a',
            'an',
            'the',
            'project',
            'projects',
            'from',
            'at',
            'in',
            'originating',
            'of',
            'for',
            'مشروع',
            'مشاريع',
            'من',
            'في',
          ].includes(word),
      )
      .join(' ')
      .trim();
    return facetLabels.has(text) ? '' : text;
  };
  const positives = [
    ...new Set(
      [...intent.topic.must, ...intent.topic.anyOf].map(clean).filter(Boolean),
    ),
  ];
  intent.topic.exclude = [
    ...new Set(intent.topic.exclude.map(clean).filter(Boolean)),
  ];
  let source = original;
  for (const mention of intent.mentions) {
    const text = queryIdentity(mention.text),
      at = source.indexOf(text);
    if (at < 0) continue;
    const before = source.slice(0, at),
      prefix =
        /(?:[,;]?\s*(?:and|or|و|او)\s+)?(?:(?:not\s+)?(?:originating|coming)\s+from|not from|not at|excluding|except|without|other than|from|at|in|within|by|authored by|supervised by|for(?: academic)? year|academic year|domain|department|من|في|جامعة|قسم|مجال|للعام|عام|باستثناء|عدا|ليس من|دون|and|or|و|او)\s*$/iu.exec(
          before,
        );
    source =
      before.slice(0, prefix?.index ?? before.length) +
      ' ' +
      source.slice(at + text.length);
  }
  // Bind a model concept to an explicit negative capability clause in the
  // actual sentence, including equivalent bilingual roots. A model that puts
  // "sensor" in must for "not using sensors" cannot reverse that operator.
  const negativeConcepts = positives.filter(
    (term) => absentTopicEvidence(term, source).length > 0,
  );
  for (const term of negativeConcepts)
    positives.splice(positives.indexOf(term), 1);
  intent.topic.exclude = [
    ...new Set([...intent.topic.exclude, ...negativeConcepts]),
  ];
  const or = /\bor\b|\beither\b|\bany of\b|(?:^|\s)او(?:\s|$)/iu.test(source),
    and = /\band\b|(?:^|\s)و(?:\s|$)/iu.test(source);
  if (or && and && positives.length > 1)
    intent.clarification =
      'Please separate the required topics from the OR alternatives.';
  intent.topic.must = or ? [] : positives;
  intent.topic.anyOf = or ? positives : [];
  const residue = source
    .replace(
      /\b(?:a|an|the|projects?|research|for|in|at|from|of|academic|year|domain|department|please|find|show)\b|مشاريع|مشروع|ابحث|اعرض/giu,
      ' ',
    )
    .replace(/[\s,.;:!?؟-]/g, '');
  if (!residue) {
    intent.topic.must = [];
    intent.topic.anyOf = [];
    intent.topic.exclude = [];
  }
  intent.topic.relation =
    /\b(?:using|uses?|employing|utilizing)\b|يستخدم|تستخدم|باستخدام/iu.test(
      source,
    )
      ? 'uses'
      : 'related';
  if (
    /\bwithout\b|\bnot using\b|\bexcluding\b|بدون|لا يستخدم|دون/iu.test(
      source,
    ) &&
    !intent.topic.exclude.length
  )
    intent.clarification =
      'The negated capability could not be resolved safely. Please clarify it.';
  // Explicit connectors between values of a facet are source-owned as well.
  for (const facet of facetNames) {
    const group = intent.mentions
      .filter((m) => m.facet === facet && m.operator === 'include')
      .sort(
        (a, b) =>
          original.indexOf(queryIdentity(a.text)) -
          original.indexOf(queryIdentity(b.text)),
      );
    if (group.length < 2) continue;
    const between = original.slice(
      original.indexOf(queryIdentity(group[0]!.text)) + group[0]!.text.length,
      original.indexOf(queryIdentity(group.at(-1)!.text)),
    );
    const join = /\bor\b|(?:^|\s)او(?:\s|$)/iu.test(between)
      ? 'any'
      : /\band\b|(?:^|\s)و(?:\s|$)/iu.test(between)
        ? 'all'
        : null;
    if (join) for (const item of group) item.join = join;
  }
  return intent;
}
