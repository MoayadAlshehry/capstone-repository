/** Owner-approved input contract; rubric identity, weights and authority are unchanged. */
export const assessmentEntryContract = 'SCORES_ONLY_V3' as const;
export type AssessmentEntryContract = typeof assessmentEntryContract;
/** Faithful absence defaults, never an invented locator, justification or acknowledgment. */
export function assessmentEntryPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if (body.inputContract !== assessmentEntryContract) return value;
  return {
    ...(body.layer === 'supervisor'
      ? { members: [], assessedOn: null, attestation: false }
      : {}),
    overall: '',
    calibration: false,
    ...body,
    criteria: Array.isArray(body.criteria)
      ? body.criteria.map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? { comment: '', locators: [], ...item }
            : item,
        )
      : body.criteria,
  };
}
