import { normalized } from './core';
const stop = new Set(
  'a an the project projects related relation about involving involve involves using use uses with for to or and of me find give show would like please it this that work works containing that involves فيما بحث ابحث مشروع مشاريع عن متعلق متعلقة يتعلق او و في من يستخدم تستخدم استخدام اجهزة جهاز'.split(
    ' ',
  ),
);
const families = [
  [
    'sensor',
    'sensors',
    'sensing',
    'حساس',
    'حساسات',
    'مستشعر',
    'مستشعرات',
    'استشعار',
    'الاستشعار',
  ],
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
    'بحر',
    'بحار',
    'بحري',
    'سيول',
    'فيضانات',
    'ساحل',
  ],
  ['arabic', 'nlp', 'العربية', 'عربي', 'عربية'],
  ['energy', 'solar', 'electricity', 'طاقة', 'الطاقة', 'شمسية', 'كهرباء'],
];
const words = (text: string) =>
  normalized(text.replace(/([a-z])([A-Z])/g, '$1 $2')).match(
    /[\p{L}\p{N}]+/gu,
  ) ?? [];
const stem = (word: string) =>
  word.endsWith('s') && word.length > 4
    ? word.slice(0, -1)
    : word.replace(/^ال(?=.{3})/u, '');
export function searchTopic(query: string) {
  if (
    /without\s+sensors?|(?:do|does)\s+not\s+use\s+sensors?|بدون\s+(?:مستشعرات|حساسات)/iu.test(
      query,
    )
  )
    return '!sensor';
  const tokens = words(query).filter(
    (word) => word.length > 2 && !stop.has(word),
  );
  return [
    ...new Set(
      tokens.map(
        (word) =>
          families.find((f) =>
            f.some((alias) => stem(alias) === stem(word)),
          )?.[0] ?? stem(word),
      ),
    ),
  ].join(' ');
}
export function positiveMatch(topic: string, text: string) {
  if (topic === '!sensor')
    return text
      .split(/\n|(?<=[.!?])\s+/)
      .some((part) =>
        /(?:without\s+sensors?|(?:do|does)\s+not\s+use\s+sensors?|بدون\s+(?:مستشعرات|حساسات))/iu.test(
          part,
        ),
      );
  const parts = text
    .split(/\n|(?<=[.!?])\s+/)
    .filter(
      (part) =>
        !/(?:outside|out of|beyond).{0,30}(?:scope|demonstrator)|excluded|does not use|does not include|لا يستخدم|خارج.{0,20}نطاق/iu.test(
          part,
        ),
    );
  const tokens = words(topic);
  if (!tokens.length) return false;
  const evidence = words(parts.join('\n')).map(stem),
    positive = (token: string) => {
      const family = families.find((f) => f[0] === token) ?? [token];
      return family.some((alias) => {
        const needle = stem(alias);
        return evidence.some(
          (word, i) =>
            word === needle &&
            !/^(?:no|not|without|never|لا|ليس|بدون)$/.test(
              evidence.slice(Math.max(0, i - 4), i).join(' '),
            ) &&
            !evidence
              .slice(Math.max(0, i - 4), i)
              .some((w) =>
                ['no', 'not', 'without', 'never', 'لا', 'ليس', 'بدون'].includes(
                  w,
                ),
              ),
        );
      });
    };
  return tokens.some(positive);
}
export function positiveSnippet(
  topic: string,
  title: string,
  abstract: string,
  keywords: string[],
) {
  const sentences = abstract.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chosen =
    sentences.find((s) => positiveMatch(topic, s)) ??
    sentences.find((s) => !/^no |^not |^this .*has no /i.test(s)) ??
    title;
  const suffix = positiveMatch(topic, title + ' ' + keywords.join(' '))
    ? ''
    : '';
  return chosen.slice(0, 300) + (chosen.length > 300 ? '…' : '') + suffix;
}
