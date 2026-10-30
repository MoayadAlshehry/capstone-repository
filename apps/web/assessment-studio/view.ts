type Locale = 'en' | 'ar';
const t = (locale: Locale, en: string, ar: string) =>
  locale === 'ar' ? ar : en;
export function assessmentSaveLabel(
  locale: Locale,
  command: string,
  dirty: boolean,
  started: boolean,
) {
  if (command === 'saving') return t(locale, 'Saving', 'جارٍ الحفظ');
  if (command === 'unknown')
    return t(locale, 'Unknown outcome', 'نتيجة غير معروفة');
  if (command === 'conflict')
    return t(locale, 'Conflicting edit', 'تعديل متعارض');
  return dirty || !started
    ? t(locale, 'Unsaved', 'غير محفوظ')
    : t(locale, 'Saved on server', 'محفوظ على الخادم');
}
export type ReviewNoticeView = {
  type: string;
  route: string | null;
  created_at: string;
};
/** A presentation projection, never an acknowledgement or authorization decision. */
export function latestReviewerNotices<T extends ReviewNoticeView>(
  items: ReadonlyArray<T>,
): T[] {
  const seen = new Set<string>();
  return [...items]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .filter((item) => {
      if (!item.route?.startsWith('/reviewer/tasks/')) return true;
      if (seen.has(item.route)) return false;
      seen.add(item.route);
      return true;
    });
}
