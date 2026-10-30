'use client';
import { formatScore } from '@capstone/ui/score-format';
import { useEffect, useState } from 'react';
import { SubmittedMemberForm, type SubmittedPayload } from './submitted-form';
import {
  Button,
  Textarea,
  Field,
  FieldLabel,
  DecisionConfirmation,
} from '@capstone/ui/workspace-v2';
interface Case {
  case: string;
  project: string;
  submission: string;
  title: string;
  result: { id: string; total: number; members: number } | null;
  discrepancy: boolean;
  explanation: string | null;
  members: {
    invitation: string;
    name: string;
    email: string;
    assessment: string | null;
    total: number | null;
    submittedAt: string | null;
    payload?: SubmittedPayload | null;
    amendment: { id: string; reason: string; expiresAt: string } | null;
  }[];
}
export function CommitteeGovernance({ locale }: { locale: 'en' | 'ar' }) {
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const [cases, setCases] = useState<Case[]>([]),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<{
      case: Case;
      member?: Case['members'][number];
    } | null>(null);
  async function load() {
    const r = await fetch('/api/committee-governance', { cache: 'no-store' });
    if (!r.ok) throw Error();
    setCases((await r.json()).cases);
  }
  useEffect(() => {
    void load().catch(() =>
      setError(t('Governance data unavailable.', 'بيانات الحوكمة غير متاحة.')),
    );
  }, []);
  async function send() {
    if (!action) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/committee-governance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action.member
            ? {
                operation: 'amendment.authorize',
                invitation: action.member.invitation,
                head: action.member.assessment,
                reason,
                command: crypto.randomUUID(),
              }
            : {
                operation: 'discrepancy.explain',
                case: action.case.case,
                result: action.case.result?.id,
                reason,
                command: crypto.randomUUID(),
              },
        ),
      });
      if (!r.ok) throw Error();
      await load();
      setAction(null);
      setReason('');
    } catch {
      setError(
        t(
          'No governance change was confirmed. Refresh and verify the current head and institutional authority.',
          'لم يُؤكد تغيير الحوكمة. حدّث وتحقق من النسخة الحالية وصلاحية المؤسسة.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ss-page ac-page committee-roster" dir="ltr">
      <header className="ss-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <p dir="auto" className="ac-eyebrow">
            {t(
              'Institution-scoped assessment governance',
              'حوكمة التقييم ضمن المؤسسة',
            )}
          </p>
          <h1 dir="auto">
            {t('Verified committee assessments', 'تقييمات اللجنة الموثقة')}
          </h1>
          <p dir="auto">
            {t(
              'Authorize a reasoned correction by the original guest only. You cannot enter or replace their scores.',
              'فوّض تصحيحًا مسببًا من العضو الأصلي فقط. لا يمكنك إدخال درجاته أو استبدالها.',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            void load().catch(() =>
              setError(
                t('Governance data unavailable.', 'بيانات الحوكمة غير متاحة.'),
              ),
            )
          }
        >
          {t('Refresh', 'تحديث')}
        </Button>
      </header>
      {!cases.length && (
        <p dir="auto">
          {t(
            'No guest committee cases in your institution.',
            'لا توجد حالات لجنة ضيوف في مؤسستك.',
          )}
        </p>
      )}
      {cases.map((c) => (
        <section className="ss-card" key={c.case}>
          <h2 dir="auto">{c.title}</h2>
          <p dir="auto">
            <bdi dir="ltr">{c.submission}</bdi>
          </p>
          <p dir="auto">
            {c.result
              ? t(
                  `System-computed C: ${formatScore(c.result.total, locale)} · ${c.result.members} members`,
                  `نتيجة اللجنة المحتسبة: ${formatScore(c.result.total, locale)} · ${c.result.members} أعضاء`,
                )
              : t(
                  'Required committee forms are incomplete.',
                  'نماذج اللجنة المطلوبة غير مكتملة.',
                )}
          </p>
          {c.discrepancy && (
            <p dir="auto">
              {t(
                'A criterion or total discrepancy requires a documented institutional explanation before new allocation. Legitimate scores remain unchanged.',
                'يتطلب اختلاف المعايير أو النتيجة تفسيرًا مؤسسيًا موثقًا قبل التكليف الجديد. تبقى الدرجات الصحيحة دون تغيير.',
              )}
            </p>
          )}
          {c.explanation && <p dir="auto">{c.explanation}</p>}
          {c.discrepancy && !c.explanation && c.result && (
            <Button
              variant="outline"
              onClick={() => {
                setReason('');
                setAction({ case: c });
              }}
            >
              {t('Explain discrepancy', 'تفسير الاختلاف')}
            </Button>
          )}
          <ul className="committee-members">
            {c.members.map((m) => (
              <li key={m.invitation}>
                <div>
                  <strong dir="auto">
                    {m.name || t('Verified guest', 'ضيف موثق')}
                  </strong>
                  <p dir="auto">
                    <bdi dir="ltr">{m.email}</bdi>
                  </p>
                  <p dir="auto">
                    {m.assessment
                      ? t(
                          `Individual result: ${formatScore(m.total, locale)}/100`,
                          `النتيجة الفردية: ${formatScore(m.total, locale)}/١٠٠`,
                        )
                      : t('Not submitted', 'لم يُرسل')}
                  </p>
                  {m.amendment && (
                    <p dir="auto">
                      {t(
                        'Original-member amendment authorized until',
                        'فُوّض تعديل العضو الأصلي حتى',
                      )}{' '}
                      {new Date(m.amendment.expiresAt).toLocaleString(locale)}
                    </p>
                  )}
                </div>
                {m.payload && (
                  <SubmittedMemberForm
                    locale={locale}
                    submission={c.submission}
                    from={`/${locale}/admin/university/committee-assessments`}
                    payload={m.payload}
                    total={m.total ?? 0}
                  />
                )}
                {m.assessment && !m.amendment && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReason('');
                      setAction({ case: c, member: m });
                    }}
                  >
                    {t('Authorize member amendment', 'تفويض تعديل العضو')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {error && (
        <p dir="auto" role="alert">
          {error}
        </p>
      )}
      <DecisionConfirmation
        open={!!action}
        onOpenChange={(v) => {
          if (!v) setAction(null);
        }}
        title={
          action?.member
            ? t(
                'Authorize the original member to amend?',
                'تفويض العضو الأصلي للتعديل؟',
              )
            : t('Record institutional explanation?', 'تسجيل التفسير المؤسسي؟')
        }
        description={t(
          'This preserves all original records and does not alter a score or impersonate an evaluator. A correction invitation is sent only to the original verified address.',
          'يحفظ هذا جميع السجلات الأصلية ولا يغيّر درجة أو ينتحل مقيّمًا. تُرسل دعوة التصحيح فقط إلى العنوان الموثق الأصلي.',
        )}
      >
        <p dir="auto">{action?.case.title}</p>
        {action?.member && (
          <p dir="auto">
            <bdi dir="ltr">{action.member.email}</bdi>
          </p>
        )}
        <Field>
          <FieldLabel htmlFor="committee-governance-reason">
            {t(
              'Required reason · at least 20 characters',
              'سبب مطلوب · ٢٠ حرفًا على الأقل',
            )}
          </FieldLabel>
          <Textarea
            id="committee-governance-reason"
            dir="auto"
            minLength={20}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          pending={busy}
          variant="outline"
          disabled={busy}
          onClick={() => setAction(null)}
        >
          {t('Cancel', 'إلغاء')}
        </Button>
        <Button
          disabled={busy || reason.trim().length < 20}
          onClick={() => void send()}
        >
          {t('Confirm governance action', 'تأكيد إجراء الحوكمة')}
        </Button>
      </DecisionConfirmation>
    </section>
  );
}
