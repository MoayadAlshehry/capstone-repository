type GrantScope = {
  actor: string;
  id: string;
  project: string;
  version: string;
};

export async function recheckGrantRead(
  scope: GrantScope,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetcher('/api/partner-access?grant=' + scope.id, {
      cache: 'no-store',
      headers: { 'X-Workspace-Actor': scope.actor },
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object') return false;
    const value = result as Record<string, unknown>;
    if (
      value['usable'] !== true ||
      !value['grant'] ||
      typeof value['grant'] !== 'object'
    )
      return false;
    const grant = value['grant'] as Record<string, unknown>;
    return (
      grant['id'] === scope.id &&
      grant['project'] === scope.project &&
      grant['version'] === scope.version &&
      grant['state'] === 'active' &&
      grant['canRead'] === true
    );
  } catch {
    return false;
  }
}
