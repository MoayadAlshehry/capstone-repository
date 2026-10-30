'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AcademicRound, SemesterState } from '@capstone/domain';
import { academicCommandSchema } from '@capstone/domain';
import {
  Button,
  Textarea,
  Field,
  FieldLabel,
  FieldError,
  RadioGroup,
  RadioGroupItem,
  Label,
  DecisionConfirmation,
  Check,
  RotateCcw,
} from '@capstone/ui/workspace-v2';
import { AcademicEvidence } from './evidence';
import { AcademicCommandProtection, useAcademicCommand } from './command';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import { useSemesterMemory } from '../semester/memory';
import { t, type Locale } from '../semester/common';
export function CompletionRequest({
  locale,
  actor,
  state,
}: {
  locale: Locale;
  actor: string;
  state: SemesterState;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    router = useRouter(),
    memory = useSemesterMemory(actor, state.project.id),
    cmd = useAcademicCommand(
      memory,
      'completion.' + state.project.version,
      actor,
    ),
    [note, setNote] = useState(memory['completion.note'] ?? ''),
    [noteInvalid, setNoteInvalid] = useState(false),
    noteInput = useRef<HTMLTextAreaElement>(null),
    [confirm, setConfirm] = useState(false),
    flow = state.workflow;
  const exitGuard = useAssessmentExit(
    !!note && !!flow?.canRequest && !['saving', 'unknown'].includes(cmd.state),
    locale,
    () => {
      setNote('');
      delete memory['completion.note'];
    },
    {
      preserveLocaleSwitch: true,
      stayLabel: copy('Keep editing', 'متابعة التحرير'),
      description: copy(
        'Keep your message here, or discard the unsent input before continuing.',
        'احتفظ برسالتك هنا، أو تجاهل الإدخال غير المرسل قبل المتابعة.',
      ),
    },
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (note && flow?.canRequest) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const clear = () => {
      setNote('');
      delete memory['completion.note'];
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [note, flow?.canRequest, memory]);
  async function send() {
    const r = await cmd.send({
      operation: 'final.request',
      project: state.project.id,
      version: state.project.version,
      assignmentRevision: state.project.row_version,
      requestRevision: flow?.requestRevision ?? 0,
      note,
    });
    setConfirm(false);
    if (r) {
      delete memory['completion.note'];
      router.refresh();
    }
  }
  return (
    <section className="af-completion-request" id="final-request">
      {exitGuard}
      <AcademicCommandProtection locale={locale} command={cmd} />
      <h3 dir="auto">{copy('Final submission', 'الإرسال النهائي')}</h3>
      {flow?.request && (
        <p dir="auto">
          {copy('Final submission requested', 'طُلب الإرسال النهائي')} ·{' '}
          <bdi dir="auto">{flow.request.actor}</bdi>
          {flow.request.note && <span dir="auto">: {flow.request.note}</span>}
        </p>
      )}
      {flow?.canRequest && (
        <>
          <p dir="auto">
            {copy(
              'Ask the team to finish its project and submit the final work for your review. This does not grade or publish it.',
              'اطلب من الفريق إكمال مشروعه وإرسال العمل النهائي لمراجعتك. لا يقيّم هذا الإجراء العمل ولا ينشره.',
            )}
          </p>
          <Field>
            <FieldLabel htmlFor="af-request-note">
              {copy(
                'Message to the team (optional)',
                'رسالة للفريق (اختيارية)',
              )}
            </FieldLabel>
            <Textarea
              ref={noteInput}
              id="af-request-note"
              maxLength={1000}
              dir="auto"
              rows={2}
              value={note}
              aria-invalid={noteInvalid || undefined}
              aria-describedby="af-request-note-help"
              disabled={cmd.state === 'saving' || cmd.state === 'unknown'}
              onChange={(e) => {
                setNote(e.target.value);
                memory['completion.note'] = e.target.value;
                if (
                  academicCommandSchema.options[0].shape.note.safeParse(
                    e.target.value,
                  ).success
                )
                  setNoteInvalid(false);
              }}
            />
            <p dir="auto" id="af-request-note-help" className="ss-muted">
              {copy(
                'Optional · at most 500 characters.',
                'اختيارية · 500 حرف كحد أقصى.',
              )}
            </p>
            {noteInvalid && (
              <FieldError>
                {copy(
                  'Keep the message within 500 characters and remove unsupported control characters.',
                  'اجعل الرسالة ضمن 500 حرف واحذف محارف التحكم غير المدعومة.',
                )}
              </FieldError>
            )}
          </Field>
          <Button
            disabled={cmd.state === 'saving' || cmd.state === 'unknown'}
            onClick={() => {
              if (
                !academicCommandSchema.options[0].shape.note.safeParse(note)
                  .success
              ) {
                setNoteInvalid(true);
                noteInput.current?.focus();
                return;
              }
              setConfirm(true);
            }}
          >
            {copy('Request final submission', 'اطلب الإرسال النهائي')}
          </Button>
        </>
      )}
      {cmd.error && (
        <p dir="auto" role="alert">
          {copy(
            'The project or assignment changed. Refresh before requesting final submission.',
            'تغير المشروع أو الإسناد. حدّث الصفحة قبل طلب الإرسال النهائي.',
          )}
        </p>
      )}
      {cmd.state === 'unknown' && (
        <>
          <p dir="auto" role="status">
            {copy(
              'Request status is unknown. Check it before trying again.',
              'حالة الطلب غير معروفة. تحقق منها قبل المحاولة مجددًا.',
            )}
          </p>
          <Button
            onClick={async () => {
              if (await cmd.recheck()) router.refresh();
            }}
          >
            {copy('Check request status', 'تحقق من حالة الطلب')}
          </Button>
        </>
      )}
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={copy('Request final submission', 'اطلب الإرسال النهائي')}
        description={
          <>
            <p dir="auto">
              <bdi dir="auto">{state.project.metadata.title}</bdi>
            </p>
            <p dir="auto">
              {copy(
                'The assigned team receives an in-app action. Only its current lead can submit the final work once the requirements are complete.',
                'يتلقى الفريق المعيّن إجراءً داخل التطبيق. يستطيع قائده الحالي وحده إرسال العمل النهائي بعد اكتمال المتطلبات.',
              )}
            </p>
            {note && <p dir="auto">{note}</p>}
          </>
        }
      >
        <div className="ac-confirm-actions">
          <Button variant="outline" onClick={() => setConfirm(false)}>
            {copy('Cancel', 'إلغاء')}
          </Button>
          <Button disabled={cmd.state === 'saving'} onClick={() => void send()}>
            {copy('Confirm request', 'أكد الطلب')}
          </Button>
        </div>
      </DecisionConfirmation>
    </section>
  );
}
export function FinalScreening({
  locale,
  actor,
  round,
  parent,
}: {
  locale: Locale;
  actor: string;
  round: AcademicRound;
  parent: string;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar),
    router = useRouter(),
    memory = useSemesterMemory(actor, round.project),
    cmd = useAcademicCommand(memory, 'screening.' + round.id, actor),
    [view, setView] = useState('evidence'),
    [outcome, setOutcome] = useState(''),
    [reason, setReason] = useState(
      memory['screening.reason.' + round.id] ?? '',
    ),
    [confirm, setConfirm] = useState(false),
    blocked = cmd.state === 'saving' || cmd.state === 'unknown';
  async function done(r: unknown) {
    if (!r) return;
    setConfirm(false);
    delete memory['screening.reason.' + round.id];
    router.push(
      '/' +
        locale +
        (outcome === 'accepted'
          ? '/supervision/finals/' + round.id + '/assessment'
          : '/supervision/projects/' + round.project) +
        '?from=' +
        encodeURIComponent(parent),
    );
    router.refresh();
  }
  async function send() {
    const r = await cmd.send({
      operation: 'final.screen',
      submission: round.id,
      revision: round.revision,
      assignmentRevision: round.assignmentRevision,
      outcome,
      reason,
    });
    setConfirm(false);
    await done(r);
  }
  return (
    <section
      className="ss-page ac-page af-screening"
      data-template="final-screening"
      data-locale={locale}
    >
      <AcademicCommandProtection locale={locale} command={cmd} />
      <Link
        className="ss-back"
        href={
          '/' +
          locale +
          '/supervision/projects/' +
          round.project +
          '?from=' +
          encodeURIComponent(parent)
        }
      >
        {copy('Back to project', 'العودة إلى المشروع')}
      </Link>
      <header className="ss-heading">
        <div>
          <p dir="auto" className="ac-eyebrow">
            {copy('Review final submission', 'راجع الإرسال النهائي')}
          </p>
          <h1 dir="auto">{round.metadata.title}</h1>
          <p dir="auto">
            {copy(
              'Check the submitted work before academic assessment. These files are read only.',
              'تحقق من العمل المرسل قبل التقييم الأكاديمي. هذه الملفات للقراءة فقط.',
            )}
          </p>
        </div>
      </header>
      <div
        className="af-screening-steps"
        role="group"
        aria-label={copy('Final screening view', 'عرض فحص الإرسال النهائي')}
      >
        {round.committeeWorkflow && round.canDecide && (
          <Button asChild variant="outline">
            <Link
              href={
                '/' +
                locale +
                '/supervision/finals/' +
                round.id +
                '/decision?from=' +
                encodeURIComponent(parent)
              }
            >
              {copy(
                'Return or retain with a reason',
                'إعادة للتعديل أو حفظ داخلي مع السبب',
              )}
            </Link>
          </Button>
        )}
        <Button
          variant={view === 'evidence' ? 'secondary' : 'outline'}
          aria-pressed={view === 'evidence'}
          onClick={() => setView('evidence')}
        >
          {copy('Evidence', 'الملفات المحفوظة')}
        </Button>
        <Button
          variant={view === 'review' ? 'secondary' : 'outline'}
          aria-pressed={view === 'review'}
          onClick={() => setView('review')}
        >
          {copy('Final review', 'المراجعة النهائية')}
        </Button>
      </div>
      <div className="af-screening-grid" data-view={view}>
        <div>
          <AcademicEvidence
            locale={locale}
            actor={actor}
            project={round.project}
            version={round.version}
            submission={round.id}
            files={round.files}
          />
        </div>
        <section
          className="af-screening-action"
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <h2 dir="auto">
            {copy(
              'Is the final work ready for assessment?',
              'هل العمل النهائي جاهز للتقييم؟',
            )}
          </h2>
          <p dir="auto">
            <bdi dir="auto">{round.authors.map((x) => x.name).join(' · ')}</bdi>
          </p>
          <p dir="auto">
            {round.files.length} {copy('submitted files', 'ملفات مرسلة')} ·{' '}
            {copy('Assigned supervisor', 'المشرف المعيّن')}:{' '}
            <bdi dir="auto">{round.metadata.supervisor.name}</bdi>
          </p>
          {round.canScreen ? (
            <>
              <RadioGroup
                value={outcome}
                disabled={blocked}
                onValueChange={setOutcome}
                className="ac-outcomes"
                aria-label={copy(
                  'Final review outcome',
                  'نتيجة المراجعة النهائية',
                )}
              >
                <Label
                  className="af-screen-choice"
                  htmlFor="af-screen-accepted"
                >
                  <RadioGroupItem id="af-screen-accepted" value="accepted" />
                  <Check />
                  <span>
                    <b>{copy('Accept for assessment', 'قبول للتقييم')}</b>
                    <span>
                      {copy(
                        'Accept this frozen work for your own assessment and independently verified committee forms. It stays private until your separate publication decision.',
                        'وافق على تقييم هذا العمل المرسل من المشرف ثم إجماع اللجنة. يبقى خاصًا حتى قرار النشر اللاحق.',
                      )}
                    </span>
                  </span>
                </Label>
                <Label
                  className="af-screen-choice"
                  htmlFor="af-screen-returned"
                >
                  <RadioGroupItem id="af-screen-returned" value="returned" />
                  <RotateCcw />
                  <span>
                    <b>{copy('Return for changes', 'إعادة للتعديل')}</b>
                    <span>
                      {copy(
                        'Explain what to improve. The team can edit its current work and resubmit; this submission remains unchanged.',
                        'وضح ما يحتاج إلى تحسين. يستطيع الفريق تحرير العمل الحالي وإعادة إرساله؛ يبقى هذا الإرسال دون تغيير.',
                      )}
                    </span>
                  </span>
                </Label>
              </RadioGroup>
              {outcome === 'returned' && (
                <Field>
                  <FieldLabel htmlFor="af-screen-reason">
                    {copy(
                      'Changes the team needs to make',
                      'التعديلات المطلوبة من الفريق',
                    )}
                  </FieldLabel>
                  <Textarea
                    id="af-screen-reason"
                    rows={3}
                    maxLength={2000}
                    disabled={blocked}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      memory['screening.reason.' + round.id] = e.target.value;
                    }}
                  />
                  <p dir="auto" className="ss-muted">
                    {copy(
                      'Required · at least 3 meaningful characters.',
                      'مطلوب · 3 أحرف ذات معنى على الأقل.',
                    )}
                  </p>
                </Field>
              )}
              {cmd.error && (
                <p dir="auto" role="alert">
                  {copy(
                    'The review could not be confirmed. Refresh the project and check your assignment or the original files. Nothing is claimed as accepted.',
                    'تعذر تأكيد المراجعة. حدّث المشروع وتحقق من الإسناد أو الملفات الأصلية. لا يُدّعى قبول العمل.',
                  )}
                </p>
              )}
              {cmd.state === 'unknown' ? (
                <>
                  <p dir="auto" role="status">
                    {copy(
                      'Review result is unknown. Check the request before another decision.',
                      'نتيجة المراجعة غير معروفة. تحقق من الطلب قبل قرار آخر.',
                    )}
                  </p>
                  <Button onClick={async () => await done(await cmd.recheck())}>
                    {copy('Check review status', 'تحقق من حالة المراجعة')}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={
                    !outcome ||
                    blocked ||
                    (outcome === 'returned' && reason.trim().length < 3)
                  }
                  onClick={() => setConfirm(true)}
                >
                  {outcome === 'returned'
                    ? copy('Review return for changes', 'راجع الإعادة للتعديل')
                    : copy('Review acceptance', 'راجع القبول')}
                </Button>
              )}
            </>
          ) : (
            <>
              <p dir="auto" role="status">
                {round.screening?.outcome === 'accepted'
                  ? copy('Accepted for assessment', 'مقبول للتقييم')
                  : round.screening?.outcome === 'returned'
                    ? copy('Returned for changes', 'أعيد للتعديل')
                    : copy(
                        'This review is no longer available to your assignment.',
                        'لم تعد هذه المراجعة متاحة لإسنادك.',
                      )}
              </p>
              {round.screening?.reason && (
                <p dir="auto">{round.screening.reason}</p>
              )}
              <Button asChild variant="outline">
                <Link
                  href={
                    '/' +
                    locale +
                    '/submissions/' +
                    round.id +
                    '?from=' +
                    encodeURIComponent(parent)
                  }
                >
                  {copy('Read submission record', 'اقرأ سجل الإرسال')}
                </Link>
              </Button>
            </>
          )}
        </section>
      </div>
      <DecisionConfirmation
        open={confirm}
        onOpenChange={(v) => {
          if (!blocked) setConfirm(v);
        }}
        title={
          outcome === 'accepted'
            ? copy('Accept for assessment', 'قبول للتقييم')
            : copy('Return for changes', 'إعادة للتعديل')
        }
        description={
          <>
            <p dir="auto">
              <bdi dir="auto">{round.metadata.title}</bdi>
            </p>
            <p dir="auto">
              {outcome === 'accepted'
                ? copy(
                    'The exact submitted files enter academic assessment. No score or publication is created by this acceptance.',
                    'تدخل الملفات المرسلة نفسها التقييم الأكاديمي. لا يُنشئ هذا القبول درجة أو نشرًا.',
                  )
                : copy(
                    'The submitted files and this feedback remain in history. Only the assigned team can revise and resubmit its project.',
                    'تبقى الملفات المرسلة وهذه الملاحظات في السجل. يستطيع الفريق المعيّن وحده تعديل المشروع وإعادة إرساله.',
                  )}
            </p>
            {outcome === 'returned' && <p dir="auto">{reason}</p>}
          </>
        }
      >
        <div className="ac-confirm-actions">
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() => setConfirm(false)}
          >
            {copy('Cancel', 'إلغاء')}
          </Button>
          <Button disabled={blocked} onClick={() => void send()}>
            {outcome === 'accepted'
              ? copy('Confirm acceptance', 'أكد القبول')
              : copy('Confirm return for changes', 'أكد الإعادة للتعديل')}
          </Button>
        </div>
      </DecisionConfirmation>
    </section>
  );
}
