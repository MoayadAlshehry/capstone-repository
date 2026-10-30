export const productName = 'CAPSTONE REPOSITORY';
export {
  computingDomains,
  administrationFields,
  validAdministrationInput,
  lifecycleValid,
} from './administration.js';
export { systemClock, type Clock } from './clock.js';
export {
  roleCodes,
  roleCode,
  authorize,
  versionTransition,
  requestTransition,
  grantState,
  publicMetadata,
  auditValues,
  type ActorContext,
  type RoleCode,
  type ResourceFacts,
  type Decision,
} from './authorization.js';

export type RuntimeService = 'web' | 'upload' | 'worker';
export interface FoundationReadiness {
  readonly service: RuntimeService;
  readonly status: 'foundation-ready';
  readonly phase: 'PHASE_02';
  readonly businessWorkflowsAvailable: false;
}
export function foundationReadiness(
  service: RuntimeService,
): FoundationReadiness {
  return {
    service,
    status: 'foundation-ready',
    phase: 'PHASE_02',
    businessWorkflowsAvailable: false,
  };
}

export type ErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT';
const messages: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'This operation is not permitted.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  INVALID_CONFIGURATION:
    'Runtime configuration is invalid. Check the named settings.',
  INVALID_REQUEST: 'The request is invalid.',
  INTERNAL_ERROR: 'The request could not be completed.',
};
export class ApplicationError extends Error {
  constructor(readonly code: ErrorCode) {
    super(messages[code]);
    this.name = 'ApplicationError';
  }
}
export interface SerializedError {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly requestId: string;
  };
}
export function serializeError(
  error: unknown,
  requestId: string,
): SerializedError {
  const code =
    error instanceof ApplicationError ? error.code : 'INTERNAL_ERROR';
  return { error: { code, message: messages[code], requestId } };
}

export * from './assignments.js';
export * from './drafts.js';

export * from './file-policy.js';

export * from './native-files.js';
export * from './submissions.js';
export * from './evaluations.js';
export * from './assessment-entry.js';
export * from './publications.js';

export type {
  Edition,
  EditionFile,
  EditionHistory,
  SuccessorCommand,
  VisibilityCommand,
  SuccessorResult,
} from './editions.js';

export {
  normalizeDiscoveryText,
  parseDiscovery,
  discoveryUrl,
  discoveryKeys,
} from './discovery.js';
export type { DiscoveryInput, DiscoveryResult } from './discovery.js';
export * from './onboarding.js';
export * from './project-onboarding.js';
export * from './semester.js';

export * from './academic.js';

export * from './visual-media.js';
