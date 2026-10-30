'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  Textarea,
  RadioGroup,
  RadioGroupItem,
  DecisionConfirmation,
  ShieldCheck,
  CircleCheck,
  LockKeyhole,
} from '@capstone/ui/workspace-v2';
import type {
  AccessGrant,
  AccessRequest,
  AccessCommand,
} from '../access/types';
import type { PartnerProfile } from '../partners/types';
import { useSemesterMemory } from '../semester/memory';
import { copy, type Locale } from './model';
import { accessHub } from './presentation';
import { usePartnerCommand, CommandOutcome } from './command';
import { PartnerHeader, ProjectLink, Stamp, Status } from './studio';
const validText = (s: string, min: number, max: number, multiline = false) =>
  [...s.trim()].length >= min &&
  [...s].length <= max &&
  !(
    multiline
      ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
      : /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u
  ).test(s);
export function Eligibility({
  locale,
  actor,
  profile,
  canResubmit,
}: {
  locale: Locale;
  actor: string;
  profile: PartnerProfile;
  canResubmit: boolean;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    memory = useSemesterMemory(actor, actor),
    [organization, setOrganization] = useState(
      memory['partner.organization'] ?? profile.organization ?? '',
    ),
    [clarification, setClarification] = useState(
      memory['partner.clarification'] ?? '',
    ),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [responseError, setResponseError] = useState(''),
    input = useRef<HTMLTextAreaElement>(null),
    responseInput = useRef<HTMLTextAreaElement>(null),
    cmd = usePartnerCommand(actor, actor, '/api/partners');
  useEffect(() => {
    memory['partner.organization'] = organization;
    memory['partner.clarification'] = clarification;
  }, [organization, clarification, memory]);
  return (
    <section
      className="ps-page ps-focused"
      data-template="partner-eligibility"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={t('Organization & eligibility', 'المؤسسة والأهلية')}
        back={'/' + locale + '/partner'}
        backLabel={t(
          'Back to partner overview',
          'العودة إلى نظرة الشريك العامة',
        )}
      />
      <section className="ps-identity">
        <ShieldCheck />
        <div>
          <h2 dir="auto">
            {profile.organization ||
              t('Organization not submitted', 'لم تُقدّم المؤسسة')}
          </h2>
          <p dir="auto">
            {profile.name} · <bdi dir="ltr">{profile.email}</bdi>
          </p>
          <Status locale={locale} value={profile.status} />
        </div>
      </section>
      {profile.reason && (
        <section className="ps-recorded-reason">
          <h2 dir="auto">{t('Platform decision', 'قرار المنصة')}</h2>
          <p dir="auto">{profile.reason}</p>
          <p dir="auto" className="ps-muted">
            {canResubmit
              ? t(
                  'Respond to the decision below. Keep a correct organization name unchanged.',
                  'رد على القرار أدناه. اترك اسم المؤسسة الصحيح دون تغيير.',
                )
              : t(
                  'This is the current recorded reason. Eligibility changes require a platform decision.',
                  'هذا هو السبب المسجل حاليًا. تتطلب تغييرات الأهلية قرار المنصة.',
                )}
          </p>
        </section>
      )}
      {profile.clarification && (
        <section className="ps-recorded-reason">
          <h2 dir="auto">{t('Your recorded response', 'ردك المسجل')}</h2>
          <p dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
            {profile.clarification}
          </p>
        </section>
      )}
      {canResubmit ? (
        <Card>
          <CardContent>
            <form
              className="ps-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validText(organization, 1, 200)) {
                  setError(
                    t(
                      'Enter an organization name of 1–200 characters, without line breaks.',
                      'أدخل اسم مؤسسة من 1–200 حرف، دون فواصل أسطر.',
                    ),
                  );
                  input.current?.focus();
                  return;
                }
                setError('');
                if (
                  clarification.trim() &&
                  !validText(clarification, 3, 1000, true)
                ) {
                  setResponseError(
                    t(
                      'Use 3–1,000 characters for your response.',
                      'استخدم من 3 إلى 1,000 حرف للرد.',
                    ),
                  );
                  responseInput.current?.focus();
                  return;
                }
                setResponseError('');
                setConfirm(true);
              }}
            >
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="partner-organization">
                  {t('Organization name', 'اسم المؤسسة')}
                </FieldLabel>
                <Textarea
                  ref={input}
                  id="partner-organization"
                  data-testid="organization-correction"
                  dir="auto"
                  rows={3}
                  value={organization}
                  maxLength={200}
                  disabled={cmd.blocked}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                  onChange={(e) => {
                    setOrganization(e.target.value);
                    setError('');
                  }}
                  aria-invalid={!!error}
                  aria-describedby="organization-guidance organization-error"
                />
                <FieldDescription id="organization-guidance">
                  {t(
                    'Use the organization name the platform should review. Your correction returns eligibility to Pending; it creates no file grant.',
                    'استخدم اسم المؤسسة الذي ينبغي للمنصة مراجعته. يعيد التصحيح الأهلية إلى الانتظار؛ ولا ينشئ إذن ملفات.',
                  )}
                </FieldDescription>
                {error && (
                  <FieldError id="organization-error">{error}</FieldError>
                )}
              </Field>
              <Field data-invalid={!!responseError}>
                <FieldLabel htmlFor="partner-clarification">
                  {t(
                    'Response to the decision (optional)',
                    'الرد على القرار (اختياري)',
                  )}
                </FieldLabel>
                <Textarea
                  ref={responseInput}
                  id="partner-clarification"
                  rows={4}
                  maxLength={1000}
                  dir="auto"
                  value={clarification}
                  disabled={cmd.blocked}
                  aria-invalid={!!responseError}
                  aria-describedby={
                    'clarification-guidance' +
                    (responseError ? ' clarification-error' : '')
                  }
                  onChange={(e) => {
                    setClarification(e.target.value);
                    setResponseError('');
                  }}
                />
                <FieldDescription id="clarification-guidance">
                  {t(
                    'Explain the requested clarification in 3–1,000 characters. This response is visible to your eligibility reviewer.',
                    'وضّح المطلوب في 3–1,000 حرف. يظهر هذا الرد لمراجع الأهلية.',
                  )}
                </FieldDescription>
                {responseError && (
                  <FieldError id="clarification-error">
                    {responseError}
                  </FieldError>
                )}
              </Field>
              <Button className="ps-primary" disabled={cmd.blocked}>
                {t('Review correction', 'مراجعة التصحيح')}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p dir="auto" className="ps-muted">
          {profile.status === 'pending'
            ? t(
                'Your eligibility is awaiting platform review. Public projects remain available.',
                'تنتظر أهليتك مراجعة المنصة. تبقى المشاريع العامة متاحة.',
              )
            : profile.status === 'approved'
              ? t(
                  'Eligibility is approved. Each project still needs its own lead-approved permission. Approved organization identity cannot be edited through this workflow.',
                  'الأهلية معتمدة. لا يزال كل مشروع يحتاج إذنه المعتمد من القائد. لا يمكن تعديل هوية المؤسسة المعتمدة عبر هذا المسار.',
                )
              : t(
                  'Only the platform can restore eligibility. You can review your access history or public projects.',
                  'المنصة وحدها يمكنها استعادة الأهلية. يمكنك مراجعة سجل وصولك أو المشاريع العامة.',
                )}
        </p>
      )}
      <CommandOutcome locale={locale} cmd={cmd} />
      <div className="ps-actions">
        <Button asChild variant="outline">
          <Link href={accessHub(locale, 'active')}>
            {t('Project access', 'الوصول إلى المشاريع')}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={'/' + locale + '/catalogue'}>
            {t('Discover public projects', 'استكشاف المشاريع العامة')}
          </Link>
        </Button>
      </div>
      <details className="ps-history">
        <summary>{t('Eligibility history', 'سجل الأهلية')}</summary>
        {profile.history.map((h) => (
          <div key={h.revision} className="ps-history-event">
            <Status locale={locale} value={h.to} />
            <Stamp locale={locale} value={h.at} />
            {h.reason && <p dir="auto">{h.reason}</p>}
          </div>
        ))}
      </details>
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={t('Review organization correction', 'مراجعة تصحيح المؤسسة')}
        description={
          <div className="ps-confirm-copy">
            <p dir="auto">{organization.trim()}</p>
            {clarification.trim() && <p dir="auto">{clarification.trim()}</p>}
            <p dir="auto">
              {t(
                'Send this corrected identity to platform eligibility review. Project permissions will still require the lead’s approval.',
                'أرسل هذه الهوية المصححة إلى مراجعة أهلية المنصة. ستظل أذونات المشاريع تتطلب اعتماد القائد.',
              )}
            </p>
          </div>
        }
      >
        <Button variant="outline" onClick={() => setConfirm(false)}>
          {t('Edit correction', 'تعديل التصحيح')}
        </Button>
        <Button
          className="ps-primary"
          disabled={cmd.blocked}
          onClick={() => {
            setConfirm(false);
            void cmd.send({
              command: 'resubmit',
              target: actor,
              revision: profile.revision,
              organization: organization.trim(),
              ...(clarification.trim()
                ? { clarification: clarification.trim() }
                : {}),
            });
          }}
        >
          {t('Submit correction', 'إرسال التصحيح')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
export function AccessRequestPage({
  locale,
  actor,
  profile,
  target,
  existing,
  grant,
  parent,
  canRequest,
}: {
  locale: Locale;
  actor: string;
  profile: PartnerProfile;
  target: {
    project: string;
    version: string;
    title: string;
    versionNumber: number;
    institution: string;
  };
  existing?: AccessRequest;
  grant?: AccessGrant;
  parent: string;
  canRequest: boolean;
}) {
  const t = (e: string, a: string) => copy(locale, e, a),
    memory = useSemesterMemory(actor, target.project),
    key = 'partner.purpose.' + target.version,
    [purpose, setPurpose] = useState(memory[key] ?? ''),
    [confirm, setConfirm] = useState<'request' | 'cancel' | null>(null),
    [error, setError] = useState(''),
    input = useRef<HTMLTextAreaElement>(null),
    cmd = usePartnerCommand(actor, target.version);
  useEffect(() => {
    memory[key] = purpose;
  }, [memory, key, purpose]);
  return (
    <section
      className="ps-page ps-focused"
      data-template="partner-request"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={
          existing?.status === 'pending'
            ? t('Awaiting project lead', 'بانتظار قائد المشروع')
            : existing
              ? t('Request record', 'سجل الطلب')
              : t('Request project access', 'طلب الوصول إلى المشروع')
        }
        back={parent}
        backLabel={t(
          'Back to Project access',
          'العودة إلى الوصول إلى المشاريع',
        )}
      />
      <section className="ps-request-context">
        <FileProject locale={locale} target={target} />
        <div className="ps-request-organization">
          <ShieldCheck />
          <div>
            <span className="ps-muted">
              {t('Requesting organization', 'المؤسسة الطالبة')}
            </span>
            <strong dir="auto">{profile.organization}</strong>
            <Status locale={locale} value={profile.status} />
          </div>
        </div>
      </section>
      {existing && (
        <section className="ps-request-record">
          <div className="ps-section-title">
            <Status
              locale={locale}
              value={
                existing.status === 'pending'
                  ? 'awaiting_lead'
                  : existing.status
              }
            />
            <Stamp
              locale={locale}
              value={
                existing.decidedAt ?? existing.cancelledAt ?? existing.createdAt
              }
            />
          </div>
          <h2 dir="auto">{t('Purpose', 'الغرض')}</h2>
          <p dir="auto">{existing.justification}</p>
          {existing.reason && (
            <div className="ps-recorded-reason">
              <h3 dir="auto">{t('Recorded reason', 'السبب المسجل')}</h3>
              <p dir="auto">{existing.reason}</p>
            </div>
          )}
          {existing.status === 'pending' && (
            <div className="ps-actions">
              <p dir="auto" className="ps-muted">
                {t(
                  'The lead will review your organization and purpose. No Restricted files are available from a pending request.',
                  'سيراجع القائد مؤسستك وغرضك. لا تتاح الملفات المقيّدة من طلب معلّق.',
                )}
              </p>
              <Button
                variant="outline"
                disabled={cmd.blocked}
                onClick={() => setConfirm('cancel')}
              >
                {t('Cancel request', 'إلغاء الطلب')}
              </Button>
            </div>
          )}
        </section>
      )}
      {grant && (
        <div className="ps-existing-grant">
          <Status locale={locale} value={grant.state} />
          <Button asChild variant="outline">
            <Link href={'/' + locale + '/partner/grants/' + grant.id}>
              {grant.canRead
                ? t('Open original files', 'فتح الملفات الأصلية')
                : t('View access history', 'عرض سجل الوصول')}
            </Link>
          </Button>
        </div>
      )}
      {canRequest ? (
        <form
          className="ps-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validText(purpose, 20, 2000, true)) {
              setError(
                t(
                  'Explain your project-specific purpose in 20–2,000 characters.',
                  'وضّح غرضك الخاص بالمشروع في 20–2,000 حرف.',
                ),
              );
              input.current?.focus();
              return;
            }
            setError('');
            setConfirm('request');
          }}
        >
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="access-purpose">
              {t('Purpose for this project', 'الغرض من هذا المشروع')}
            </FieldLabel>
            <Textarea
              ref={input}
              id="access-purpose"
              data-testid="access-purpose"
              dir="auto"
              value={purpose}
              maxLength={2000}
              rows={5}
              disabled={cmd.blocked}
              aria-invalid={!!error}
              aria-describedby="purpose-guidance purpose-error"
              onChange={(e) => {
                setPurpose(e.target.value);
                setError('');
              }}
            />
            <FieldDescription id="purpose-guidance">
              {t(
                'What will you study or compare using the project’s original files? Be specific about this project.',
                'ما الذي ستدرسه أو تقارنه باستخدام الملفات الأصلية للمشروع؟ كن محددًا بشأن هذا المشروع.',
              )}
            </FieldDescription>
            {error && <FieldError id="purpose-error">{error}</FieldError>}
          </Field>
          <section className="ps-access-effect">
            <LockKeyhole />
            <p dir="auto">
              {t(
                'Eligibility lets you request. The current project lead decides permission for Public + Restricted originals of this approved archived version, for 90 days.',
                'تتيح الأهلية الطلب. يقرر قائد المشروع الحالي الإذن بالأصول العامة والمقيّدة لهذه النسخة المؤرشفة المعتمدة، لمدة 90 يومًا.',
              )}
            </p>
          </section>
          <Button className="ps-primary" disabled={cmd.blocked}>
            {t('Review request', 'مراجعة الطلب')}
          </Button>
        </form>
      ) : (
        !existing &&
        !grant && (
          <p dir="auto">
            <Link href={'/' + locale + '/partner/eligibility'}>
              {t(
                'Review eligibility before requesting access.',
                'راجع الأهلية قبل طلب الوصول.',
              )}
            </Link>
          </p>
        )
      )}
      <CommandOutcome locale={locale} cmd={cmd} />
      <Button asChild variant="ghost">
        <Link
          href={accessHub(
            locale,
            existing?.status === 'pending' ? 'pending' : 'history',
            target.project,
          )}
        >
          {t('View project access', 'عرض وصول المشروع')}
        </Link>
      </Button>
      <DecisionConfirmation
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
        title={
          confirm === 'cancel'
            ? t('Cancel this request?', 'إلغاء هذا الطلب؟')
            : t('Review your request', 'مراجعة طلبك')
        }
        description={
          confirm === 'cancel' ? (
            <p dir="auto">
              {t(
                'The lead will no longer be able to approve this pending request.',
                'لن يتمكن القائد من اعتماد هذا الطلب المعلّق.',
              )}
            </p>
          ) : (
            <BidiFacts className="ps-check-answers">
              <BidiLabel dir="auto">{t('Project', 'المشروع')}</BidiLabel>
              <BidiData dir="auto">{target.title}</BidiData>
              <BidiLabel dir="auto">{t('Organization', 'المؤسسة')}</BidiLabel>
              <BidiData dir="auto">{profile.organization}</BidiData>
              <BidiLabel dir="auto">{t('Purpose', 'الغرض')}</BidiLabel>
              <BidiData dir="auto">{purpose.trim()}</BidiData>
              <BidiLabel dir="auto">
                {t('If approved', 'عند الاعتماد')}
              </BidiLabel>
              <BidiData dir="auto">
                {t(
                  'Public + Restricted originals; this archived version only; 90 days. File access does not transfer ownership or a reuse licence.',
                  'أصول عامة ومقيّدة؛ هذه النسخة المؤرشفة فقط؛ 90 يومًا. الوصول إلى الملفات لا ينقل الملكية ولا يمنح ترخيص إعادة استخدام.',
                )}
              </BidiData>
            </BidiFacts>
          )
        }
      >
        <Button variant="outline" onClick={() => setConfirm(null)}>
          {confirm === 'cancel'
            ? t('Keep request', 'إبقاء الطلب')
            : t('Edit request', 'تعديل الطلب')}
        </Button>
        <Button
          className="ps-primary"
          disabled={cmd.blocked}
          onClick={() => {
            const op = confirm;
            setConfirm(null);
            void cmd.send(
              op === 'cancel'
                ? {
                    operation: 'cancel',
                    project: target.project,
                    version: target.version,
                    target: existing!.id,
                    revision: existing!.revision,
                  }
                : {
                    operation: 'request',
                    project: target.project,
                    version: target.version,
                    text: purpose.trim(),
                  },
            );
          }}
        >
          {confirm === 'cancel'
            ? t('Confirm cancellation', 'تأكيد الإلغاء')
            : t('Submit request', 'إرسال الطلب')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
function FileProject({
  locale,
  target,
}: {
  locale: Locale;
  target: { project: string; title: string; institution: string };
}) {
  return (
    <div>
      <ProjectLink locale={locale} item={target} />
      {target.institution && (
        <p className="ps-muted" dir="auto">
          {target.institution}
        </p>
      )}
    </div>
  );
}
type AccessDecisionProps = {
  locale: Locale;
  actor: string;
  request?: AccessRequest;
  grant?: AccessGrant;
  parent: string;
  protective?: boolean;
  actions: AccessCommand['operation'][];
};
export function AccessDecision(props: AccessDecisionProps) {
  const item = props.request ?? props.grant!;
  const phase = props.actions.some(
    (a) => a === 'revoke' || a === 'protective-revoke',
  )
    ? 'revoke'
    : 'decision';
  return <AccessDecisionForm key={item.id + ':' + phase} {...props} />;
}
function AccessDecisionForm({
  locale,
  actor,
  request,
  grant,
  parent,
  protective = false,
  actions,
}: AccessDecisionProps) {
  const t = (e: string, a: string) => copy(locale, e, a),
    item = request ?? grant!,
    memory = useSemesterMemory(actor, item.project),
    phase = actions.some((a) => a === 'revoke' || a === 'protective-revoke')
      ? 'revoke'
      : 'decision',
    reasonKey = 'access.reason.' + item.id + '.' + phase,
    [reason, setReason] = useState(memory[reasonKey] ?? ''),
    [selected, setSelected] = useState<AccessCommand['operation'] | ''>(
      (memory['access.intent.' + item.id] ?? '') as
        AccessCommand['operation'] | '',
    ),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    input = useRef<HTMLTextAreaElement>(null),
    cmd = usePartnerCommand(actor, item.id),
    revoke =
      actions.includes('revoke') || actions.includes('protective-revoke');
  useEffect(() => {
    memory[reasonKey] = reason;
    memory['access.intent.' + item.id] = selected;
  }, [reason, selected, memory, item.id, reasonKey]);
  const operation = revoke ? actions[0] : selected,
    label = (op: string) =>
      op === 'approve'
        ? t('Approve access', 'اعتماد الوصول')
        : op === 'deny'
          ? t('Decline request', 'رفض الطلب')
          : t('Revoke permission', 'سحب الإذن');
  return (
    <section
      className="ps-page ps-focused"
      data-template="access-decision"
      data-locale={locale}
    >
      <PartnerHeader
        locale={locale}
        title={
          protective
            ? t('Protective access action', 'إجراء لحماية الوصول')
            : t('Partner request', 'طلب شريك')
        }
        back={parent}
        backLabel={
          protective
            ? t('Back to access protection', 'العودة إلى حماية الوصول')
            : t('Back to partner requests', 'العودة إلى طلبات الشركاء')
        }
      />
      <section className="ps-decision-context">
        <ProjectLink locale={locale} item={item} />
        <div className="ps-meta">
          <Status
            locale={locale}
            value={
              request?.status === 'pending'
                ? 'awaiting_lead'
                : (grant?.state ?? request!.status)
            }
          />
          {request && (
            <Status
              locale={locale}
              value={request.eligible ? 'eligible' : 'ineligible'}
            />
          )}
        </div>
        <BidiFacts className="ps-facts">
          <BidiLabel dir="auto">{t('Organization', 'المؤسسة')}</BidiLabel>
          <BidiData dir="auto">{item.organization}</BidiData>
          <BidiLabel dir="auto">{t('Partner', 'الشريك')}</BidiLabel>
          <BidiData dir="auto">{item.partnerName}</BidiData>
          {request && (
            <>
              <BidiLabel dir="auto">{t('Purpose', 'الغرض')}</BidiLabel>
              <BidiData dir="auto">{request.justification}</BidiData>
            </>
          )}
          <BidiLabel dir="auto">{t('Scope', 'النطاق')}</BidiLabel>
          <BidiData dir="auto">
            {t(
              'Public + Restricted originals of this approved archived version only',
              'الأصول العامة والمقيّدة لهذه النسخة المؤرشفة المعتمدة فقط',
            )}{' '}
            · {item.versionNumber}
          </BidiData>
          <BidiLabel dir="auto">{t('Duration', 'المدة')}</BidiLabel>
          <BidiData dir="auto">
            {grant ? (
              <>
                <Stamp locale={locale} value={grant.grantedAt} /> →{' '}
                <Stamp locale={locale} value={grant.expiresAt} />
              </>
            ) : (
              t('90 days after approval', '90 يومًا بعد الاعتماد')
            )}
          </BidiData>
        </BidiFacts>
        {item.reason && (
          <section className="ps-recorded-reason">
            <h2 dir="auto">{t('Recorded decision', 'القرار المسجل')}</h2>
            <p dir="auto">{item.reason}</p>
          </section>
        )}
      </section>
      {actions.length > 0 ? (
        <form
          className="ps-form ps-decision-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!operation) {
              setError(
                t(
                  'Choose Approve or Decline first.',
                  'اختر الاعتماد أو الرفض أولًا.',
                ),
              );
              return;
            }
            if (
              (operation !== 'approve' || reason.trim()) &&
              !validText(reason, 3, 400)
            ) {
              setError(
                operation === 'deny'
                  ? t(
                      'Give the partner a clear decline reason, 3–400 characters.',
                      'قدّم للشريك سبب رفض واضحًا من 3–400 حرف.',
                    )
                  : t(
                      'Provide a reason of 3–400 characters.',
                      'قدّم سببًا من 3–400 حرف.',
                    ),
              );
              input.current?.focus();
              return;
            }
            setError('');
            setConfirm(true);
          }}
        >
          {!revoke && (
            <Field>
              <FieldLabel>{t('Your decision', 'قرارك')}</FieldLabel>
              <RadioGroup
                className="ps-decision-choices"
                dir="ltr"
                value={selected}
                onValueChange={(v) => {
                  setSelected(v as AccessCommand['operation']);
                  setError('');
                }}
                aria-label={t('Your decision', 'قرارك')}
              >
                {(['approve', 'deny'] as const)
                  .filter((op) => actions.includes(op))
                  .map((op) => (
                    <label
                      dir="auto"
                      key={op}
                      className={
                        'ps-decision-choice' +
                        (selected === op ? ' is-selected' : '')
                      }
                    >
                      <RadioGroupItem value={op} />
                      <span>
                        {op === 'approve' ? <CircleCheck /> : <LockKeyhole />}
                        {op === 'approve'
                          ? t('Approve', 'اعتماد')
                          : t('Decline', 'رفض')}
                      </span>
                    </label>
                  ))}
              </RadioGroup>
            </Field>
          )}
          {(selected || revoke) && (
            <>
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor="access-decision-reason">
                  {operation === 'approve'
                    ? t(
                        'Approval note (optional)',
                        'ملاحظة الاعتماد (اختيارية)',
                      )
                    : operation === 'deny'
                      ? t('Reason for declining', 'سبب الرفض')
                      : t('Reason for revocation', 'سبب السحب')}
                </FieldLabel>
                <Textarea
                  ref={input}
                  id="access-decision-reason"
                  data-testid="access-decision-reason"
                  dir="auto"
                  value={reason}
                  rows={3}
                  maxLength={400}
                  disabled={cmd.blocked}
                  aria-invalid={!!error}
                  aria-describedby="decision-error"
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError('');
                  }}
                />
                <FieldDescription>
                  {operation === 'approve'
                    ? t(
                        'A note is optional. If entered, use 3–400 characters.',
                        'الملاحظة اختيارية. عند إدخالها، استخدم 3–400 حرف.',
                      )
                    : t(
                        'This reason is required and becomes part of the recorded decision.',
                        'هذا السبب مطلوب ويصبح جزءًا من القرار المسجل.',
                      )}
                </FieldDescription>
                {error && <FieldError id="decision-error">{error}</FieldError>}
              </Field>
              <p dir="auto" className="ps-muted">
                {operation === 'approve'
                  ? t(
                      'Approval opens this exact archived version for this organization for 90 days.',
                      'يفتح الاعتماد هذه النسخة المؤرشفة المحددة لهذه المؤسسة لمدة 90 يومًا.',
                    )
                  : operation === 'deny'
                    ? t(
                        'Declining creates no file permission. The partner can read your reason.',
                        'لا ينشئ الرفض إذن ملفات. يمكن للشريك قراءة سببك.',
                      )
                    : t(
                        'Revocation stops future Restricted previews, originals, ranges and ZIP reads immediately.',
                        'يوقف السحب فورًا قراءات المعاينات والأصول والنطاقات وملفات ZIP المقيّدة المستقبلية.',
                      )}
              </p>
              <Button className="ps-primary" disabled={cmd.blocked}>
                {operation === 'approve'
                  ? t('Review approval', 'مراجعة الاعتماد')
                  : operation === 'deny'
                    ? t('Review decline', 'مراجعة الرفض')
                    : t('Review revocation', 'مراجعة السحب')}
              </Button>
            </>
          )}
          {error && !selected && !revoke && <FieldError>{error}</FieldError>}
        </form>
      ) : (
        <div className="ps-receipt">
          {request?.status === 'pending' ? <LockKeyhole /> : <CircleCheck />}
          <p dir="auto">
            {grant?.state === 'revoked'
              ? t(
                  'This permission was revoked. Future Restricted file reads are denied.',
                  'سُحب هذا الإذن. تُرفض قراءات الملفات المقيّدة المستقبلية.',
                )
              : grant?.state === 'expired'
                ? t(
                    'This permission has expired. It no longer grants Restricted file access.',
                    'انتهت صلاحية هذا الإذن. لم يعد يمنح الوصول إلى الملفات المقيّدة.',
                  )
                : request?.status === 'pending'
                  ? t(
                      'This partner is not currently eligible for a decision.',
                      'هذا الشريك غير مؤهل حاليًا لاتخاذ قرار.',
                    )
                  : t(
                      'The current decision is recorded. No further approval is available for this request.',
                      'القرار الحالي مسجل. لا يتاح اعتماد إضافي لهذا الطلب.',
                    )}
          </p>
          {grant?.state === 'revoked' && (
            <div>
              {grant.reason && <p dir="auto">{grant.reason}</p>}
              {grant.revokedAt && (
                <Stamp locale={locale} value={grant.revokedAt} />
              )}
            </div>
          )}
        </div>
      )}
      <CommandOutcome locale={locale} cmd={cmd} />
      <DecisionConfirmation
        open={confirm}
        onOpenChange={setConfirm}
        title={operation ? label(operation) + '?' : ''}
        description={
          <div className="ps-confirm-copy">
            <strong dir="auto">{item.organization}</strong>
            <p dir="auto">{item.title}</p>
            <p dir="auto">
              {operation === 'approve'
                ? t(
                    'Grant Public + Restricted originals of this approved archived version for 90 days to this organization.',
                    'امنح هذه المؤسسة الأصول العامة والمقيّدة لهذه النسخة المؤرشفة المعتمدة لمدة 90 يومًا.',
                  )
                : operation === 'deny'
                  ? t(
                      'Decline this request without creating permission.',
                      'ارفض هذا الطلب دون إنشاء إذن.',
                    )
                  : t(
                      'End this permission. Future Restricted reads will be denied immediately.',
                      'أنه هذا الإذن. ستُرفض قراءات الملفات المقيّدة المستقبلية فورًا.',
                    )}
            </p>
            {reason.trim() && <p dir="auto">{reason.trim()}</p>}
          </div>
        }
      >
        <Button variant="outline" onClick={() => setConfirm(false)}>
          {t('Back to decision', 'العودة إلى القرار')}
        </Button>
        <Button
          className="ps-primary"
          disabled={cmd.blocked}
          onClick={() => {
            setConfirm(false);
            const op = operation!;
            void cmd.send({
              operation: op,
              project: item.project,
              version: item.version,
              target:
                op === 'revoke' || op === 'protective-revoke'
                  ? grant!.id
                  : item.id,
              revision:
                op === 'revoke' || op === 'protective-revoke'
                  ? grant!.revision
                  : item.revision,
              ...(reason.trim() ? { text: reason.trim() } : {}),
            });
          }}
        >
          {operation ? label(operation) : ''}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
