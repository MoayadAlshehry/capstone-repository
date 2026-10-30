import type { AISource, AILocale } from './types';
import { createHash } from 'node:crypto';
/** Read-only arithmetic over a complete current CSV; never a model-executable tool. */
export function recordedOutcomes(
  source: AISource,
  file: { id: string; size: number; sha256: string },
  locale: AILocale,
) {
  if (
    source.file !== file.id ||
    source.hash !== file.sha256 ||
    source.lineStart !== 1 ||
    !source.name.endsWith('.csv')
  )
    return null;
  const crlf = source.text.replaceAll('\n', '\r\n');
  if (
    ![
      source.text,
      source.text + '\n',
      source.text + '\r\n',
      crlf,
      crlf + '\r\n',
    ].some(
      (text) =>
        Buffer.byteLength(text) === file.size &&
        createHash('sha256').update(text).digest('hex') === file.sha256,
    )
  )
    return null;
  const rows = source.text.split(/\r?\n/),
    headers = rows.shift()!.split(','),
    flag = headers.indexOf('unreachable'),
    caseIndex = headers.indexOf('case');
  if (flag < 0 || caseIndex < 0 || !rows.length || rows.length > 200)
    return null;
  const cells = rows.map((row) => row.split(','));
  if (
    cells.some(
      (row) =>
        row.length !== headers.length ||
        !['0', '1'].includes(row[flag]!) ||
        !/^\d+$/.test(row[caseIndex]!),
    ) ||
    new Set(cells.map((row) => row[caseIndex])).size !== cells.length
  )
    return null;
  const total = cells.length,
    unreachable = cells.filter((row) => row[flag] === '1').length,
    reachable = total - unreachable,
    percent = (unreachable * 100) / total;
  const f = (n: number) => new Intl.NumberFormat(locale).format(n),
    rate = Number.isInteger(percent) ? ' (' + f(percent) + '%)' : '';
  return {
    total,
    unreachable,
    reachable,
    percent: Number.isInteger(percent) ? percent : null,
    text:
      locale === 'ar'
        ? `يتضمن ملف CSV العام الكامل المستشهد به ${f(total)} حالة: ${f(reachable)} حالة قابلة للوصول و${f(unreachable)} حالة مسجّلة بأنها غير قابلة للوصول${rate}. هذه خلاصة حسابية من السجلات المنشورة (${f(unreachable)} ÷ ${f(total)})، وليست تجربة جديدة ولا تعميمًا خارج مجموعة البيانات المسجّلة.`
        : `The cited complete public CSV records ${f(total)} cases: ${f(reachable)} reachable and ${f(unreachable)} marked unreachable${rate}. This is derived arithmetic from the recorded rows (${f(unreachable)} ÷ ${f(total)}), not a new experiment or a generalization beyond this dataset.`,
  };
}
