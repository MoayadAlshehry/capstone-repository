import { submissionUuid } from '@capstone/domain';
export function academicReceiptMatches(
  value: unknown,
  command: string,
  scope: string,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>,
    parts = scope.split('.');
  if (parts[0] === 'independent')
    return (
      receipt['assignment'] === parts[1] &&
      typeof receipt['status'] === 'string' &&
      Number.isSafeInteger(receipt['revision'])
    );
  const context = receipt['receiptContext'] as
    Record<string, unknown> | undefined;
  if (
    !context ||
    context['command'] !== command ||
    !submissionUuid(context['project']) ||
    !submissionUuid(context['version'])
  )
    return false;
  if (parts[0] === 'completion')
    return (
      context['version'] === parts[1] &&
      context['action'] === 'academic.final.requested'
    );
  if (parts[0] === 'final')
    return (
      context['version'] === parts[1] &&
      context['action'] === 'submission.submit'
    );
  if (parts[0] === 'screening')
    return (
      receipt['submission'] === parts[1] &&
      ['academic.final.accepted', 'submission.revision'].includes(
        context['action'] as string,
      )
    );
  if (parts[0] === 'decision')
    return (
      receipt['submission'] === parts[1] &&
      [
        'submission.publish',
        'submission.revision',
        'submission.reject',
      ].includes(context['action'] as string)
    );
  return (
    parts[0] === 'academic' &&
    parts[1] === 'form' &&
    receipt['submission'] === parts[2] &&
    receipt['layer'] === parts[3] &&
    ['academic.draft.' + parts[3], 'evaluation.' + parts[3]].includes(
      context['action'] as string,
    )
  );
}

/** A preview total never establishes completion; the authorized receipt action does. */
export function isFinalAssessmentReceipt(
  value: Record<string, unknown>,
  layer: string,
) {
  const context = value['receiptContext'] as
    Record<string, unknown> | undefined;
  return context?.['action'] === 'evaluation.' + layer;
}
export function validAssessmentTotal(value: unknown): boolean {
  return (
    (typeof value === 'number' ||
      (typeof value === 'string' &&
        /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100
  );
}
/** A current concealed value overrides any number retained from an earlier response. */
export function assessmentSummaryTotal(
  record: { total: unknown } | undefined,
  fallback: unknown,
): string | null {
  const value = record ? record.total : fallback;
  return validAssessmentTotal(value) ? String(value) : null;
}
