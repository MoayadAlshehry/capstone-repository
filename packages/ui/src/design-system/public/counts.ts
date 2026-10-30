export function projectCount(n: number, ar = false) {
  if (!ar) return `${n} ${n === 1 ? 'project' : 'projects'}`;
  const v = new Intl.NumberFormat('ar-SA-u-nu-arab').format(n);
  switch (new Intl.PluralRules('ar').select(n)) {
    case 'zero':
      return 'لا توجد مشاريع';
    case 'one':
      return 'مشروع واحد';
    case 'two':
      return 'مشروعان';
    case 'few':
      return `${v} مشاريع`;
    case 'many':
      return `${v} مشروعًا`;
    default:
      return `${v} مشروع`;
  }
}
export function reviewCount(n: number, ar = false) {
  if (!ar) return `${n} completed ${n === 1 ? 'review' : 'reviews'}`;
  const v = new Intl.NumberFormat('ar-SA-u-nu-arab').format(n);
  switch (new Intl.PluralRules('ar').select(n)) {
    case 'zero':
      return 'لا توجد مراجعات مكتملة';
    case 'one':
      return 'مراجعة مكتملة واحدة';
    case 'two':
      return 'مراجعتان مكتملتان';
    case 'few':
      return `${v} مراجعات مكتملة`;
    default:
      return `${v} مراجعة مكتملة`;
  }
}
