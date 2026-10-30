import type { AISource, AILocale } from './types';
import { methodOutputBindings } from './computation-bindings';

export function setDifferenceSupport(answer: string, evidence: string) {
  if (
    !/len\(set\([a-z_]\w*\)\s*-\s*(?:truth|reference|expected)\)/i.test(
      evidence,
    )
  )
    return true;
  const text = answer
    .normalize('NFKC')
    .replace(/[\u0640\u064b-\u065f\u0670]/g, '');
  for (const clause of text.matchAll(
    /(?:subtract(?:ing)?|طرح)\s+([^.;!؟\n]{3,240}?)\s+(?:from|من)\s+([^.;!؟\n]{3,200})/giu,
  )) {
    const before = text.slice(0, clause.index);
    if (
      /(?:not\s+|rather than\s+|instead of\s+|لا\s+|لا يتم\s+|دون\s+)$/iu.test(
        before,
      )
    )
      continue;
    // A reversed subtraction is only contradictory when it describes false
    // positives. False negatives legitimately use the opposite direction.
    const sentence = before.slice(
      Math.max(
        ...['.', ';', '!', '؟', '\n'].map((mark) => before.lastIndexOf(mark)),
      ) + 1,
    );
    const metrics = [
      ...sentence.matchAll(
        /false[- _]?(?:alarms?|positives?|negatives?)|(?:ال)?[إا]نذارات\s+(?:ال)?كاذبة|(?:ال)?[إا]يجابيات\s+(?:ال)?كاذبة|(?:ال)?سلبيات\s+(?:ال)?كاذبة/giu,
      ),
    ];
    const metric = metrics.at(-1)?.[0];
    if (!metric || /negatives?|سلبيات/iu.test(metric)) continue;
    if (
      /detected|identified|predicted|المكتشف|تم تحديد|المحدد/iu.test(
        clause[1]!,
      ) &&
      /truth|reference|known|الحقيق|المرجعي|المعروف/iu.test(clause[2]!)
    )
      return false;
  }
  return true;
}

/** Literal source-derived receipts, never execution or a claim a test passed.
 * Only a uniquely bound method and bounded safe expressions are supported. */
export function sourceMethodValidation(
  subject: string,
  sources: AISource[],
  locale: AILocale,
) {
  const candidates = sources
    .filter((source) => source.file && /\.py$/i.test(source.name))
    .flatMap((source) => {
      const bindings = methodOutputBindings(subject, source.text).slice(0, 6);
      if (!bindings.length) return [];
      const receipts: string[] = [];
      for (const binding of bindings) {
        const expression = binding.expressions[0]!;
        if (!/^[a-zA-Z0-9_()[\].+\-*/&| ,<>!=]{1,200}$/.test(expression))
          return [];
        const difference = /^len\(set\(([a-z_]\w*)\)\s*-\s*([a-z_]\w*)\)$/.exec(
          expression.trim(),
        );
        receipts.push(
          difference
            ? locale === 'ar'
              ? `\`${binding.field}\`: عدد العناصر المميزة في \`${difference[1]}\` غير الموجودة في \`${difference[2]}\`؛ الحساب الموثق: \`${expression}\`.`
              : `\`${binding.field}\` counts unique entries in \`${difference[1]}\` that are not in \`${difference[2]}\`; documented calculation: \`${expression}\`.`
            : `\`${binding.field} = ${expression}\`.`,
        );
      }
      const text =
        (locale === 'ar'
          ? 'حسابات التقييم الموثقة في الكود: '
          : 'Documented code evaluation calculations: ') + receipts.join(' ');
      return text.length <= 800 ? [{ text, source }] : [];
    });
  return candidates.length === 1 ? candidates[0]! : null;
}
