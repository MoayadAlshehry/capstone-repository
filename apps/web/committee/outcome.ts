import type { GuestView, MemberPayload } from './types.js';
export function canonicalMemberPayload(value: MemberPayload): MemberPayload {
  return {
    inputContract: 'SCORES_ONLY_V3',
    criteria: Array.from({ length: 7 }, (_, i) => {
      const code = 'C' + (i + 1),
        source = value.criteria.find((c) => c.code === code);
      return {
        code,
        level: source?.level ?? null,
        comment: source?.comment ?? '',
        locators: (source?.locators ?? []).map((l) => ({
          file: l.file,
          kind: l.kind,
          reference: l.reference,
        })),
      };
    }),
    overall: value.overall ?? '',
    calibration: value.calibration === true,
  };
}
export const memberSignature = (value: MemberPayload) =>
  JSON.stringify(canonicalMemberPayload(value));
export type GuestScope = Pick<
  GuestView,
  'invitation' | 'project' | 'version' | 'submission' | 'round'
> & { rubricHash: string; amendment: string | null };
export const guestScope = (v: GuestView): GuestScope => ({
  invitation: v.invitation,
  project: v.project,
  version: v.version,
  submission: v.submission,
  round: v.round,
  rubricHash: v.rubric.hash,
  amendment: v.amendment?.id ?? null,
});
export type PendingMemberWrite = {
  command: string;
  operation: 'save' | 'finalize';
  payload: MemberPayload;
  revision: number;
  scope: GuestScope;
};
export function isGuestView(value: unknown): value is GuestView {
  if (!value || typeof value !== 'object') return false;
  const v = value as GuestView;
  return (
    ['invitation', 'project', 'version', 'submission'].every(
      (k) => typeof v[k as keyof GuestView] === 'string',
    ) &&
    Number.isInteger(v.round) &&
    !!v.metadata &&
    !!v.rubric &&
    typeof v.rubric.hash === 'string' &&
    Array.isArray(v.rubric.criteria) &&
    v.rubric.criteria.length === 7 &&
    Array.isArray(v.authors) &&
    Array.isArray(v.files)
  );
}
export function classifyMemberOutcome(
  pending: PendingMemberWrite,
  view: GuestView,
): 'completed' | 'saved' | 'retry' | 'conflict' {
  const scope = guestScope(view);
  if (
    [
      'invitation',
      'project',
      'version',
      'submission',
      'round',
      'rubricHash',
    ].some(
      (k) =>
        scope[k as keyof GuestScope] !== pending.scope[k as keyof GuestScope],
    )
  )
    return 'conflict';
  if (
    scope.amendment !== pending.scope.amendment &&
    view.receipt?.id !== pending.command
  )
    return 'conflict';
  if (view.receipt) return 'completed';
  const revision = view.draft?.revision ?? 0;
  if (
    pending.operation === 'save' &&
    view.draft &&
    revision === pending.revision + 1 &&
    memberSignature(view.draft.payload) === memberSignature(pending.payload)
  )
    return 'saved';
  if (revision !== pending.revision) return 'conflict';
  if (
    pending.operation === 'finalize' &&
    view.draft &&
    memberSignature(view.draft.payload) !== memberSignature(pending.payload)
  )
    return 'conflict';
  return 'retry';
}
