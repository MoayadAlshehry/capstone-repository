/** Source coordinates are derived from the original text, never model output. */
export function sourcePosition(node?: {
  position?: { start: { line: number }; end: { line: number } } | undefined;
}) {
  return {
    'data-source-line-start': node?.position?.start.line,
    'data-source-line-end': node?.position?.end.line,
  };
}
export function csvSourceRanges(text: string) {
  const ranges: { start: number; end: number }[] = [];
  let quoted = false,
    line = 1,
    start = 1,
    offset = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    }
    if (char === '\r' || char === '\n') {
      if (!quoted) ranges.push({ start, end: line });
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++;
      if (!quoted) {
        start = line;
        offset = i + 1;
      }
    }
  }
  // The reader preserves real blank rows but omits a phantom terminal row.
  if (offset < text.length) ranges.push({ start, end: line });
  return ranges;
}
