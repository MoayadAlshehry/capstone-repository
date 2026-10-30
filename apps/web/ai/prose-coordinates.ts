/** Generated prose cannot assign a source line/page. Native references own
 * those coordinates. Preserve literal code and exact source quotations. */
export function suppressProseCoordinates(text: string, evidence: string) {
  const number = '[0-9٠-٩۰-۹]+(?:\\s*[-–]\\s*[0-9٠-٩۰-۹]+)?';
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`|“[^”\n]*”|"[^"\n]*")/gu)
    .map((part) => {
      if (part.startsWith('```')) return part;
      if (part.startsWith('`')) {
        const delimiter = part.startsWith('```') ? 3 : 1;
        if (evidence.includes(part.slice(delimiter, -delimiter))) return part;
      }
      if (
        (part.startsWith('“') || part.startsWith('"')) &&
        evidence.includes(part.slice(1, -1))
      )
        return part;
      const clean = part
        .replace(
          new RegExp(
            '\\b(?:on|at|in)\\s+(?:the\\s+)?(?:lines?|pages?)\\s*' +
              number +
              '(?:\\s+(of|in))?',
            'giu',
          ),
          (_raw, relation: string | undefined) => (relation ? 'in' : ''),
        )
        .replace(
          new RegExp(
            '(?:في|عند)\\s+(?:ال)?(?:سطر|أسطر|اسطر|صفحة|صفحات)\\s*' +
              number +
              '(?:\\s+(من))?',
            'gu',
          ),
          (_raw, relation: string | undefined) => (relation ? 'في' : ''),
        )
        .replace(new RegExp('\\b(?:lines?|pages?)\\s*' + number, 'giu'), '')
        .replace(
          new RegExp('(?:ال)?(?:سطر|أسطر|اسطر|صفحة|صفحات)\\s*' + number, 'gu'),
          '',
        );
      return /^`+$/.test(clean) ? '' : clean.replace(/ {2,}/g, ' ');
    })
    .join('')
    .trim();
}
