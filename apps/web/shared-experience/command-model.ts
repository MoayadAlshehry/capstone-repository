import { submissionUuid } from '@capstone/domain';

export type GovernedResult = {
  issue: string;
  state: string;
  revision: number;
  assessment: string;
  run: string | null;
};
export type GovernedReceipt = {
  command: string;
  operation: string;
  case: string;
  logical: string;
  layer: 'supervisor' | 'committee' | 'external';
  result: GovernedResult;
};
export const validGovernedReason = (value: string) =>
  [...value.trim()].length >= 20 &&
  [...value.trim()].length <= 2000 &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(
    value,
  );
export function governedResult(value: unknown): value is GovernedResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    submissionUuid(v['issue']) &&
    typeof v['state'] === 'string' &&
    Number.isSafeInteger(v['revision']) &&
    (v['revision'] as number) >= 0 &&
    submissionUuid(v['assessment']) &&
    (v['run'] === null || submissionUuid(v['run']))
  );
}

/** Acknowledgments must belong to this document's immutable operation scope. */
export function governedReceipt(
  value: unknown,
  command: string,
  scope: string,
  requestBinding?: {
    logical: string;
    layer: 'supervisor' | 'committee' | 'external';
  },
): value is GovernedReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as GovernedReceipt;
  if (
    v.command !== command ||
    !submissionUuid(v.case) ||
    !submissionUuid(v.logical) ||
    !['supervisor', 'committee', 'external'].includes(v.layer) ||
    !governedResult(v.result)
  )
    return false;
  const [kind, identity, layer] = scope.split('.');
  if (kind === 'correction')
    return v.operation === 'correct' && v.result.issue === identity;
  if (kind === 'request')
    return (
      v.operation === 'issue' &&
      (!requestBinding ||
        (v.logical === requestBinding.logical &&
          v.layer === requestBinding.layer)) &&
      (layer
        ? v.case === identity && v.layer === layer
        : v.logical === identity ||
          (!!requestBinding && v.result.assessment === identity))
    );
  return (
    kind === 'admin' &&
    (identity === 'collection' ||
      v.case === identity ||
      v.result.issue === identity)
  );
}

export function commandAtLocation(query: URLSearchParams, scope: string) {
  return query.getAll('command').length === 1 &&
    query.getAll('task').length === 1 &&
    query.get('task') === scope &&
    submissionUuid(query.get('command'))
    ? query.get('command')!
    : null;
}
