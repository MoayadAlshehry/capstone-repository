const arabic: Record<string, string> = {
  'Duplicate destination within this upload.':
    'يوجد مسار وجهة مكرر ضمن هذا الرفع.',
  'Case or Unicode spelling conflicts with an existing path. Use its exact spelling or a different destination.':
    'تتعارض حالة الأحرف أو كتابة Unicode مع مسار موجود. استخدم كتابته المطابقة أو اختر وجهة مختلفة.',
  'Confirm replacement or skip this existing working mapping.':
    'أكد استبدال الملف في العمل الحالي أو تجاوز هذا الملف.',
  'Invalid path or size.': 'المسار أو حجم الملف غير صالح.',
  'Duplicate case-insensitive logical path':
    'مسار منطقي مكرر دون تمييز حالة الأحرف',
  'Unicode-normalization ambiguity':
    'التباس بين مسارات متكافئة بعد تطبيع Unicode',
  'Path exceeds 512 characters': 'يتجاوز المسار 512 حرفًا',
  'Path must be relative without a drive prefix':
    'يجب أن يكون المسار نسبيًا دون بادئة قرص',
  'Path contains a control, direction or invalid Unicode character':
    'يحتوي المسار على محرف تحكم أو اتجاه أو Unicode غير صالح',
  'Path contains an invalid or empty segment':
    'يحتوي المسار على جزء فارغ أو غير صالح',
  'Dependency, build and internal directories are excluded':
    'مجلدات الاعتماديات والبناء والمجلدات الداخلية مستبعدة',
  'Environment-secret files are excluded': 'ملفات أسرار البيئة مستبعدة',
  'Reserved device names are excluded': 'أسماء الأجهزة المحجوزة مستبعدة',
  'File name or extension is not allowlisted': 'اسم الملف أو امتداده غير مسموح',
  'File size must be 0–250,000,000 bytes':
    'يجب أن يكون حجم الملف بين 0 و250,000,000 بايت',
  'Project quota exceeded': 'تم تجاوز حصة المشروع',
  'Version exceeds 10,000 paths': 'يتجاوز الإصدار 10,000 مسار',
};
export function uploadIssues(issues: readonly string[], locale: string) {
  return issues
    .map((issue) =>
      locale === 'ar'
        ? (arabic[issue] ??
          'رفضت سياسة الملفات هذا العنصر؛ راجع نوع الملف والمسار والمحتوى')
        : issue,
    )
    .join('; ');
}

export function originalCountLabel(
  count: number,
  locale: string,
  kind: 'file' | 'folder' = 'file',
  directObject = false,
) {
  if (locale !== 'ar') return `${count} ${kind}${count === 1 ? '' : 's'}`;
  const plural = new Intl.PluralRules('ar').select(count);
  const noun = kind === 'file' ? 'ملف' : 'مجلد';
  if (plural === 'one') return noun + ' واحد';
  if (plural === 'two') return noun + (directObject ? 'ين' : 'ان');
  return `${count} ${plural === 'few' || plural === 'zero' ? noun + 'ات' : plural === 'many' ? noun + 'ًا' : noun}`;
}

export function uploadActionLabel(count: number, locale: string) {
  return (
    (locale === 'ar' ? 'رفع ' : 'Upload ') +
    originalCountLabel(count, locale, 'file', true)
  );
}
