import { AIError, type AISource, type AILocale } from './types';
import { suppressProseCoordinates } from './prose-coordinates';
import {
  methodComputationSupport,
  methodOutputSupport,
} from './computation-bindings';
import { setDifferenceSupport } from './source-method-validation';
import {
  numbers,
  normalized,
  groundedPaths,
  groundedTechnicalTerms,
  academicNumericClaim,
  isSourceInstruction,
  unsupportedCertainty,
} from './core';
export function answerLanguage(
  question: string,
  page: AILocale,
  history: { question: string; answer: string }[] = [],
): AILocale {
  if (/in English|بالإنجليزي|بالانجليزي/iu.test(question)) return 'en';
  if (/in Arabic|بالعربي/iu.test(question)) return 'ar';
  if (/[\u0600-\u06ff]/u.test(question)) return 'ar';
  if (/[a-z]{3}/iu.test(question)) return 'en';
  return /[\u0600-\u06ff]/u.test(history.at(-1)?.question ?? '') ? 'ar' : page;
}
export function normalizeValidation(value: string | null) {
  return value !== null && /^(?:null|none|n\/a)$/i.test(value.trim())
    ? null
    : value;
}
export function roundedDecimal(raw: string, places: number) {
  if (!/^-?\d+(?:\.\d+)?$/.test(raw) || places < 0 || places > 10) return null;
  const negative = raw.startsWith('-'),
    [integer, fraction = ''] = raw.replace(/^-/, '').split('.'),
    keep = fraction.padEnd(places, '0').slice(0, places),
    up = Number(fraction[places] ?? 0) >= 5;
  const value = BigInt(integer! + keep) + (up ? 1n : 0n);
  let digits = value.toString().padStart(places + 1, '0');
  if (places) digits = digits.slice(0, -places) + '.' + digits.slice(-places);
  digits = digits.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return negative && value !== 0n ? '-' + digits : digits;
}
const approximate = /approximately|approx\.?|about|around|≈|نحو|حوالي|تقريب/iu;
function objects(text: string) {
  const values: unknown[] = [];
  for (const raw of [text, '{' + text + '}'])
    try {
      values.push(JSON.parse(raw));
      break;
    } catch {
      /* A normal text/source file need not be JSON. */
    }
  const stats: {
    key: string;
    mean: string;
    n: number | null;
    min: number | null;
    max: number | null;
  }[] = [];
  const walk = (v: unknown, key: string, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 15) return;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 200)) walk(x, key, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    if (typeof o.mean === 'number' && Number.isFinite(o.mean))
      stats.push({
        key,
        mean: String(o.mean),
        n: typeof o.valid_n === 'number' ? o.valid_n : null,
        min: typeof o.min === 'number' ? o.min : null,
        max: typeof o.max === 'number' ? o.max : null,
      });
    for (const [k, x] of Object.entries(o)) walk(x, k, depth + 1);
  };
  for (const v of values) walk(v, '', 0);
  return stats;
}
const aliases: Record<string, RegExp> = {
  accuracy: /accuracy|دقة/iu,
  baseline: /baseline|اساسي|الاساسي|مرجعي|المرجعي/iu,
  constrained: /constrained|مقيد|المقيد|بالقيود/iu,
  cost: /cost|تكلف|تكاليف/iu,
  violations: /violation|انتهاك|مخالف/iu,
  unreachable: /unreachable|غير قابل.{0,8}الوصول/iu,
  oracle: /oracle|مرجع مستقل|تعداد المسارات/iu,
};
function fieldPosition(text: string, key: string) {
  const exact = text.indexOf(key);
  if (exact >= 0) return exact;
  const parts = key.split('_');
  const positions = parts.map((part) =>
    [
      ...text.matchAll(
        new RegExp(
          (aliases[part] ?? new RegExp('\\b' + part + '\\b', 'iu')).source,
          'giu',
        ),
      ),
    ].map((match) => match.index),
  );
  if (positions.some((found) => !found.length)) return -1;
  // Bind natural-language field names locally. A second metric in the same
  // sentence must not inherit the first metric's mean or denominator.
  for (const anchor of positions[0]!) {
    const nearest = positions.map(
      (found) =>
        [...found].sort(
          (a, b) => Math.abs(a - anchor) - Math.abs(b - anchor),
        )[0]!,
    );
    if (nearest.every((at) => Math.abs(at - anchor) <= 45))
      return Math.min(...nearest);
  }
  return -1;
}
export function numericSupport(
  answer: string,
  evidence: string,
  quantitySources: string[] = [evidence],
) {
  // A simulated temperature signal does not define degrees/Celsius/Fahrenheit.
  // Keep standardized scores and degrees of freedom separate from units.
  const degreeClaims = [
    ...answer.matchAll(
      /[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?\s*(?:degrees?|درجات|درجة|°(?:\s*[CF])?)/giu,
    ),
  ];
  if (
    degreeClaims.some(
      (claim) =>
        !/^\s*(?:of freedom|معياري|حرية)/iu.test(
          answer.slice(claim.index! + claim[0].length),
        ),
    ) &&
    !/degrees?|°|celsius|fahrenheit|kelvin|درجة|درجات/iu.test(evidence)
  )
    return false;
  for (const text of quantitySources) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      try {
        data = JSON.parse('{' + text + '}');
      } catch {
        continue;
      }
    }
    const visit = (v: unknown, depth: number): boolean => {
      if (!v || typeof v !== 'object' || depth > 15) return false;
      if (Array.isArray(v))
        return v.some(
          (value) =>
            value && typeof value === 'object' && visit(value, depth + 1),
        );
      for (const [key, value] of Object.entries(v)) {
        if (value === null) {
          const lower = normalized(answer),
            at = lower.indexOf(normalized(key));
          if (at >= 0) {
            const clause = lower.slice(at).split(/(?<!\d)[.;!؟](?!\d)/u)[0]!;
            if (
              numbers(clause).length &&
              !/not zero|not a measurement|ليس.{0,10}صفر|لا يعني.{0,10}صفر/iu.test(
                clause,
              )
            )
              return true;
          }
        } else if (
          value &&
          typeof value === 'object' &&
          visit(value, depth + 1)
        )
          return true;
      }
      return false;
    };
    if (visit(data, 0)) return false;
  }
  if (
    /accuracy|precision|recall|\bf1\b|دقة/iu.test(answer) &&
    numbers(answer).length &&
    !/accuracy|precision|recall|\bf1\b|دقة/iu.test(evidence)
  )
    return false;
  if (
    /(?:missing|not reported|null|غير موثق|غير متاح).{0,35}(?:therefore|means|يعني).{0,15}(?:zero|0|صفر)/iu.test(
      answer,
    )
  )
    return false;
  const claims = numbers(answer),
    raw = numbers(evidence),
    approx = approximate.test(answer);
  for (const value of claims)
    if (
      !raw.includes(value) &&
      !(
        approx &&
        raw.some(
          (n) =>
            roundedDecimal(n, (value.split('.')[1] ?? '').length) === value,
        )
      )
    )
      return false;
  const sentence = normalized(answer);
  const quantities = quantitySources.flatMap(objects);
  const positions = new Map(
    quantities.map((stat) => [stat.key, fieldPosition(sentence, stat.key)]),
  );
  for (const stat of quantities) {
    const position = positions.get(stat.key) ?? -1,
      named = position >= 0;
    if (!named || !/mean|average|متوسط/iu.test(sentence)) continue;
    const nextPosition =
      quantities
        .map((other) => positions.get(other.key) ?? -1)
        .filter((i) => i > position)
        .sort((a, b) => a - b)[0] ?? -1;
    const segment =
      position < 0
        ? sentence
        : sentence.slice(position, nextPosition < 0 ? undefined : nextPosition);
    if (
      position >= 0 &&
      !/mean|average|متوسط/iu.test(
        segment + ' ' + sentence.slice(Math.max(0, position - 35), position),
      )
    )
      continue;
    const meanMatch =
      /(?:mean|average|متوسط)[^\d.!?;؛،\n]{0,50}([-+]?\d+(?:\.\d+)?)/iu.exec(
        segment,
      ) ??
      (/(?:mean|average|متوسط)[^.!?;،]{0,35}$/iu.test(
        sentence.slice(Math.max(0, position - 35), position),
      )
        ? /^[^\d.!?;،]{0,80}([-+]?\d+(?:\.\d+)?)/u.exec(segment)
        : null);
    const candidates = meanMatch ? [meanMatch[1]!] : [];
    // A description of stored statistics is not itself a mean claim. Counts
    // elsewhere in that description must not become this metric's denominator.
    if (!meanMatch) continue;
    if (
      candidates.length &&
      !candidates.some(
        (n) =>
          n === stat.mean ||
          (approx &&
            roundedDecimal(stat.mean, (n.split('.')[1] ?? '').length) === n),
      )
    )
      return false;
    const denominators = [
      ...segment.matchAll(
        /(?:over|across|valid_n\s*[=:]?|out of)\s*(\d+)|(\d+)\s*(?:reachable\s+)?(?:cases|observations|instances|حالة|حالات|ملاحظة)/giu,
      ),
    ].map((m) => Number(m[1] ?? m[2]));
    if (stat.n !== null && denominators.some((n) => n !== stat.n)) return false;
  }
  if (
    /(?:including|include|عد|احتساب).{0,25}-1.{0,25}(?:mean|average|cost|متوسط|تكلفة)|unreachable.{0,25}(?:zero cost|cost of 0)|غير قابل.{0,20}تكلفة.{0,8}صفر/iu.test(
      answer,
    )
  )
    return false;
  if (
    /improv|reduc|better|تحسن|خفض/iu.test(answer) &&
    /mean|average|متوسط/iu.test(answer)
  ) {
    const stats = quantitySources
      .flatMap(objects)
      .filter((s) => /cost/.test(s.key));
    if (new Set(stats.map((s) => s.n)).size > 1) return false;
  }
  return true;
}
export function assertionTargets(evidence: string) {
  const asserted = [
    ...evidence.matchAll(/\bassert\s+([a-z_]\w*)\s*(?:==|<=|>=|<|>)/gi),
  ].map((m) => m[1]!);
  return [
    ...new Set(
      [...evidence.matchAll(/['"]([a-z_]\w*)['"]\s*:\s*([a-z_]\w*)/gi)]
        .filter((m) => asserted.includes(m[2]!))
        .map((m) => m[1]!),
    ),
  ];
}
export function semanticSupport(answer: string, evidence: string) {
  const a = normalized(answer),
    e = normalized(evidence);
  for (const match of a.matchAll(/الانحراف التدريبي|training drift/giu))
    if (
      !/الانحراف التدريبي|training drift/iu.test(e) &&
      !/(?:not|rather than|ليس|وليس|لا)\s*$/iu.test(
        a.slice(Math.max(0, match.index - 20), match.index),
      )
    )
      return false;
  if (
    /assert|validat(?:ed|es|ion against)|verif(?:ied|ies)|تأكيد|تاكيد|التحقق|تحقق/iu.test(
      a,
    ) &&
    /baseline|distance.only|المسافة فقط|الاساسي/iu.test(a) &&
    !/not (?:separately |directly |individually )?(?:assert|validat|verif)|no.{0,25}(?:baseline assertion|validation|verification)|without.{0,20}(?:assertion|validation|verification)|rather than.{0,30}assert|لا.{0,20}(?:تاكيد|تأكيد|تحقق)/iu.test(
      a,
    )
  ) {
    const fields = assertionTargets(evidence);
    if (fields.length && !fields.some((field) => /baseline/i.test(field)))
      return false;
  }
  for (const match of a.matchAll(
    /\bguarantee(?:s|d)?\b|proves?.{0,25}(?:correctness|correct)|يضمن|تثبت.{0,15}صحة الخوارزمية|يؤكد.{0,15}صحة الخوارزمية/giu,
  )) {
    const before = a.slice(Math.max(0, match.index - 100), match.index);
    if (
      !/(?:\bno|\bnot|\bwithout|rather than|\bnor|cannot)\s+(?:[a-z-]+\s+){0,3}$|(?:لا|لم|لن|دون)\s*$/iu.test(
        before,
      )
    )
      return false;
  }
  if (
    /not certified|uncertified|غير معتمد|ليس.{0,35}معتمد/iu.test(a) &&
    !/not certified|uncertified|غير معتمد|ليس.{0,35}معتمد/iu.test(e)
  )
    return false;
  if (
    /safe (?:edges|routes|paths)|مسارات امنة|طرق امنة/iu.test(a) &&
    !/model|synthetic|simulat|نموذج|اصطناع|محاك/iu.test(a)
  )
    return false;
  if (
    /(?:no|without|not require).{0,25}external private dataset|لا.{0,20}بيانات.{0,20}خاص/iu.test(
      a,
    ) &&
    !/no external private dataset|no personal data|without.{0,20}private|لا.{0,20}بيانات/iu.test(
      e,
    )
  )
    return false;
  for (const [claim, negative] of [
    [
      /(?:models?|simulates?) (?:field )?packet loss|يحاكي.{0,10}فقد.{0,10}حزم/iu,
      /does not emulate field packet loss|does not model.{0,15}packet loss/iu,
    ],
    [
      /field.validated|validated in the field|تم.{0,10}تحقق.{0,10}ميداني/iu,
      /no field|not field|outside.{0,40}field|synthetic/iu,
    ],
  ] as const)
    if (claim.test(a) && negative.test(e) && !/not|لا |لم /iu.test(a))
      return false;
  return true;
}
export function validateAdaptiveClaim(
  text: string,
  ids: string[],
  sources: AISource[],
  subject = '',
) {
  if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length)
    throw new AIError('UNSUPPORTED_CITATION', 422, {
      reason: 'empty-excess-or-duplicate-citation-list',
      citationIds: ids.join(','),
      candidate: text.slice(0, 1300),
    });
  const refs = ids.map((id) => sources.find((s) => s.id === id));
  if (refs.some((s) => !s))
    throw new AIError('UNSUPPORTED_CITATION', 422, {
      reason: 'citation-id-outside-read-registry',
      citationIds: ids.join(','),
      candidate: text.slice(0, 1300),
    });
  const evidence = (refs as AISource[])
    .map((s) => s.text + '\n' + s.name)
    .join('\n');
  const sourceName = (id: string) => {
    if (evidence.includes(id)) return id; // Literal code/data, not a protocol reference.
    const source = sources.find((source) => source.id === id);
    if (
      !source ||
      !(refs as AISource[]).some(
        (ref) =>
          ref.id === id ||
          (ref.file !== null &&
            ref.file === source.file &&
            ref.project === source.project &&
            ref.version === source.version &&
            ref.hash === source.hash),
      )
    )
      throw new AIError('UNSUPPORTED_CITATION', 422, {
        protocolId: id,
        citationIds: ids.join(','),
        candidate: text.slice(0, 1300),
      });
    return source.name;
  };
  const answer = suppressProseCoordinates(text, evidence)
    .replace(/\[S\d{1,3}\]/g, (marker) => {
      sourceName(marker.slice(1, -1));
      return '';
    })
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/\bS\d{1,3}\s*[-–]\s*S\d{1,3}\b/g, (range) => {
      if (evidence.includes(range)) return range;
      const ids = range.match(/S\d+/g)!,
        left = sourceName(ids[0]!),
        right = sourceName(ids[1]!);
      return left === right ? left : left + ' / ' + right;
    })
    .replace(/\bS\d{1,3}\b/g, sourceName);
  if (
    /<\/?[a-z][^>]*>|https?:\/\/|javascript:/iu.test(answer) ||
    isSourceInstruction(answer) ||
    academicNumericClaim(answer)
  )
    throw new AIError('UNSUPPORTED_CLAIM', 422);
  const checks = {
    paths: groundedPaths(answer, evidence),
    terms: groundedTechnicalTerms(answer, evidence),
    certainty: !unsupportedCertainty(answer, evidence),
    numeric: numericSupport(
      answer,
      evidence,
      (refs as AISource[]).map((s) => s.text),
    ),
    semantic:
      semanticSupport(subject + ' ' + answer, evidence) &&
      methodComputationSupport(subject, answer, evidence) &&
      methodOutputSupport(subject, answer, evidence),
    methodComputations: methodComputationSupport(subject, answer, evidence),
    methodOutputs: methodOutputSupport(subject, answer, evidence),
    setDirection: setDifferenceSupport(answer, evidence),
  };
  if (Object.values(checks).some((value) => !value))
    throw new AIError('UNSUPPORTED_CLAIM', 422, {
      ...checks,
      candidate: answer.slice(0, 1300),
      sourceIds: ids.join(','),
      subject,
      assertionTargets: assertionTargets(evidence).join(', '),
    });
  const quotes = [...answer.matchAll(/[“"]([^”"\n]{8,})[”"]/g)].map(
    (m) => m[1]!,
  );
  if (quotes.some((quote) => !evidence.includes(quote)))
    throw new AIError('UNSUPPORTED_QUOTE', 422);
  return { answer: answer.trim(), refs: refs as AISource[] };
}

/** Complete one missing implementation citation, never a missing fact. This is
 * limited to the already-read code registry; all original checks run again. */
export function validateMethodClaim(
  text: string,
  ids: string[],
  sources: AISource[],
  subject = '',
) {
  try {
    const validated = validateAdaptiveClaim(text, ids, sources, subject);
    const implementation = (source: AISource) =>
      source.file && /\.(py|ts|js|java|cpp|c)$/i.test(source.name);
    if (
      /dijkstra|heap[ -]based|priority[ -]queue|heappush|heappop|ديكسترا|طابور.{0,12}أولوية/iu.test(
        text,
      ) &&
      /comput|\buses?\b|using|execut|implement|يستخدم|تنفيذ|ينفذ/iu.test(
        text,
      ) &&
      sources.some(implementation) &&
      !validated.refs.some(implementation)
    )
      throw new AIError('UNSUPPORTED_CLAIM', 422, {
        implementation: false,
        reason: 'named-implementation-claim-needs-inspected-code-citation',
        subject,
        candidate: text.slice(0, 1300),
      });
    return {
      ...validated,
      ids,
      completed: false,
    };
  } catch (error) {
    if (
      !(error instanceof AIError) ||
      error.code !== 'UNSUPPORTED_CLAIM' ||
      (error.diagnostic?.['numeric'] !== false &&
        error.diagnostic?.['implementation'] !== false) ||
      ids.length >= 4
    )
      throw error;
    const matches = sources
      .filter(
        (source) =>
          source.file &&
          /\.(py|ts|js|java|cpp|c)$/i.test(source.name) &&
          !ids.includes(source.id),
      )
      .flatMap((source) => {
        try {
          const completedIds = [...ids, source.id];
          return [
            {
              ...validateAdaptiveClaim(text, completedIds, sources, subject),
              ids: completedIds,
              completed: true,
            },
          ];
        } catch {
          return [];
        }
      });
    if (matches.length !== 1) throw error;
    return matches[0]!;
  }
}
