/** Keep public record selectors strict; citation locators never select authority. */
export function validPublicProjectQuery(query: URLSearchParams) {
  if (
    [...query.keys()].some(
      (k) => !['file', 'directory', 'from', 'filePage', 'fileLine'].includes(k),
    ) ||
    [...query.keys()].some((k) => query.getAll(k).length !== 1) ||
    (query.has('file') && query.has('directory'))
  )
    return false;
  const page = query.get('filePage'),
    line = query.get('fileLine');
  if ((page !== null || line !== null) && !query.has('file')) return false;
  if (page !== null && line !== null) return false;
  if (page !== null && (!/^[1-9]\d?$/.test(page) || Number(page) > 80))
    return false;
  if (
    line !== null &&
    (!/^[1-9]\d{0,6}$/.test(line) || Number(line) > 1_000_000)
  )
    return false;
  return true;
}
