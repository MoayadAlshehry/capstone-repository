'use client';
import { externalRubric } from '@capstone/domain/external-reviews';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  reviewerValidation,
  type ReviewerProfile,
} from '@capstone/domain/reviewer-types';
import {
  Button,
  Field,
  FieldLabel,
  Textarea,
  Input,
  Label,
  DecisionConfirmation,
} from '@capstone/ui/workspace-v2';
import { useSemesterMemory } from '../semester/memory';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
import type { NavigationContext } from '../workspace-v2/navigation-context';
import { useValidatedPersonalNavigation } from '../workspace-v2/navigation-context-client';
export function ReviewerProfileForm({
  locale,
  actor,
  profile,
  intent,
  reviewerCapable,
  backHref,
}: {
  locale: 'en' | 'ar';
  actor: string;
  profile: ReviewerProfile | null;
  intent: NavigationContext;
  reviewerCapable: boolean;
  backHref: string;
}) {
  useValidatedPersonalNavigation(actor, reviewerCapable, intent);
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    router = useRouter(),
    memory = useSemesterMemory(actor, 'reviewer.profile'),
    lock = useRef(false);
  const saved = {
    qualification: profile?.qualification ?? '',
    tags: profile?.tags.join(', ') ?? '',
    domains: profile?.domains ?? [],
    languages: profile?.languages ?? [],
    available: profile?.available ?? false,
    ack: false,
  };
  const restored = (() => {
    try {
      const draft = JSON.parse(memory.draft ?? 'null') as typeof saved | null;
      return draft &&
        typeof draft.qualification === 'string' &&
        typeof draft.tags === 'string' &&
        Array.isArray(draft.domains) &&
        draft.domains.every((domain) =>
          ['software', 'data', 'hardware'].includes(domain),
        ) &&
        Array.isArray(draft.languages) &&
        draft.languages.every((language) => ['en', 'ar'].includes(language)) &&
        typeof draft.available === 'boolean' &&
        typeof draft.ack === 'boolean'
        ? draft
        : saved;
    } catch {
      return saved;
    }
  })();
  const [qualification, setQualification] = useState(restored.qualification),
    [tags, setTags] = useState(restored.tags),
    [domains, setDomains] = useState(restored.domains),
    [languages, setLanguages] = useState(restored.languages),
    [available, setAvailable] = useState(restored.available),
    [ack, setAck] = useState(restored.ack),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState<'save' | 'calibrate' | null>(null);
  const draft = { qualification, tags, domains, languages, available, ack },
    dirty =
      JSON.stringify({ ...draft, ack: false }) !== JSON.stringify(saved) ||
      (ack && profile?.calibrationVersion !== 'EXTERNAL_V1');
  function resetDraft() {
    setQualification(saved.qualification);
    setTags(saved.tags);
    setDomains(saved.domains);
    setLanguages(saved.languages);
    setAvailable(saved.available);
    setAck(false);
    delete memory.draft;
  }
  const exitGuard = useAssessmentExit(dirty || busy, locale, resetDraft, {
    preserveLocaleSwitch: true,
    canDiscard: !busy,
  });
  useEffect(() => {
    memory.draft = JSON.stringify(draft);
  }, [qualification, tags, domains, languages, available, ack, memory]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || busy) event.preventDefault();
    };
    const clear = () => {
      setQualification('');
      setTags('');
      setDomains([]);
      setLanguages([]);
      setAvailable(false);
      setAck(false);
      delete memory.draft;
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [dirty, busy, memory]);
  function toggle(
    values: string[],
    value: string,
    set: (values: string[]) => void,
  ) {
    set(
      values.includes(value)
        ? values.filter((x) => x !== value)
        : [...values, value],
    );
  }
  async function send(operation: 'save' | 'calibrate') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const normalized =
        operation === 'save'
          ? reviewerValidation({
              qualification,
              domains,
              tags: tags
                .split(/[,،]/)
                .map((tag) => tag.trim())
                .filter(Boolean),
              languages,
              available,
            })
          : null;
      if (operation === 'save' && !normalized) throw Error('INVALID_INPUT');
      const response = await fetch('/api/reviewers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify({
          command: crypto.randomUUID(),
          target: actor,
          operation,
          revision: profile?.revision ?? 0,
          body:
            operation === 'save'
              ? normalized
              : { version: 'EXTERNAL_V1', acknowledged: true },
        }),
      });
      if (!response.ok) throw Error('REJECTED');
      if (normalized) {
        setQualification(normalized.qualification);
        setTags(normalized.tags.join(', '));
        setDomains(normalized.domains);
        setLanguages(normalized.languages);
        setAvailable(normalized.available);
      }
      if (operation === 'calibrate') setAck(false);
      setConfirm(null);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error && failure.message === 'INVALID_INPUT'
          ? t(
              'Check the single-line qualification and the keyword, domain and language limits before submitting.',
              'تحقق من المؤهل المكتوب في سطر واحد وحدود الكلمات والمجالات واللغات قبل الإرسال.',
            )
          : t(
              'The profile was not confirmed. Keep your input and refresh the current record before retrying.',
              'لم يُؤكد الملف. احتفظ بالمدخلات وحدّث السجل الحالي قبل إعادة المحاولة.',
            ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {exitGuard}
      <section
        className="on-page rp-profile"
        data-template="reviewer-profile"
        data-locale={locale}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="on-task-header">
          <h1 dir="auto">
            {t('Independent reviewer profile', 'ملف المقيّم المستقل')}
          </h1>
          <p dir="auto">
            {t(
              'Describe your computing expertise and availability. Platform approval and rubric acknowledgment are required before allocation; they do not grant access to any project.',
              'صف خبرتك الحاسوبية وتوافرك. يلزم اعتماد المنصة والإقرار بدليل التقييم قبل الإسناد؛ ولا يمنحان وصولًا إلى أي مشروع.',
            )}
          </p>
          <Button asChild variant="outline">
            <Link href={backHref}>
              {t('Back to account', 'العودة إلى الحساب')}
            </Link>
          </Button>
        </div>
        <p dir="auto" role="status">
          {t('Current status', 'الحالة الحالية')}:{' '}
          {profile
            ? t(
                {
                  pending: 'Pending review',
                  approved: 'Approved',
                  suspended: 'Suspended',
                }[profile.status],
                {
                  pending: 'بانتظار المراجعة',
                  approved: 'معتمد',
                  suspended: 'موقوف',
                }[profile.status],
              )
            : t('Not submitted', 'لم يُرسل')}
        </p>
        {profile?.reason && <p dir="auto">{profile.reason}</p>}
        <Field>
          <FieldLabel htmlFor="reviewer-qualification">
            {t('Academic qualification', 'المؤهل الأكاديمي')}
          </FieldLabel>
          <Textarea
            id="reviewer-qualification"
            maxLength={4000}
            dir="auto"
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
            disabled={busy}
          />
          <p dir="auto">
            {t(
              '50–2,000 characters. Keep this plain text on one line.',
              'من 50 إلى 2000 حرف. استخدم نصًا عاديًا في سطر واحد.',
            )}
          </p>
        </Field>
        <fieldset>
          <legend dir="auto">
            {t('Computing domains', 'المجالات الحاسوبية')}
          </legend>
          {(['software', 'data', 'hardware'] as const).map((d, i) => (
            <Label key={d}>
              <input
                type="checkbox"
                checked={domains.includes(d)}
                onChange={() => toggle(domains, d, setDomains)}
                disabled={busy}
              />
              {t(
                [
                  'Software systems',
                  'Data and information',
                  'Computing hardware',
                ][i]!,
                ['أنظمة البرمجيات', 'البيانات والمعلومات', 'عتاد الحوسبة'][i]!,
              )}
            </Label>
          ))}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="reviewer-tags">
            {t('Expertise keywords', 'كلمات الخبرة')}
          </FieldLabel>
          <Input
            id="reviewer-tags"
            value={tags}
            dir="auto"
            onChange={(e) => setTags(e.target.value)}
            disabled={busy}
          />
          <p dir="auto">
            {t(
              'Separate up to 20 keywords with commas.',
              'افصل حتى 20 كلمة بفواصل.',
            )}
          </p>
        </Field>
        <fieldset>
          <legend dir="auto">{t('Reading languages', 'لغات القراءة')}</legend>
          {(['en', 'ar'] as const).map((l) => (
            <Label key={l}>
              <input
                type="checkbox"
                checked={languages.includes(l)}
                onChange={() => toggle(languages, l, setLanguages)}
                disabled={busy}
              />
              {l === 'en' ? t('English', 'الإنجليزية') : t('Arabic', 'العربية')}
            </Label>
          ))}
        </fieldset>
        <Label>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
            disabled={busy}
          />
          {t('Available for independent review', 'متاح للتقييم المستقل')}
        </Label>
        <Button
          disabled={
            busy ||
            qualification.trim().length < 50 ||
            !domains.length ||
            !languages.length
          }
          onClick={() => setConfirm('save')}
        >
          {t('Review profile', 'مراجعة الملف')}
        </Button>
        {profile?.status === 'approved' && (
          <section>
            <h2 dir="auto">
              {t('Independent assessment rubric', 'دليل التقييم المستقل')}
            </h2>
            <p dir="auto">
              {t(
                'Four criteria: method, contribution, validation, and impact. Each offers five values, 0–4. Your assessment is independent and private; disclose conflicts before accepting an offer.',
                'أربعة معايير: المنهج والمساهمة والتحقق والأثر. يتيح كل معيار خمس قيم من 0 إلى 4. تقييمك مستقل وخاص؛ أفصح عن التعارضات قبل قبول العرض.',
              )}
            </p>
            <details>
              <summary>
                {t('Read full scoring guidance', 'قراءة دليل الدرجات الكامل')}
              </summary>
              {externalRubric.criteria.map((c) => (
                <section key={c.code}>
                  <h3 dir="auto">
                    {c.label[locale]} · {c.weight}%
                  </h3>
                  <p dir="auto">{c.description[locale]}</p>
                  <ol start={0}>
                    {c.anchors.map((a) => (
                      <li key={a.level}>
                        <strong>{a.level}</strong>: {a[locale]}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </details>
            {profile.calibrationVersion === 'EXTERNAL_V1' ? (
              <p dir="auto">
                {t('Current rubric acknowledged', 'أُقر الدليل الحالي')}
              </p>
            ) : (
              <>
                <Label>
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    disabled={busy}
                  />
                  {t(
                    'I have read the current rubric and independence requirements',
                    'قرأت الدليل الحالي ومتطلبات الاستقلال',
                  )}
                </Label>
                <Button
                  disabled={busy || !ack}
                  onClick={() => setConfirm('calibrate')}
                >
                  {t('Acknowledge rubric', 'الإقرار بالدليل')}
                </Button>
              </>
            )}
          </section>
        )}
        {error && (
          <p dir="auto" role="alert">
            {error}
          </p>
        )}
        <DecisionConfirmation
          open={!!confirm}
          onOpenChange={(v) => {
            if (!busy && !v) setConfirm(null);
          }}
          title={
            confirm === 'save'
              ? t('Submit reviewer profile?', 'إرسال ملف المقيّم؟')
              : t('Acknowledge current rubric?', 'الإقرار بالدليل الحالي؟')
          }
          description={
            confirm === 'save'
              ? t(
                  'Submit your computing declaration. Material qualification or domain changes require platform approval before new offers; saving does not grant project access.',
                  'أرسل بيان خبرتك الحاسوبية. تتطلب التغييرات الجوهرية في المؤهل أو المجال اعتماد المنصة قبل العروض الجديدة؛ ولا يمنح الحفظ وصولًا إلى المشاريع.',
                )
              : t(
                  'Record that you have read the current assessment rubric. This does not assign a review or open project files.',
                  'سجّل أنك قرأت دليل التقييم الحالي. لا يسند هذا تقييمًا ولا يفتح ملفات المشاريع.',
                )
          }
        >
          <Button
            pending={busy}
            variant="outline"
            disabled={busy}
            onClick={() => setConfirm(null)}
          >
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button
            pending={busy}
            disabled={busy}
            onClick={() => confirm && void send(confirm)}
          >
            {confirm === 'save'
              ? t('Submit profile', 'إرسال الملف')
              : t('Confirm acknowledgment', 'تأكيد الإقرار')}
          </Button>
        </DecisionConfirmation>
      </section>
    </>
  );
}
