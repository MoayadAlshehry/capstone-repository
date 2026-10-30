'use client';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SemesterState,
  CheckpointRound,
  SemesterReceipt,
} from '@capstone/domain';
import {
  Button,
  Field,
  FieldLabel,
  FieldError,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ArrowUpRight,
} from '@capstone/ui/workspace-v2';
import {
  StudioCard,
  Notice,
  StateBadge,
  issueText,
  date,
  t,
  type Locale,
  type FrozenRecord,
} from './common';
import { useSemesterMemory } from './memory';
import { useSemesterCommand, CommandRecovery } from './command';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
export function CheckpointSend({
  locale,
  actor,
  state,
  blocked,
  locked,
  variant = 'default',
}: {
  locale: Locale;
  actor: string;
  state: SemesterState;
  blocked: boolean;
  locked?: string | undefined;
  variant?: 'default' | 'outline';
}) {
  const memory = useSemesterMemory(actor, state.project.id),
    command = useSemesterCommand(
      memory,
      'checkpoint',
      state.project.id,
      state.project.version,
      actor,
      locked,
    ),
    router = useRouter(),
    [open, setOpen] = useState(false),
    copy = (en: string, ar: string) => t(locale, en, ar);
  const pendingGuard = useAssessmentExit(command.pending, locale, () => {}, {
    preserveLocaleSwitch: true,
    canDiscard: false,
  });
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (command.pending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [command.pending]);
  function complete(r: SemesterReceipt) {
    if (r.operation !== 'checkpoint.send') return;
    setOpen(false);
    router.refresh();
  }
  if (state.role !== 'lead')
    return (
      <p dir="auto" className="ss-muted">
        {copy(
          'Only the current project lead sends checkpoints. All assigned authors can prepare the editable work.',
          'يرسل القائد الحالي نقاط المراجعة. يمكن لجميع المؤلفين المعيّنين إعداد العمل القابل للتحرير.',
        )}
      </p>
    );
  return (
    <>
      {pendingGuard}
      {command.pending && (
        <CommandRecovery locale={locale} command={command} onDone={complete} />
      )}
      {command.error && !command.pending && (
        <Notice
          locale={locale}
          error
          title={copy('Checkpoint was not sent', 'لم تُرسل نقطة المراجعة')}
        >
          <p dir="auto">
            {copy(
              'Refresh the project and review its current files and assignment before trying again.',
              'حدّث المشروع وراجع ملفاته وإسناده قبل المحاولة مجددًا.',
            )}
          </p>
          {command.error.issues?.map((x) => (
            <p dir="auto" key={x}>
              {issueText(locale, x)}
            </p>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => router.refresh()}
          >
            {copy('Refresh project', 'تحديث المشروع')}
          </Button>
        </Notice>
      )}
      {state.editable && (
        <div className="ss-checkpoint-send">
          <Button
            type="button"
            variant={variant}
            disabled={blocked || command.pending}
            onClick={() => {
              command.reset();
              setOpen(true);
            }}
          >
            {copy(
              'Send checkpoint to supervisor',
              'إرسال نقطة مراجعة إلى المشرف',
            )}
          </Button>
          {blocked && (
            <p dir="auto" className="ss-muted">
              {copy(
                'Save or discard unsaved project details before sending.',
                'احفظ تفاصيل المشروع غير المحفوظة أو تجاهلها قبل الإرسال.',
              )}
            </p>
          )}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!command.pending) setOpen(value);
        }}
      >
        <DialogContent
          className="wsv2 ss-dialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {copy(
                'Review this saved checkpoint',
                'مراجعة نقطة المراجعة المحفوظة',
              )}
            </DialogTitle>
            <DialogDescription>
              {copy(
                'The saved details and completed files below will be frozen for your assigned supervisor. Working edits and uploads pause until the response.',
                'ستُحفظ التفاصيل والملفات المكتملة أدناه للمشرف المعيّن. تتوقف التعديلات والرفع حتى الرد.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="ss-checkpoint-summary">
            <strong>
              <bdi dir="auto">
                {state.project.metadata.title ||
                  copy('Title not saved', 'لم يُحفظ عنوان')}
              </bdi>
            </strong>
            <p dir="auto">
              {copy('Supervisor', 'المشرف')}:{' '}
              <bdi dir="auto">{state.project.supervisor.name}</bdi>
            </p>
            <p dir="auto">
              <bdi dir="auto">
                {state.project.metadata.abstract ||
                  copy('Abstract not added yet', 'لم يُضف ملخص بعد')}
              </bdi>
            </p>
            <p dir="auto">
              {copy('Saved keywords', 'الكلمات المفتاحية المحفوظة')}:{' '}
              <bdi dir="auto">
                {state.project.metadata.keywords.join(' · ') ||
                  copy('Not added yet', 'لم تُضف بعد')}
              </bdi>
            </p>
            <ol>
              {state.project.authors.map((a) => (
                <li key={a.id}>
                  <bdi dir="auto">{a.name}</bdi>
                  {a.lead && ' · ' + copy('Lead', 'القائد')}
                </li>
              ))}
            </ol>
            <ul>
              {state.files.map((f) => (
                <li key={f.id}>
                  <code dir="ltr">{f.path}</code>
                </li>
              ))}
            </ul>
            {state.issues.map((x) => (
              <p dir="auto" key={x} className="ss-validation">
                {issueText(locale, x)}
              </p>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={command.pending}
              onClick={() => setOpen(false)}
            >
              {copy('Keep preparing', 'متابعة التحضير')}
            </Button>
            <Button
              type="button"
              disabled={!state.canSend || command.pending || blocked}
              onClick={async () => {
                const r = await command.write({
                  operation: 'checkpoint.send',
                  project: state.project.id,
                  version: state.project.version,
                  revision: state.project.metadataRevision,
                  assignmentRevision: state.project.row_version,
                  manifestDigest: state.manifestDigest,
                });
                setOpen(false);
                if (r) complete(r);
              }}
            >
              {copy(
                'Confirm and send checkpoint',
                'تأكيد وإرسال نقطة المراجعة',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function SemesterReviews({
  locale,
  actor,
  state,
  selected,
  blocked,
  locked,
}: {
  locale: Locale;
  actor: string;
  state: SemesterState;
  rootPath: string;
  selected: CheckpointRound | null;
  blocked: boolean;
  locked?: string | undefined;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  return (
    <section data-template="student-reviews" className="ss-reviews">
      {state.workflow?.stage === 'returned' && (
        <StudioCard
          title={copy('Make final changes', 'أجرِ التعديلات النهائية')}
        >
          <p dir="auto">
            {state.workflow.revision?.reason ??
              state.workflow.screening?.reason}
          </p>
          <Button asChild>
            <Link
              href={'/' + locale + '/projects/' + state.project.id + '/files'}
            >
              {copy('Edit working files', 'تعديل ملفات العمل')}
            </Link>
          </Button>
          {state.role === 'lead' && (
            <Button asChild variant="outline">
              <Link
                href={'/' + locale + '/projects/' + state.project.id + '/final'}
              >
                {copy(
                  'Review resubmission readiness',
                  'مراجعة جاهزية إعادة الإرسال',
                )}
              </Link>
            </Button>
          )}
        </StudioCard>
      )}
      <section className="ac-review-stage">
        <h2 dir="auto">{copy('Final submission', 'الإرسال النهائي')}</h2>
        <p dir="auto">
          {state.workflow?.stage === 'returned'
            ? copy(
                'Make the requested final changes, then check readiness for a new attempt.',
                'أجرِ التعديلات النهائية المطلوبة، ثم راجع جاهزية المحاولة الجديدة.',
              )
            : [
                  'final_screening',
                  'supervisor_assessment',
                  'committee_consensus',
                  'faculty_decision',
                ].includes(state.workflow?.stage ?? '')
              ? copy(
                  'Your frozen final is awaiting its supervisor review and assessment.',
                  'ينتظر الإرسال النهائي المحفوظ مراجعة المشرف وتقييمه.',
                )
              : ['published', 'retained'].includes(state.workflow?.stage ?? '')
                ? copy(
                    'This project is complete. Read its final record or past attempts.',
                    'اكتمل المشروع. اقرأ سجله النهائي أو محاولاته السابقة.',
                  )
                : state.workflow?.requestValid
                  ? copy(
                      ['published', 'retained'].includes(
                        state.workflow?.stage ?? '',
                      )
                        ? 'This project is complete. Read its final record or past submissions.'
                        : 'Your supervisor requested final work. Review the project and follow its final submission status.',
                      ['published', 'retained'].includes(
                        state.workflow?.stage ?? '',
                      )
                        ? 'اكتمل هذا المشروع. اقرأ سجله النهائي أو إرسالاته السابقة.'
                        : 'طلب المشرف العمل النهائي. راجع المشروع وتابع حالة الإرسال النهائي.',
                    )
                  : state.latest?.state === 'awaiting_review' && !state.editable
                    ? copy(
                        'Your saved checkpoint is awaiting the supervisor’s response. Project edits and uploads are paused until that response. Final submission remains a separate step.',
                        'تنتظر نقطة المراجعة المحفوظة رد المشرف. يتوقف تحرير المشروع ورفع ملفاته حتى وصول الرد. يبقى الإرسال النهائي خطوة منفصلة.',
                      )
                    : copy(
                        'Continue preparing your project. Your supervisor will request final work when it is ready for final review.',
                        'تابع إعداد مشروعك. سيطلب المشرف العمل النهائي عندما يكون جاهزًا للمراجعة النهائية.',
                      )}
        </p>
        {state.final && !state.editable ? (
          <Button asChild variant="outline">
            <Link href={'/' + locale + '/submissions/' + state.final.id}>
              {copy('Read final record', 'اقرأ السجل النهائي')}
            </Link>
          </Button>
        ) : state.workflow?.requestValid && state.role === 'lead' ? (
          <Button asChild>
            <Link
              href={'/' + locale + '/projects/' + state.project.id + '/final'}
            >
              {state.workflow.revision
                ? copy(
                    state.canResubmit
                      ? 'Resubmit final work'
                      : 'Review resubmission readiness',
                    state.canResubmit
                      ? 'أعد إرسال العمل النهائي'
                      : 'مراجعة جاهزية إعادة الإرسال',
                  )
                : copy('Prepare final submission', 'جهّز الإرسال النهائي')}
            </Link>
          </Button>
        ) : null}
      </section>
      {state.editable && !state.workflow?.requestValid && (
        <details className="ac-semester-feedback">
          <summary>
            {copy(
              'Progress checkpoint (optional)',
              'نقطة مراجعة التقدم (اختيارية)',
            )}
          </summary>
          <p dir="auto">
            {copy(
              'Progress feedback does not replace final submission or assessment.',
              'لا تستبدل ملاحظات التقدم الإرسال النهائي أو التقييم.',
            )}
          </p>
          <CheckpointSend
            locale={locale}
            actor={actor}
            state={state}
            blocked={blocked}
            locked={locked}
          />
        </details>
      )}
      <StudioCard title={copy('Past submissions', 'الإرسالات السابقة')}>
        <ol className="ss-timeline">
          {state.history.map((x) => (
            <li key={x.id} data-purpose={x.purpose}>
              <div>
                <strong>
                  {x.purpose === 'CHECKPOINT'
                    ? copy(
                        `Checkpoint ${x.number}`,
                        `نقطة المراجعة ${x.number}`,
                      )
                    : copy('Final submission record', 'سجل تقديم نهائي')}
                </strong>
                <StateBadge locale={locale} state={x.state} />
              </div>
              <p dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                {copy('Submitted', 'أُرسل')} · {date(locale, x.submittedAt)}
              </p>
              {x.decidedAt && (
                <p dir="auto" className="ss-muted">
                  {x.actor ? (
                    <>
                      <span>{copy('Recorded by', 'سجله')}: </span>
                      <bdi dir="auto">{x.actor}</bdi>
                    </>
                  ) : (
                    copy('Faculty decision recorded', 'سُجل قرار المشرف')
                  )}{' '}
                  · {date(locale, x.decidedAt)}
                </p>
              )}
              {x.comment && (
                <p dir="auto">
                  <bdi dir="auto">{x.comment}</bdi>
                </p>
              )}
              {x.purpose === 'CHECKPOINT' ? (
                <Button asChild variant="outline">
                  <Link href={'/' + locale + '/submissions/' + x.id}>
                    {copy(
                      'Inspect frozen files',
                      'الاطلاع على الملفات المحفوظة',
                    )}
                    <ArrowUpRight />
                  </Link>
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <Link href={'/' + locale + '/submissions/' + x.id}>
                    {copy('Inspect final record', 'الاطلاع على السجل النهائي')}
                    <ArrowUpRight />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
        {!state.history.length && (
          <p dir="auto" className="ss-muted">
            {copy(
              'Saved checkpoint history appears here after the first send.',
              'يظهر السجل هنا بعد إرسال أول نقطة مراجعة.',
            )}
          </p>
        )}
      </StudioCard>
      {selected && <FrozenSummary locale={locale} round={selected} />}
    </section>
  );
}
export function FrozenSummary({
  locale,
  round,
}: {
  locale: Locale;
  round: FrozenRecord;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  return (
    <StudioCard
      title={
        round.purpose === 'FINAL'
          ? copy('Saved final record', 'السجل النهائي المحفوظ')
          : copy(
              `Saved checkpoint ${round.number}`,
              `نقطة المراجعة المحفوظة ${round.number}`,
            )
      }
    >
      <div className="ss-frozen-metadata">
        <strong>
          <bdi dir="auto">{round.metadata.title}</bdi>
        </strong>
        <p dir="auto">
          <bdi dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            {date(locale, round.submittedAt)}
          </bdi>{' '}
          · {copy('Submitted project work', 'العمل المرسل للمشروع')}
        </p>
        <p dir="auto">
          <bdi dir="auto">
            {round.metadata.abstract ||
              copy(
                'Abstract not added at this checkpoint',
                'لم يُضف ملخص عند إرسال هذه النقطة',
              )}
          </bdi>
        </p>
        <p dir="auto">
          <bdi dir="auto">
            {round.metadata.keywords.join(' · ') ||
              copy(
                'Keywords not added at this checkpoint',
                'لم تُضف كلمات مفتاحية عند إرسال هذه النقطة',
              )}
          </bdi>
        </p>
        <ol>
          {round.authors.map((x) => (
            <li key={x.id}>
              <bdi dir="auto">{x.name}</bdi>
              {x.lead && ' · ' + copy('Lead', 'القائد')}
            </li>
          ))}
        </ol>
      </div>
    </StudioCard>
  );
}
export function CheckpointRecordedResponse({
  locale,
  round,
}: {
  locale: Locale;
  round: CheckpointRound;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <StateBadge locale={locale} state={round.state} />
      <p dir="auto" className="ss-muted">
        {round.decision
          ? copy(
              'This checkpoint is read only. The supervisor’s recorded feedback is shown below.',
              'نقطة المراجعة هذه للقراءة فقط. تظهر ملاحظات المشرف المسجلة أدناه.',
            )
          : copy(
              'Your supervisor has not responded yet. This saved checkpoint is read only.',
              'لم يرد المشرف بعد. نقطة المراجعة المحفوظة هذه للقراءة فقط.',
            )}
      </p>
      {round.decision && (
        <blockquote>
          <p dir="auto">
            <bdi dir="auto">
              {round.decision.comment ||
                copy(
                  'Accepted for continued preparation.',
                  'قُبلت لمتابعة التحضير.',
                )}
            </bdi>
          </p>
          <footer>
            <bdi dir="auto">{round.decision.actor}</bdi> ·{' '}
            <bdi dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {date(locale, round.decision.decidedAt)}
            </bdi>
          </footer>
        </blockquote>
      )}
    </div>
  );
}
export function CheckpointDecision({
  locale,
  actor,
  round,
  locked,
}: {
  locale: Locale;
  actor: string;
  round: CheckpointRound;
  locked?: string | undefined;
}) {
  const memory = useSemesterMemory(actor, round.project),
    command = useSemesterCommand(
      memory,
      'decision:' + round.id,
      round.project,
      round.version,
      actor,
      locked,
    ),
    [comment, setComment] = useState(memory['note.' + round.id] ?? ''),
    [operation, setOperation] = useState<
      'checkpoint.changes' | 'checkpoint.accept' | null
    >(null),
    [invalid, setInvalid] = useState(false),
    note = useRef<HTMLTextAreaElement>(null),
    router = useRouter(),
    copy = (en: string, ar: string) => t(locale, en, ar);
  const exitGuard = useAssessmentExit(
    (round.canDecide && !!comment) || command.pending,
    locale,
    () => {
      setComment('');
      delete memory['note.' + round.id];
    },
    {
      preserveLocaleSwitch: true,
      canDiscard: !command.pending,
      ...(command.pending
        ? {}
        : {
            stayLabel: copy('Keep editing', 'متابعة التحرير'),
            description: copy(
              'Keep your checkpoint feedback here, or discard the unsent note before continuing.',
              'احتفظ بملاحظات نقطة المراجعة هنا، أو تجاهل الملاحظة غير المرسلة قبل المتابعة.',
            ),
          }),
    },
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if ((round.canDecide && comment) || command.pending) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const clear = () => {
      setComment('');
      delete memory['note.' + round.id];
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [round.canDecide, round.id, comment, command.pending, memory]);
  function complete(r: SemesterReceipt) {
    if (r.submission !== round.id) return;
    setOperation(null);
    delete memory['note.' + round.id];
    setComment('');
    router.refresh();
  }
  return (
    <StudioCard
      title={copy('Respond to checkpoint', 'الرد على نقطة المراجعة')}
      className="ss-decision"
    >
      {exitGuard}
      {command.pending ? (
        <CommandRecovery locale={locale} command={command} onDone={complete} />
      ) : round.canDecide ? (
        <>
          <p dir="auto" className="ss-muted">
            {copy(
              'Checkpoint feedback helps the team continue its project.',
              'تساعد ملاحظات نقطة المراجعة الفريق في متابعة مشروعه.',
            )}
          </p>
          <Field data-invalid={invalid} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <FieldLabel htmlFor="ss-feedback">
              {copy('Feedback note', 'ملاحظة للمؤلفين')}
            </FieldLabel>
            <Textarea
              id="ss-feedback"
              rows={6}
              dir="auto"
              maxLength={4000}
              ref={note}
              value={comment}
              aria-invalid={invalid}
              aria-describedby={invalid ? 'ss-feedback-error' : undefined}
              onChange={(e) => {
                setComment(e.target.value);
                memory['note.' + round.id] = e.target.value;
                setInvalid(false);
              }}
            />
            {invalid && (
              <FieldError id="ss-feedback-error">
                {copy(
                  'Write a substantive note of 3–2,000 characters to request changes.',
                  'اكتب ملاحظة مفيدة من 3 إلى 2000 حرف لطلب التعديلات.',
                )}
              </FieldError>
            )}
          </Field>
          <div className="ss-decision-actions">
            <Button
              type="button"
              onClick={() => {
                if (
                  [...comment.trim()].length < 3 ||
                  [...comment.trim()].length > 2000 ||
                  !/[\p{L}\p{N}]/u.test(comment)
                ) {
                  setInvalid(true);
                  note.current?.focus();
                  return;
                }
                command.reset();
                setOperation('checkpoint.changes');
              }}
            >
              {copy('Request changes', 'طلب تعديلات')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                command.reset();
                setOperation('checkpoint.accept');
              }}
            >
              {copy('Accept checkpoint', 'قبول نقطة المراجعة')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <CheckpointRecordedResponse locale={locale} round={round} />
        </>
      )}
      {command.error && !command.pending && (
        <Notice
          locale={locale}
          error
          title={copy('Response was not recorded', 'لم يُسجل الرد')}
        >
          <p dir="auto">
            {copy(
              'The assignment or round may have changed. Refresh before responding; your note is retained.',
              'قد يكون الإسناد أو الجولة تغير. حدّث الصفحة قبل الرد؛ تبقى ملاحظتك محفوظة.',
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.refresh()}
          >
            {copy('Refresh checkpoint', 'تحديث نقطة المراجعة')}
          </Button>
        </Notice>
      )}
      <Dialog
        open={operation !== null}
        onOpenChange={(open) => {
          if (!open && !command.pending) setOperation(null);
        }}
      >
        <DialogContent
          className="wsv2 ss-dialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {operation === 'checkpoint.changes'
                ? copy('Confirm requested changes', 'تأكيد طلب التعديلات')
                : copy('Accept this checkpoint?', 'قبول نقطة المراجعة؟')}
            </DialogTitle>
            <DialogDescription>
              <bdi dir="auto">{round.metadata.title}</bdi>
              {' · '}
              {copy(
                `Checkpoint ${round.number}`,
                `نقطة المراجعة ${round.number}`,
              )}
              {'. '}
              {copy(
                'The team can continue editing its project. This feedback stays with the submitted checkpoint.',
                'يستطيع الفريق متابعة تحرير مشروعه. تبقى الملاحظات مع نقطة المراجعة المرسلة.',
              )}
            </DialogDescription>
          </DialogHeader>
          {comment && (
            <p dir="auto">
              <bdi dir="auto">{comment}</bdi>
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={command.pending}
              onClick={() => setOperation(null)}
            >
              {copy('Keep reviewing', 'متابعة الاطلاع')}
            </Button>
            <Button
              disabled={command.pending}
              onClick={async () => {
                if (!operation) return;
                const r = await command.write({
                  operation,
                  submission: round.id,
                  revision: round.revision,
                  assignmentRevision: round.assignmentRevision,
                  comment,
                });
                setOperation(null);
                if (r) complete(r);
              }}
            >
              {operation === 'checkpoint.changes'
                ? copy('Confirm request changes', 'تأكيد طلب التعديلات')
                : copy('Confirm accept checkpoint', 'تأكيد قبول نقطة المراجعة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StudioCard>
  );
}
