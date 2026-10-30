/** Replace one source-inventory subject, preserving every other draft row.
 * The caller must run the complete citation/content validator on the merge. */
export function replaceMethodRow<T extends { methodId: string }>(
  rows: T[],
  target: string,
  replacement: T,
  inventory: string[],
) {
  if (replacement.methodId !== target || !inventory.includes(target))
    throw Error('METHOD_REPAIR_BINDING');
  const first = rows.findIndex((row) => row.methodId === target),
    retained = rows.filter((row) => row.methodId !== target),
    position =
      first >= 0 ? first : Math.min(inventory.indexOf(target), retained.length);
  retained.splice(position, 0, replacement);
  return retained;
}

/** The focused computation repair must not answer the original broad project
 * question again. Reuse already-read implementation evidence where available. */
export function methodRowSources<
  T extends { file: string | null; name: string },
>(sources: T[]) {
  const implementations = sources.filter(
    (source) => source.file && /\.(py|ts|js|java|cpp|c)$/i.test(source.name),
  );
  return implementations.length ? implementations : sources;
}
