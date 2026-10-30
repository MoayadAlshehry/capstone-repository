import 'server-only';
import { createCorrectionsRepository } from '@capstone/db/corrections';
import type { AccountView } from '@capstone/db/auth';
import type { NativeStorage } from '@capstone/storage/native';
import { assessmentIssues, type AssessmentInput } from './evaluations.js';
import { externalFormIssues, type ExternalForm } from './external-reviews.js';
import { submissionUuid } from './submissions.js';
import { assessmentEntryPayload } from './assessment-entry.js';
export interface GovernanceCommand {
  operation: string;
  body: Record<string, unknown>;
  command: string;
}
export interface GovernanceReceipt {
  command: string;
  operation: string;
  case: string;
  logical: string;
  layer: 'supervisor' | 'committee' | 'external';
  result: {
    issue: string;
    state: string;
    revision: number;
    assessment: string;
    run: string;
  };
}
export function createCorrectionsEngine(url: string, storage: NativeStorage) {
  const repository = createCorrectionsRepository(url);
  return {
    view: repository.view,
    feedback: repository.feedback,
    receipt(
      a: AccountView,
      command: string,
    ): Promise<GovernanceReceipt | null> {
      if (!submissionUuid(command)) throw Error('INVALID_INPUT');
      return repository.receipt<GovernanceReceipt>(a, command);
    },
    close: repository.close,
    async command(a: AccountView, c: GovernanceCommand) {
      if (
        !submissionUuid(c.command) ||
        ![
          'issue',
          'authorize',
          'correct',
          'invalidate',
          'explain',
          'hold',
          'resolve',
          'retain',
          'refresh',
        ].includes(c.operation) ||
        !c.body ||
        typeof c.body !== 'object' ||
        Array.isArray(c.body)
      )
        throw Error('INVALID_INPUT');
      let evidenceFailure: Error | undefined;
      let validationFailure: Error | undefined;
      return repository
        .transaction(async (tx) => {
          if (c.operation === 'correct') {
            c = {
              ...c,
              body: { ...c.body, form: assessmentEntryPayload(c.body['form']) },
            };
            const v = (
              await tx.query<{
                value: {
                  assessments: {
                    layer: string;
                    correctionPolicy:
                      'ASSESSMENT_UX_V2' | 'REFERENCED_ASSESSMENT_V1';
                    evidenceChoices: { id: string }[];
                  }[];
                };
              }>('SELECT app.governance_view($1,$2,NULL,$3) value', [
                a.id,
                a.sessionId,
                c.body['issue'],
              ])
            )[0]!.value;
            const target = v.assessments[0];
            if (!target) throw Error('NOT_FOUND');
            const form = c.body['form'] as AssessmentInput | ExternalForm;
            if (
              !form ||
              typeof form !== 'object' ||
              Array.isArray(form) ||
              (target.layer !== 'external' &&
                (!Array.isArray(form.criteria) ||
                  form.criteria.some(
                    (criterion) =>
                      !criterion ||
                      typeof criterion !== 'object' ||
                      Array.isArray(criterion) ||
                      !Array.isArray(criterion.locators),
                  )))
            ) {
              validationFailure = Error('INVALID_ASSESSMENT');
              throw validationFailure;
            }
            const issues =
              target.layer === 'external'
                ? externalFormIssues(
                    c.body['form'] as ExternalForm,
                    target.evidenceChoices.map((f) => f.id),
                    true,
                    target.correctionPolicy === 'ASSESSMENT_UX_V2',
                  )
                : assessmentIssues(
                    c.body['form'] as AssessmentInput,
                    new Date().toISOString().slice(0, 10),
                    target.correctionPolicy === 'ASSESSMENT_UX_V2',
                  );
            if (
              target.layer !== 'external' &&
              form.inputContract !== 'SCORES_ONLY_V3' &&
              target.correctionPolicy === 'ASSESSMENT_UX_V2' &&
              form.criteria.some((criterion) => criterion.locators?.length)
            )
              issues.push('MANUAL_LOCATORS_RETIRED');
            if (issues.length) {
              validationFailure = Error('INVALID_ASSESSMENT');
              throw validationFailure;
            }
          }
          const values = [
            a.id,
            a.sessionId,
            c.operation,
            JSON.stringify(c.body),
            c.command,
          ];
          const result = (
            await tx.query<{
              value: {
                files?: { key: string; size: number; sha256: string }[];
              };
            }>(
              'SELECT app.governance_command($1,$2,$3,$4,$5,false) value',
              values,
            )
          )[0]!.value;
          if (!result.files) return result;
          for (const f of result.files)
            if (
              !(await storage.verify(f.key, {
                size: Number(f.size),
                sha256: f.sha256,
              }))
            ) {
              evidenceFailure = Error('EVIDENCE_UNAVAILABLE');
              throw evidenceFailure;
            }
          return (
            await tx.query<{ value: unknown }>(
              'SELECT app.governance_command($1,$2,$3,$4,$5,true) value',
              values,
            )
          )[0]!.value;
        })
        .catch((error) => {
          throw evidenceFailure ?? validationFailure ?? error;
        });
    },
  };
}
