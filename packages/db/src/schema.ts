import 'server-only';
import {
  pgSchema,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
// Typed read mappings. Tracked custom SQL migrations own all constraints/defaults/grants.
export const applicationSchema = pgSchema('app');
export const visualAssets = applicationSchema.table('visual_assets', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  ownerId: uuid('owner_id').notNull(),
  universityId: uuid('university_id'),
  projectId: uuid('project_id'),
  versionId: uuid('version_id'),
  main: jsonb('main').notNull(),
  small: jsonb('small').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});
export const visualCovers = applicationSchema.table('visual_covers', {
  versionId: uuid('version_id').primaryKey(),
  assetId: uuid('asset_id'),
  revision: integer('revision').notNull(),
});
export const visualAvatars = applicationSchema.table('visual_avatars', {
  userId: uuid('user_id').primaryKey(),
  assetId: uuid('asset_id'),
  revision: integer('revision').notNull(),
});
export const visualSubmissionCovers = applicationSchema.table(
  'visual_submission_covers',
  {
    submissionId: uuid('submission_id').primaryKey(),
    assetId: uuid('asset_id'),
  },
);
export const accountImports = applicationSchema.table('account_imports', {
  id: uuid('id').primaryKey(),
  universityId: uuid('university_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  commandId: uuid('command_id').notNull(),
  sourceHash: text('source_hash').notNull(),
  planHash: text('plan_hash').notNull(),
  rowCount: integer('row_count').notNull(),
  studentCount: integer('student_count').notNull(),
  facultyCount: integer('faculty_count').notNull(),
  groupsCreated: integer('groups_created').notNull(),
  groupsReused: integer('groups_reused').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    precision: 3,
    mode: 'date',
  }).notNull(),
});
export const accountLifecycle = applicationSchema.table('account_lifecycle', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  universityId: uuid('university_id'),
  purpose: text('purpose').notNull(),
  policy: text('policy').notNull(),
  returnPath: text('return_path'),
  digest: text('digest').notNull(),
  issuedBy: uuid('issued_by').notNull(),
  issuedAt: timestamp('issued_at', {
    withTimezone: true,
    precision: 3,
    mode: 'date',
  }).notNull(),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    precision: 3,
    mode: 'date',
  }).notNull(),
  consumedAt: timestamp('consumed_at', {
    withTimezone: true,
    precision: 3,
    mode: 'date',
  }),
  revokedAt: timestamp('revoked_at', {
    withTimezone: true,
    precision: 3,
    mode: 'date',
  }),
});
export const accessGrants = applicationSchema.table('access_grants', {
  id: uuid('id').notNull().primaryKey(),
  requestId: uuid('request_id').notNull(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionId: uuid('version_id').notNull(),
  grantedTo: uuid('granted_to').notNull(),
  requestStatus: text('request_status').notNull(),
  grantedAt: timestamp('granted_at', {
    precision: 3,
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  expiresAt: timestamp('expires_at', {
    precision: 3,
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  revokedAt: timestamp('revoked_at', {
    withTimezone: true,
    mode: 'date',
    precision: 3,
  }),
  revokedBy: uuid('revoked_by'),
  revocationReason: text('revocation_reason'),
});
export const accessRequests = applicationSchema.table('access_requests', {
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionId: uuid('version_id').notNull(),
  requesterId: uuid('requester_id').notNull(),
  requesterRole: text('requester_role').notNull(),
  justification: text('justification').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  decidedBy: uuid('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  decisionReason: text('decision_reason'),
});
export const auditLogs = applicationSchema.table('audit_logs', {
  id: uuid('id').notNull().primaryKey(),
  actorId: uuid('actor_id'),
  actorRole: text('actor_role'),
  actorKind: text('actor_kind').notNull(),
  universityId: uuid('university_id'),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: uuid('object_id').notNull(),
  projectId: uuid('project_id'),
  versionId: uuid('version_id'),
  beforeState: jsonb('before_state').notNull(),
  afterState: jsonb('after_state').notNull(),
  reason: text('reason'),
  occurredAt: timestamp('occurred_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  correlationId: uuid('correlation_id').notNull(),
  eventKey: uuid('event_key').notNull(),
});
export const commandReceipts = applicationSchema.table('command_receipts', {
  actorId: uuid('actor_id').notNull(),
  commandId: uuid('command_id').notNull(),
  action: text('action').notNull(),
  payloadDigest: text('payload_digest').notNull(),
  auditId: uuid('audit_id').notNull(),
  result: jsonb('result').notNull(),
});
export const departments = applicationSchema.table('departments', {
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  code: text('code').notNull(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
  rowVersion: integer('row_version').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});
export const groupMembers = applicationSchema.table('group_members', {
  universityId: uuid('university_id').notNull(),
  groupId: uuid('group_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleCode: text('role_code').notNull(),
});
export const notifications = applicationSchema.table('notifications', {
  id: uuid('id').notNull().primaryKey(),
  eventId: uuid('event_id').notNull(),
  recipientId: uuid('recipient_id').notNull(),
  universityId: uuid('university_id'),
  projectId: uuid('project_id'),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
});
export const outboxEvents = applicationSchema.table('outbox_events', {
  eventId: uuid('event_id').notNull(),
  kind: text('kind').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
});
export const projectAuthors = applicationSchema.table('project_authors', {
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleCode: text('role_code').notNull(),
  authorOrder: integer('author_order').notNull(),
  isTeamLead: boolean('is_team_lead').notNull(),
});
export const projectFiles = applicationSchema.table('project_files', {
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionId: uuid('version_id').notNull(),
  storageObjectId: uuid('storage_object_id').notNull(),
  relativePath: text('relative_path').notNull(),
  originalName: text('original_name').notNull(),
  extension: text('extension').notNull(),
  detectedMime: text('detected_mime').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  sha256: text('sha256').notNull(),
  visibility: text('visibility').notNull(),
  uploadedBy: uuid('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  supersedesFileId: uuid('supersedes_file_id'),
  isCurrent: boolean('is_current').notNull(),
  processingStatus: text('processing_status').notNull(),
});
export const projectSubmissions = applicationSchema.table(
  'project_submissions',
  {
    purpose: text('purpose').notNull().default('FINAL'),
    id: uuid('id').notNull().primaryKey(),
    universityId: uuid('university_id').notNull(),
    projectId: uuid('project_id').notNull(),
    versionId: uuid('version_id').notNull(),
    roundNumber: integer('round_number').notNull(),
    submittedBy: uuid('submitted_by').notNull(),
    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    metadataSnapshot: jsonb('metadata_snapshot').notNull(),
    authorsSnapshot: jsonb('authors_snapshot').notNull(),
  },
);
export const projectVersions = applicationSchema.table('project_versions', {
  rowVersion: integer('row_version').notNull().default(0),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  updatedBy: uuid('updated_by'),
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionNumber: integer('version_number').notNull(),
  title: text('title'),
  abstract: text('abstract'),
  keywords: jsonb('keywords').notNull(),
  academicYear: text('academic_year'),
  domain: text('domain'),
  customMetadata: jsonb('custom_metadata').notNull(),
  licenseIdentifier: text('license_identifier'),
  generatedLicenseFileId: uuid('generated_license_file_id'),
  licenseTemplateHash: text('license_template_hash'),
  licenseInputsHash: text('license_inputs_hash'),
  status: text('status').notNull(),
  baseVersionId: uuid('base_version_id'),
  approvedSubmissionId: uuid('approved_submission_id'),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  retainedAt: timestamp('retained_at', { withTimezone: true, mode: 'date' }),
});
export const projects = applicationSchema.table('projects', {
  assignmentManaged: boolean('assignment_managed').notNull().default(false),
  guidedOnboarding: boolean('guided_onboarding').notNull().default(false),
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  groupId: uuid('group_id').notNull(),
  supervisorId: uuid('supervisor_id').notNull(),
  supervisorRole: text('supervisor_role').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  firstSubmittedAt: timestamp('first_submitted_at', {
    withTimezone: true,
    mode: 'date',
  }),
  currentVersionId: uuid('current_version_id'),
  publishedVersionId: uuid('published_version_id'),
  rowVersion: integer('row_version').notNull(),
});
export const roles = applicationSchema.table('roles', {
  code: text('code').notNull(),
});
export const studentGroups = applicationSchema.table('student_groups', {
  id: uuid('id').notNull().primaryKey(),
  universityId: uuid('university_id').notNull(),
  departmentId: uuid('department_id').notNull(),
  externalGroupId: text('external_group_id'),
  internalOnly: boolean('internal_only').notNull().default(false),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});
export const submissionFiles = applicationSchema.table('submission_files', {
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionId: uuid('version_id').notNull(),
  submissionId: uuid('submission_id').notNull(),
  fileId: uuid('file_id').notNull(),
  relativePath: text('relative_path').notNull(),
  visibilityAtSubmit: text('visibility_at_submit').notNull(),
  sha256AtSubmit: text('sha256_at_submit').notNull(),
  storageObjectId: uuid('storage_object_id'),
  sizeAtSubmit: bigint('size_at_submit', { mode: 'number' }),
  mimeAtSubmit: text('mime_at_submit'),
  extensionAtSubmit: text('extension_at_submit'),
  uploaderIdAtSubmit: uuid('uploader_id_at_submit'),
  uploaderNameAtSubmit: text('uploader_name_at_submit'),
  uploaderRoleAtSubmit: text('uploader_role_at_submit'),
  uploadedAtAtSubmit: timestamp('uploaded_at_at_submit', {
    withTimezone: true,
    mode: 'date',
  }),
});
export const reviewRecords = applicationSchema.table('review_records', {
  id: uuid('id').primaryKey(),
  universityId: uuid('university_id').notNull(),
  projectId: uuid('project_id').notNull(),
  versionId: uuid('version_id').notNull(),
  submissionId: uuid('submission_id').notNull(),
  decidedBy: uuid('decided_by').notNull(),
  decision: text('decision').notNull(),
  comment: text('comment').notNull(),
  decidedAt: timestamp('decided_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});
export const universities = applicationSchema.table('universities', {
  id: uuid('id').notNull().primaryKey(),
  code: text('code').notNull(),
  nameEn: text('name_en').notNull(),
  nameAr: text('name_ar').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});
export const users = applicationSchema.table('users', {
  id: uuid('id').notNull().primaryKey(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull(),
  roleCode: text('role_code').notNull(),
  universityId: uuid('university_id'),
  departmentId: uuid('department_id'),
  studentId: text('student_id'),
  organizationName: text('organization_name'),
  partnerStatus: text('partner_status'),
  accountStatus: text('account_status').notNull(),
  locale: text('locale').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const reminderTargets = applicationSchema.table('reminder_targets', {
  id: uuid('id').notNull().primaryKey(),
  recipientId: uuid('recipient_id').notNull(),
  kind: text('kind').notNull(),
  eventId: uuid('event_id').notNull(),
  deadline: timestamp('deadline', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).notNull(),
});

export const reviewerProfiles = applicationSchema.table('reviewer_profiles', {
  userId: uuid('user_id').primaryKey(),
  institutionId: uuid('institution_id').notNull(),
  qualificationStatement: text('qualification_statement').notNull(),
  domainCodes: jsonb('domain_codes').notNull(),
  expertiseTags: jsonb('expertise_tags').notNull(),
  readingLanguages: jsonb('reading_languages').notNull(),
  availability: boolean('availability').notNull(),
  status: text('status').notNull(),
  revision: integer('revision').notNull(),
  approvedBy: uuid('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true, precision: 3 }),
  reason: text('reason'),
  calibrationVersion: text('calibration_version'),
  calibrationAt: timestamp('calibration_at', {
    withTimezone: true,
    precision: 3,
  }),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
});

export const academicPackets = applicationSchema.table(
  'academic_review_packets',
  {
    id: uuid('id').primaryKey(),
    universityId: uuid('university_id').notNull(),
    projectId: uuid('project_id').notNull(),
    versionId: uuid('version_id').notNull(),
    submissionId: uuid('submission_id').notNull(),
    caseId: uuid('case_id').notNull(),
    manifest: jsonb('manifest').notNull(),
    manifestHash: text('manifest_hash').notNull(),
    authorizedBy: uuid('authorized_by').notNull(),
    authorizedAt: timestamp('authorized_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    supersedesPacketId: uuid('supersedes_packet_id'),
  },
);
export const academicPacketRevocations = applicationSchema.table(
  'academic_packet_revocations',
  {
    packetId: uuid('packet_id').primaryKey(),
    revokedBy: uuid('revoked_by').notNull(),
    revokedAt: timestamp('revoked_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    reason: text('reason').notNull(),
    auditId: uuid('audit_id').notNull(),
  },
);
export const academicPacketWorkspaces = applicationSchema.table(
  'academic_packet_workspaces',
  {
    caseId: uuid('case_id').primaryKey(),
    revision: integer('revision').notNull(),
    draft: jsonb('draft').notNull(),
    draftHash: text('draft_hash').notNull(),
    currentPacketId: uuid('current_packet_id'),
    updatedBy: uuid('updated_by').notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
);

// Phase29 finite task/assessment schema; SQL owns composite constraints and grants.
export const externalPolicyRuns = applicationSchema.table(
  'external_policy_runs',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
);
export const externalReviewAssignments = applicationSchema.table(
  'external_review_assignments',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    packetId: uuid('packet_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    policyRunId: uuid('policy_run_id').notNull(),
    slot: integer('slot').notNull(),
    status: text('status').notNull(),
    offeredAt: timestamp('offered_at', { withTimezone: true }).notNull(),
    offerExpiresAt: timestamp('offer_expires_at', {
      withTimezone: true,
    }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    declarations: jsonb('declarations'),
    closureCode: text('closure_code'),
    reason: text('reason'),
    offerReminder: uuid('offer_reminder').notNull(),
    taskReminder: uuid('task_reminder').notNull(),
  },
);
export const externalReviewDrafts = applicationSchema.table(
  'external_review_drafts',
  {
    assignmentId: uuid('assignment_id').primaryKey(),
    revision: integer('revision').notNull(),
    body: jsonb('body').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
);
export const externalAssessments = applicationSchema.table(
  'external_assessments',
  {
    submissionId: uuid('submission_id').notNull(),
    id: uuid('id').primaryKey(),
    assignmentId: uuid('assignment_id').notNull(),
    caseId: uuid('case_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    rubricCode: text('rubric_code').notNull(),
    rubricHash: text('rubric_hash').notNull(),
    quarterPoints: integer('quarter_points').notNull(),
    overallComment: text('overall_comment').notNull(),
    calibrationAck: boolean('calibration_ack').notNull(),
    entryContract: text('entry_contract').notNull().default('SCORES_ONLY_V3'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }).notNull(),
  },
);
export const externalCriterionScores = applicationSchema.table(
  'external_criterion_scores',
  {
    assessmentId: uuid('assessment_id').notNull(),
    code: text('code').notNull(),
    level: integer('level').notNull(),
    comment: text('comment').notNull(),
  },
);
export const externalEvidenceLocators = applicationSchema.table(
  'external_evidence_locators',
  {
    submissionId: uuid('submission_id').notNull(),
    assessmentId: uuid('assessment_id').notNull(),
    code: text('code').notNull(),
    ordinal: integer('ordinal').notNull(),
    fileId: uuid('file_id').notNull(),
    kind: text('kind').notNull(),
    reference: text('reference').notNull(),
  },
);

export const evaluationPolicies = applicationSchema.table(
  'evaluation_policies',
  {
    code: text('code').primaryKey(),
    config: jsonb('config').notNull(),
    configHash: text('config_hash').notNull(),
  },
);
export const evaluationPolicyRuns = applicationSchema.table(
  'evaluation_policy_runs',
  {
    id: uuid('id').primaryKey(),
    policyCode: text('policy_code').notNull(),
    configHash: text('config_hash').notNull(),
    inputs: jsonb('inputs').notNull(),
    outputs: jsonb('outputs').notNull(),
    executedAt: timestamp('executed_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    inputHash: text('input_hash').notNull(),
  },
);
export const evaluationAllocationCursor = applicationSchema.table(
  'evaluation_allocation_cursor',
  {
    policyCode: text('policy_code').primaryKey(),
    revision: bigint('revision', { mode: 'number' }).notNull(),
    lane: integer('lane').notNull(),
    domains: jsonb('domains').notNull(),
    universities: jsonb('universities').notNull(),
  },
);
export const evaluationCaseAdmissions = applicationSchema.table(
  'evaluation_case_admissions',
  {
    caseId: uuid('case_id').primaryKey(),
    policyCode: text('policy_code').notNull(),
    lane: text('lane'),
    admittedAt: timestamp('admitted_at', { withTimezone: true, precision: 3 }),
    waitingSince: timestamp('waiting_since', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    lastRun: uuid('last_run'),
    reasons: jsonb('reasons').notNull(),
    eligible: boolean('eligible').notNull(),
  },
);
export const evaluationAllocationPrerequisites = applicationSchema.table(
  'evaluation_allocation_prerequisites',
  {
    caseId: uuid('case_id').primaryKey(),
    explanation: text('explanation'),
    hold: boolean('hold').notNull(),
    expansionReady: boolean('expansion_ready').notNull(),
    legacyHold: boolean('legacy_hold').notNull(),
  },
);
export const evaluationReviewerRelations = applicationSchema.table(
  'evaluation_reviewer_relations',
  {
    caseId: uuid('case_id').notNull(),
    reviewerId: uuid('reviewer_id').notNull(),
    conflict: boolean('conflict').notNull(),
    committeeConflict: boolean('committee_conflict').notNull(),
    committeeNameResolved: boolean('committee_name_resolved').notNull(),
    reason: text('reason').notNull(),
  },
);
export const evaluationSchedulerEvents = applicationSchema.table(
  'evaluation_scheduler_events',
  {
    eventId: uuid('event_id').primaryKey(),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
  },
);

export const evaluationProgression = applicationSchema.table(
  'evaluation_progression',
  {
    caseId: uuid('case_id').primaryKey(),
    n: integer('n').notNull(),
    sumQuarterPoints: integer('sum_quarter_points').notNull(),
    minQuarterPoints: integer('min_quarter_points'),
    maxQuarterPoints: integer('max_quarter_points'),
    threshold: integer('threshold'),
    state: text('state').notNull(),
    qualityPaused: boolean('quality_paused').notNull(),
    nextSlot: integer('next_slot'),
    activeInitial: integer('active_initial').notNull(),
    activeExpansion: integer('active_expansion').notNull(),
    reasons: jsonb('reasons').notNull(),
    lastDecision: uuid('last_decision'),
    decisionHash: text('decision_hash').notNull(),
  },
);
export const evaluationProgressionRuns = applicationSchema.table(
  'evaluation_progression_runs',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    policyCode: text('policy_code').notNull(),
    configHash: text('config_hash').notNull(),
    inputs: jsonb('inputs').notNull(),
    outputs: jsonb('outputs').notNull(),
    executedAt: timestamp('executed_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
);

export const assessmentIssues = applicationSchema.table('assessment_issues', {
  id: uuid('id').primaryKey(),
  caseId: uuid('case_id').notNull(),
  logicalId: uuid('logical_id').notNull(),
  layer: text('layer').notNull(),
  type: text('type').notNull(),
  state: text('state').notNull(),
  reason: text('reason').notNull(),
  evidence: jsonb('evidence').notNull(),
  createdBy: uuid('created_by'),
  createdKind: text('created_kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  authorizedBy: uuid('authorized_by'),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolution: text('resolution'),
  resolutionKind: text('resolution_kind'),
  expectedHead: uuid('expected_head').notNull(),
  revision: integer('revision').notNull(),
});

export const assessmentIssueHistory = applicationSchema.table(
  'assessment_issue_history',
  {
    id: uuid('id').primaryKey(),
    issueId: uuid('issue_id').notNull(),
    actorId: uuid('actor_id'),
    operation: text('operation').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
);

export const assessmentRevisions = applicationSchema.table(
  'assessment_revisions',
  {
    id: uuid('id').primaryKey(),
    logicalId: uuid('logical_id').notNull(),
    caseId: uuid('case_id').notNull(),
    layer: text('layer').notNull(),
    supersedesId: uuid('supersedes_id').notNull(),
    issueId: uuid('issue_id').notNull(),
    revision: integer('revision').notNull(),
    evaluatorId: uuid('evaluator_id').notNull(),
    rubricCode: text('rubric_code').notNull(),
    rubricHash: text('rubric_hash').notNull(),
    payload: jsonb('payload').notNull(),
    quarterPoints: integer('quarter_points').notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }).notNull(),
  },
);

export const assessmentInvalidations = applicationSchema.table(
  'assessment_invalidations',
  {
    logicalId: uuid('logical_id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    issueId: uuid('issue_id').notNull(),
    confirmedBy: uuid('confirmed_by').notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
);

export const evaluationHolds = applicationSchema.table('evaluation_holds', {
  id: uuid('id').primaryKey(),
  issueId: uuid('issue_id').notNull(),
  caseId: uuid('case_id').notNull(),
  versionId: uuid('version_id').notNull(),
  type: text('type').notNull(),
  state: text('state').notNull(),
  createdBy: uuid('created_by').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolutionKind: text('resolution_kind'),
  resolution: text('resolution'),
  policyRun: uuid('policy_run'),
});

export const evaluationGovernanceRuns = applicationSchema.table(
  'evaluation_governance_runs',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    policyCode: text('policy_code').notNull(),
    configHash: text('config_hash').notNull(),
    inputs: jsonb('inputs').notNull(),
    outputs: jsonb('outputs').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
  },
);

export const evaluationGovernanceProjection = applicationSchema.table(
  'evaluation_governance_projection',
  {
    caseId: uuid('case_id').primaryKey(),
    inputsHash: text('inputs_hash').notNull(),
    outputs: jsonb('outputs').notNull(),
    lastRun: uuid('last_run').notNull(),
  },
);

export const evaluationDiscrepancyExplanations = applicationSchema.table(
  'evaluation_discrepancy_explanations',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    supervisorHead: uuid('supervisor_head').notNull(),
    committeeHead: uuid('committee_head').notNull(),
    issueId: uuid('issue_id').notNull(),
    explanation: text('explanation').notNull(),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
);

export const assessmentLogicalRegistry = applicationSchema.table(
  'assessment_logical_registry',
  {
    id: uuid('id').primaryKey(),
    caseId: uuid('case_id').notNull(),
    layer: text('layer').notNull(),
    evaluatorId: uuid('evaluator_id').notNull(),
    rubricCode: text('rubric_code').notNull(),
    rubricHash: text('rubric_hash').notNull(),
    submissionId: uuid('submission_id').notNull(),
    assignmentId: uuid('assignment_id'),
  },
);
