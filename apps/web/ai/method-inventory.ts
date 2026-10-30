export function documentedMethods(abstract: string) {
  const names: string[] = [];
  for (const match of abstract.matchAll(/\bCompare\s+([^.!?]+)[.!?]/gi)) {
    const clause = match[1]!.split(/\s+(?:on|using)\s+/i)[0]!;
    for (const part of clause.split(/\s+(?:and|with)\s+|,\s*/i)) {
      const name = part.trim().replace(/^(?:a|an|the)\s+/i, '');
      if (name.length > 4 && name.length < 120) names.push(name);
    }
  }
  for (const match of abstract.matchAll(
    /\bReplay\s+[^.!?]{4,180}?\s+through\s+([^.!?]+)[.!?]/gi,
  ))
    for (const part of match[1]!.split(/\s+(?:and|with)\s+|,\s*/i)) {
      const name = part.trim().replace(/^(?:a|an|the)\s+/i, '');
      if (name.length > 4 && name.length < 120) names.push(name);
    }
  for (const match of abstract.matchAll(
    /\bUse\s+(.{5,100}?)\s+as\s+(?:an?\s+)?(?:independent|reference|small-instance)/gi,
  ))
    names.push(match[1]!.trim());
  return [...new Set(names)].map((name, i) => ({ id: 'method-' + i, name }));
}
export function meaningfulMethodCoverage(name: string, rawDescription: string) {
  const description = rawDescription
    .normalize('NFKC')
    .replace(/[\u0640\u064b-\u065f\u0670]/g, '');
  if (/z[ -]?score/i.test(name)) {
    // A sample's difference from a mean is not itself a standard deviation.
    // Keep legitimate references to the window's deviation (the denominator).
    if (
      /الانحراف المعياري (?:للقيمة|للقراءة|للعينة) (?:الحالية |الحالي )?عن/iu.test(
        description,
      )
    )
      return false;
    const mean = /mean|average|متوسط|الوسط الحسابي|معدل النافذة/iu.test(
        description,
      ),
      deviation =
        /standard deviations?|stddev|pstdev|window.{0,10}deviation|انحراف(?:ات)?\s+(?:ال)?معيار/iu.test(
          description,
        ),
      difference =
        /differen|subtract|minus|away from|فرق|طرح|تبتعد|ابتعاد|ب[َُ]?عد/iu.test(
          description,
        ),
      scaling =
        /divid|division|normaliz|standardi[sz]|قسمة|يقسم|تقسم|تقسيم|مقسوم|تقييس|بوحدات.{0,20}انحراف|how many.{0,25}standard deviations|عدد.{0,20}انحراف/iu.test(
          description,
        ),
      normalizedOperation = /normaliz|standardi[sz]|تقييس/iu.test(description);
    return (
      mean &&
      deviation &&
      scaling &&
      (difference ||
        normalizedOperation ||
        /how many.{0,25}standard deviations|عدد.{0,20}انحراف/iu.test(
          description,
        ))
    );
  }
  if (/enumerat|oracle/i.test(name))
    return /enumerat|oracle|all (?:possible )?paths|تعداد|جميع المسارات|مرجع مستقل/iu.test(
      description,
    );
  return description.trim().length >= 25;
}
