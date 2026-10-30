import { normalized } from './core';
const stop = new Set(
  'a an the project projects related relation about with for to or and of me find give show would like please it this that بحث ابحث مشروع مشاريع عن متعلق متعلقة يتعلق او و في من'.split(
    ' ',
  ),
);
// Conservative domain synonyms. They select evidence, never rewrite the user's query.
const concepts = [
  [
    'water',
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
    'rainfall',
    'irrigation',
    'desalination',
    'مياه',
    'المياه',
    'ماء',
    'الماء',
    'بحر',
    'البحر',
    'بحار',
    'بحري',
    'بحرية',
    'سيول',
    'فيضانات',
    'ساحل',
    'السواحل',
  ],
  [
    'arabic',
    'language',
    'text',
    'nlp',
    'العربية',
    'عربي',
    'عربية',
    'لغة',
    'نصوص',
  ],
  ['energy', 'solar', 'electricity', 'طاقة', 'الطاقة', 'شمسية', 'كهرباء'],
];
export function topicEvidence(query: string, terms: string, evidence: string) {
  const words = (
    normalized(terms || query).match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((w) => w.length > 2 && !stop.has(w));
  if (!words.length) return false;
  const text =
    ' ' + normalized(evidence).replace(/[^\p{L}\p{N}]+/gu, ' ') + ' ';
  const tokens = words.flatMap(
    (word) =>
      concepts.find((group) =>
        group.some((alias) => normalized(alias) === word),
      ) ?? [word],
  );
  return tokens.some((token) =>
    new RegExp(
      '(?:^|[^\\p{L}])' + normalized(token) + '(?:s|ing|ed)?(?:$|[^\\p{L}])',
      'u',
    ).test(text),
  );
}
export function topicExcerpt(query: string, terms: string, evidence: string) {
  const sentences = evidence.split(/(?<=[.!?])\s+|\n/).filter(Boolean);
  const supported =
    sentences.find((sentence) => topicEvidence(query, terms, sentence)) ??
    evidence;
  return supported.length > 250 ? supported.slice(0, 247) + '…' : supported;
}
