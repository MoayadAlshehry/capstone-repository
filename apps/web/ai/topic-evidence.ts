import { queryIdentity } from './search-contract';
// Directional lexical expansion is corroborating IR evidence, never an ANY-
// token substitute for the Boolean query or an institutional constraint.
const groups = [
  {
    roots: ['water', 'waters', 'ماء', 'مياه'],
    related: [
      'water',
      'waters',
      'sea',
      'seas',
      'ocean',
      'marine',
      'coral',
      'reef',
      'coast',
      'coastal',
      'tide',
      'flood',
      'floods',
      'rainfall',
      'wadi',
      'wadis',
      'river',
      'rivers',
      'hydrology',
      'irrigation',
      'desalination',
      'مياه',
      'ماء',
      'بحر',
      'بحار',
      'بحري',
      'سيول',
      'فيضانات',
      'ساحل',
    ],
  },
  {
    roots: ['sea', 'seas', 'ocean', 'marine', 'بحر', 'بحار'],
    related: [
      'sea',
      'seas',
      'ocean',
      'marine',
      'coral',
      'reef',
      'coast',
      'coastal',
      'tide',
      'بحر',
      'بحار',
      'بحري',
      'ساحل',
    ],
  },
  {
    roots: [
      'sensor',
      'sensors',
      'sensing',
      'مستشعر',
      'مستشعرات',
      'حساس',
      'حساسات',
    ],
    related: [
      'sensor',
      'sensors',
      'sensing',
      'مستشعر',
      'مستشعرات',
      'حساس',
      'حساسات',
      'استشعار',
    ],
  },
  {
    roots: ['energy', 'طاقة'],
    related: ['energy', 'solar', 'electricity', 'طاقة', 'شمسية', 'كهرباء'],
  },
  { roots: ['arabic', 'عربي', 'عربية'], related: ['arabic', 'عربي', 'عربية'] },
];
const stop = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'for',
  'related',
  'research',
  'project',
  'projects',
  'use',
  'using',
]);
const words = (text: string) =>
  (
    queryIdentity(text.replace(/([a-z])([A-Z])/g, '$1 $2')).match(
      /[\p{L}\p{N}]+/gu,
    ) ?? []
  ).map((word) => word.replace(/^ال(?=.{3})/u, ''));
const stem = (word: string) =>
  word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
export function positiveTopicEvidence(
  term: string,
  text: string,
  expand: boolean,
  ignoreContext = false,
) {
  const tokens = words(term).filter((word) => !stop.has(word)),
    parts = text
      .split(/\n\s*\n|(?<=[.!?؟])\s+/)
      .filter(
        (part) =>
          ignoreContext ||
          !/(?:outside|out of|beyond).{0,35}(?:scope|demonstrator)|does not use|does not include|لا يستخدم|خارج.{0,20}نطاق/iu.test(
            part.replace(/\s+/g, ' '),
          ),
      );
  if (!tokens.length) return [];
  const matches = tokens.map((token) => {
    const variants = expand
      ? (groups.find((group) => group.roots.map(stem).includes(stem(token)))
          ?.related ?? [token])
      : [token];
    return parts.filter((part) => {
      const evidence = words(part).map(stem);
      return variants.some((variant) =>
        evidence.some(
          (word, i) =>
            word === stem(variant) &&
            (ignoreContext ||
              !evidence
                .slice(Math.max(0, i - 4), i)
                .some((before) =>
                  [
                    'no',
                    'not',
                    'without',
                    'never',
                    'ليس',
                    'لا',
                    'بدون',
                  ].includes(before),
                )),
        ),
      );
    });
  });
  return matches.every((found) => found.length)
    ? [...new Set(matches.flat())]
    : [];
}
export function languageEvidenceRequired(term: string) {
  return words(term).some((word) =>
    ['arabic', 'english', 'عربي', 'عربية', 'انجليزية'].includes(word),
  );
}
export function documentedLanguage(term: string, text: string) {
  return words(term)
    .filter((word) =>
      ['arabic', 'english', 'عربي', 'عربية', 'انجليزية'].includes(word),
    )
    .every((word) => positiveTopicEvidence(word, text, true).length > 0);
}
export function absentTopicEvidence(term: string, text: string) {
  const tokens = words(term)
    .filter((w) => !stop.has(w) && !['usage', 'استخدام'].includes(w))
    .map(stem);
  if (!tokens.length) return [];
  const parts = text.split(
    /\n|[,;؛]|(?<=[.!?؟])\s+|\b(?:but|however|whereas|and)\b|\s+(?:لكن|ولكن|بينما)\s+/iu,
  );
  const headMatches = (object: string) => {
    const head = words(object)
      .filter(
        (w) =>
          ![
            'a',
            'an',
            'the',
            'any',
            'project',
            'system',
            'study',
            'platform',
            'مشروع',
            'نظام',
            'منصة',
            'دراسة',
            'تطبيق',
            'أي',
            'اي',
          ].includes(w),
      )
      .map(stem);
    const matches = tokens.every((token, i) => {
      const equivalents = groups
        .find((g) => g.roots.map(stem).includes(token))
        ?.roots.map(stem) ?? [token];
      return head[i] !== undefined && equivalents.includes(head[i]!);
    });
    // A missing subtype/activity, e.g. sensor calibration, is not absence of sensors.
    return (
      matches &&
      (!head[tokens.length] ||
        [
          'are',
          'is',
          'used',
          'included',
          'required',
          'needed',
          'deployed',
          'for',
          'to',
          'in',
          'at',
          'مستخدم',
          'مستخدمة',
          'تستخدم',
          'للمراقبة',
        ].includes(head[tokens.length]!))
    );
  };
  const proven = parts.filter((part) => {
    if (/\b(?:may|might|could|possibly|perhaps)\b|ربما|قد\s/iu.test(part))
      return false;
    for (const match of part.matchAll(
      /\b(?:does not use|do not use|does not include|does not require|not using|without|no)\s+([^.!?؛]+)|(?:لا\s+(?:يستخدم|تستخدم|يستعمل|تستعمل|يتضمن|يتطلب)|بدون|دون)\s+([^.!?؛]+)/giu,
    )) {
      if (/\b(?:not|never)\s*$|ليس\s*$/iu.test(part.slice(0, match.index)))
        continue;
      if (headMatches(match[1] ?? match[2] ?? '')) return true;
    }
    const post =
      /^(.{1,100}?)\s+(?:are|is)\s+not\s+(?:used|included|required)\b|^(.{1,100}?)\s+غير\s+مستخدم(?:ة|ات)?/iu.exec(
        part.trim(),
      );
    return !!post && headMatches(post[1] ?? post[2] ?? '');
  });
  // Explicit positive evidence in another clause makes the absence claim contradictory.
  if (
    parts.some(
      (part) =>
        !proven.includes(part) &&
        /\b(?:uses?|using|used|requires?|includes?|employs?|contains?|present)\b|يستخدم|تستخدم|يستعمل|تستعمل|يتضمن|تتضمن/u.test(
          part,
        ) &&
        positiveTopicEvidence(term, part, true).length,
    )
  )
    return [];
  return proven;
}
