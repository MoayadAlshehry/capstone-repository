import { z } from 'zod';
import { validateAnswerLine } from './core';
import { AIError, type AISource, type RichBlock, type AILocale } from './types';
export const richOutputSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            label: z.enum([
              'Problem',
              'Method',
              'Inputs',
              'Outputs',
              'Validation',
              'Limitations',
            ]),
            value: z.string().trim().min(12).max(600),
            sourceIds: z.array(z.string().regex(/^S\d{1,3}$/)).length(1),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export function validateRichRow(
  row: z.infer<typeof richOutputSchema>['rows'][number],
  sources: AISource[],
) {
  if (/<\/?[a-z][^>]*>|https?:\/\/|javascript:/iu.test(row.value))
    throw new AIError('INVALID_OUTPUT', 422);
  row.value = validateAnswerLine(
    { answer: row.value, citations: row.sourceIds },
    sources,
  ).answer;
  const evidence = sources
    .filter((s) => row.sourceIds.includes(s.id))
    .map((s) => s.text + '\n' + s.name)
    .join('\n');
  for (const [claim, proof] of [
    [/oracle|تعداد كامل|مرجع مستقل/iu, /oracle|enumerat|تعداد|مرجع مستقل/iu],
    [/\bCSV\b/iu, /\bcsv\b|\.csv/iu],
    [/\bJSON\b/iu, /\bjson\b|\.json/iu],
    [/معاير[ةه]|calibration/iu, /calibrat|معاير/iu],
  ] as const)
    if (claim.test(row.value) && !proof.test(evidence))
      throw new AIError('UNSUPPORTED_CLAIM', 422);
}
/** Unsupported claims can be explicitly omitted; invalid shapes/HTML remain fatal. */
export function supportedRichRows(value: unknown, sources: AISource[]) {
  const parsed = richOutputSchema.parse(value),
    omitted: string[] = [],
    rejected: {
      label: string;
      reason: string;
      sourceIds: string[];
      candidate: string;
    }[] = [];
  if (new Set(parsed.rows.map((r) => r.label)).size !== parsed.rows.length)
    throw new AIError('INVALID_OUTPUT', 422);
  const rows = parsed.rows.filter((row) => {
    try {
      validateRichRow(row, sources);
      return true;
    } catch (error) {
      if (!(
        error instanceof AIError &&
        ['UNSUPPORTED_CLAIM', 'UNSUPPORTED_CITATION'].includes(error.code)
      ))
        throw error;
      omitted.push(row.label);
      rejected.push({
        label: row.label,
        reason: error.code,
        sourceIds: row.sourceIds,
        candidate: row.value,
      });
      return false;
    }
  });
  if (rows.length < 1) throw new AIError('UNSUPPORTED_CLAIM', 422);
  return { rows, omitted, rejected };
}
export function validateRichOutput(
  value: unknown,
  sources: AISource[],
  kind: 'specSheet' | 'evidenceTable',
  locale: AILocale,
): RichBlock {
  const parsed = richOutputSchema.parse(value),
    labels = new Set<string>();
  for (const row of parsed.rows) {
    if (/<\/?[a-z][^>]*>|https?:\/\/|javascript:/iu.test(row.value))
      throw new AIError('INVALID_OUTPUT', 422);
    if (labels.has(row.label)) throw new AIError('INVALID_OUTPUT', 422);
    labels.add(row.label);
    validateRichRow(row, sources);
  }
  const ar: Record<string, string> = {
    Problem: 'المشكلة',
    Method: 'المنهج',
    Inputs: 'المدخلات',
    Outputs: 'المخرجات',
    Validation: 'التحقق',
    Limitations: 'القيود',
  };
  const rows = parsed.rows.map((r) => ({
    ...r,
    label: locale === 'ar' ? ar[r.label]! : r.label,
  }));
  return kind === 'specSheet'
    ? {
        type: kind,
        title: locale === 'ar' ? 'مواصفات المشروع' : 'Project spec sheet',
        rows,
      }
    : {
        type: kind,
        title: locale === 'ar' ? 'جدول الأدلة' : 'Evidence table',
        columns:
          locale === 'ar'
            ? ['الجانب', 'الدليل الموثق']
            : ['Aspect', 'Documented evidence'],
        rows: rows.map((r) => ({
          cells: [r.label, r.value],
          sourceIds: r.sourceIds,
        })),
      };
}
export const FACT_LABELS = [
  'Problem',
  'Method',
  'Inputs',
  'Outputs',
  'Validation',
  'Limitations',
] as const;
export function requestedFacets(question: string) {
  const patterns = [
    /problem|المشكل/iu,
    /method|how.*work|algorithm|منهج|طريق|خوارزم|كيف.*يعمل/iu,
    /inputs?|مدخل/iu,
    /outputs?|مخرج/iu,
    /validat|test|تحقق|اختبار/iu,
    /limitat|caveat|قيود|حدود/iu,
  ];
  return FACT_LABELS.filter((_, i) => patterns[i]!.test(question));
}
export function structuredIntent(
  question: string,
  history: { question: string; answer: string }[] = [],
) {
  const table = /\btable\b|جدول/iu.test(question);
  const followup =
    /put (?:that|it|them|this)|make (?:that|it|this)|ضعها|ضعه|حولها|حوّلها/iu.test(
      question,
    );
  const context =
    question + (followup ? '\n' + (history.at(-1)?.question ?? '') : '');
  if (
    table &&
    /sections?|headings?|contents?|أقسام|عناوين|محتويات/iu.test(context) &&
    /[\w/-]+\.(?:md|txt)\b/iu.test(context)
  )
    return 'documentTable';
  if (
    table &&
    /contents?|files?|inventory|manifest|محتويات|ملفات|محتوى المشروع/iu.test(
      context,
    ) &&
    !/[\w/-]+\.(?:md|pdf|txt|py|csv)\b/iu.test(question)
  )
    return 'fileTable';
  return /spec[ -]?sheet|مواصفات/i.test(question)
    ? 'specSheet'
    : table
      ? 'evidenceTable'
      : null;
}
