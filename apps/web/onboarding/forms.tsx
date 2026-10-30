'use client';
import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, usePathname } from 'next/navigation';
import {
  universityIdentitySchema,
  administratorInvitationSchema,
  personInvitationSchema,
  canonicalDepartments,
  type DepartmentOption,
  type OnboardingResult,
} from '@capstone/domain';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogClose,
  X,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  GraduationCap,
  Mail,
  ShieldCheck,
  LoaderCircle,
  ArrowLeft,
} from '@capstone/ui/workspace-v2';
import { useMemoryDraft } from '../account-entry/drafts';
import { ResultAlert } from '../account-entry/fields';
import { TaskHeader, tr, roleName, type Locale } from './common';
import { useAssessmentExit } from '../assessment-studio/exit-guard';
export function DepartmentPreview({ locale }: { locale: Locale }) {
  return (
    <div className="on-departments">
      {canonicalDepartments.map((d) => (
        <div key={d.code}>
          <span className="on-department-icon">
            <GraduationCap />
          </span>
          <div>
            <bdi dir="ltr">{d.code}</bdi>
            <strong>{locale === 'ar' ? d.nameAr : d.name}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
export function InvitationForm({
  locale,
  mode,
  parent,
  institution,
  departments = [],
  initialRole = 'faculty_supervisor',
}: {
  locale: Locale;
  mode: 'university' | 'administrator' | 'person';
  parent: string;
  institution?: { id: string; name: string; nameAr: string };
  departments?: DepartmentOption[];
  initialRole?: string;
}) {
  const router = useRouter(),
    path = usePathname(),
    draft = useMemoryDraft(mode + path.replace(/^\/(en|ar)/, '')),
    t = (e: string, a: string) => tr(locale, e, a),
    uni = mode === 'university',
    admin = mode === 'administrator';
  const defaults = uni
    ? { code: '', name_en: '', name_ar: '' }
    : {
        name: '',
        email: '',
        ...(!admin ? { role: initialRole, department: '' } : {}),
      };
  const form = useForm<Record<string, string>>({
      defaultValues: {
        ...defaults,
        ...Object.fromEntries(
          Object.entries(draft.values).filter(([k]) => !k.startsWith('_')),
        ),
      },
    }),
    v = form.watch(),
    [review, setReview] = useState(false),
    [leave, setLeave] = useState(''),
    [notice, setNotice] = useState(draft.status === 'unknown' ? 'unknown' : ''),
    [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    reviewButton = useRef<HTMLButtonElement>(null),
    backButton = useRef<HTMLButtonElement>(null),
    checkButton = useRef<HTMLButtonElement>(null);
  const dirty = Object.entries(defaults).some(([k, s]) => (v[k] ?? '') !== s),
    schema = uni
      ? universityIdentitySchema
      : admin
        ? administratorInvitationSchema
        : personInvitationSchema;
  const exitGuard = useAssessmentExit(
    dirty || notice === 'unknown',
    locale,
    () => {
      draft.values = {};
      draft.status = 'ready';
    },
    { preserveLocaleSwitch: true },
  );
  useEffect(() => {
    const sub = form.watch((values) => {
      for (const [k, s] of Object.entries(values))
        if (typeof s === 'string') draft.values[k] = s;
    });
    return () => sub.unsubscribe();
  }, [form, draft]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty || notice === 'unknown') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, notice]);
  const institutionName =
    locale === 'ar' ? institution?.nameAr : institution?.name;
  const title = uni
    ? t('Add university', 'إضافة جامعة')
    : admin
      ? t('Invite university administrator', 'دعوة مدير الجامعة')
      : t('Invite a person', 'دعوة شخص');
  function goBack() {
    if (dirty || notice === 'unknown') setLeave(parent);
    else router.push(parent);
  }
  function payload() {
    return uni
      ? {
          code: v['code'] ?? '',
          name_en: v['name_en'] ?? '',
          name_ar: v['name_ar'] ?? '',
        }
      : admin
        ? {
            name: v['name'] ?? '',
            email: v['email'] ?? '',
            university: institution!.id,
            locale,
          }
        : {
            name: v['name'] ?? '',
            email: v['email'] ?? '',
            role: v['role'],
            department: v['department'],
            locale,
          };
  }
  function validate() {
    form.clearErrors();
    const parsed = schema.safeParse(payload());
    if (!parsed.success) {
      for (const x of parsed.error.issues) {
        const k = String(x.path[0]);
        form.setError(k, {
          message:
            k === 'code'
              ? t(
                  'Use 2–32 uppercase letters, numbers or underscores; start with a letter.',
                  'استخدم ٢–٣٢ حرفًا لاتينيًا كبيرًا أو رقمًا أو شرطة سفلية، وابدأ بحرف.',
                )
              : k === 'email'
                ? t(
                    'Enter a valid email address.',
                    'أدخل عنوان بريد إلكتروني صالحًا.',
                  )
                : t(
                    'Check this required field and its permitted length.',
                    'تحقق من الحقل المطلوب وطوله المسموح.',
                  ),
        });
      }
      const firstError = String(parsed.error.issues[0]?.path[0]);
      if (['department', 'role'].includes(firstError))
        document.getElementById('on-' + firstError)?.focus();
      else form.setFocus(firstError);
      setNotice('validation');
      return;
    }
    draft.values['_payload'] = JSON.stringify(parsed.data);
    draft.values['_command'] = crypto.randomUUID();
    setNotice('');
    setReview(true);
  }
  function destination(result: OnboardingResult) {
    const receipt = draft.values['_command'];
    draft.status = 'ready';
    draft.values = {};
    const p = uni
      ? `/${locale}/admin/platform/${result.id}`
      : admin
        ? `/${locale}/admin/platform/${result.university}/administrators/${result.id}/account-access`
        : `/${locale}/admin/university/people/${result.id}`;
    router.push(p + (receipt ? '?receipt=' + encodeURIComponent(receipt) : ''));
  }
  async function reconcile() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch(
        '/api/onboarding?command=' + draft.values['_command'],
        { cache: 'no-store' },
      );
      if (!r.ok) throw Error('Read unavailable');
      const b = (await r.json()) as { receipt: OnboardingResult | null };
      if (b.receipt) destination(b.receipt);
      else setNotice('not-recorded');
    } catch {
      setNotice('unknown');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function commit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: draft.values['_command'],
          operation: uni
            ? 'university.create'
            : admin
              ? 'administrator.invite'
              : 'person.invite',
          payload: JSON.parse(draft.values['_payload'] ?? '{}'),
        }),
      });
      if (r.status >= 500) throw Error('Unknown');
      const b = await r.json();
      if (!r.ok) {
        setReview(false);
        draft.status = 'ready';
        if (b.code === 'DUPLICATE_CODE' && uni) {
          form.setError('code', {
            message: t(
              'This university code is already in use. Choose a different code.',
              'رمز الجامعة مستخدم بالفعل. اختر رمزًا آخر.',
            ),
          });
          form.setFocus('code');
          setNotice('duplicate');
        } else setNotice(r.status === 409 ? 'conflict' : 'failed');
        return;
      }
      setReview(false);
      destination(b as OnboardingResult);
    } catch {
      setReview(false);
      draft.status = 'unknown';
      setNotice('unknown');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const locked = busy || draft.status === 'unknown';
  function field(k: string, label: string, help?: string, dir?: 'ltr' | 'rtl') {
    const error = form.formState.errors[k]?.message;
    return (
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={'on-' + k}>{label}</FieldLabel>
        <Input
          id={'on-' + k}
          type={k === 'email' ? 'email' : 'text'}
          {...form.register(k)}
          dir={dir ?? 'auto'}
          maxLength={k === 'email' ? 254 : k === 'code' ? 32 : uni ? 240 : 400}
          autoComplete={k === 'email' ? 'email' : k === 'name' ? 'name' : 'off'}
          disabled={locked}
          aria-invalid={!!error}
          aria-describedby={
            [help ? 'on-' + k + '-help' : '', error ? 'on-' + k + '-error' : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        {help && (
          <FieldDescription id={'on-' + k + '-help'}>{help}</FieldDescription>
        )}
        {error && <FieldError id={'on-' + k + '-error'}>{error}</FieldError>}
      </Field>
    );
  }
  return (
    <section
      className="on-page"
      data-locale={locale}
      data-dialog-open={review || !!leave}
    >
      <button
        ref={backButton}
        className="as-back on-back-button"
        onClick={goBack}
      >
        <ArrowLeft />
        {uni
          ? t('Back to universities', 'العودة إلى الجامعات')
          : admin
            ? t('Back to university', 'العودة إلى الجامعة')
            : t('Back to People', 'العودة إلى الأشخاص')}
      </button>
      <TaskHeader
        locale={locale}
        title={title}
        description={
          uni
            ? t(
                'Set up the institution before inviting its administrator.',
                'أعدّ المؤسسة قبل دعوة مديرها.',
              )
            : (institutionName ??
              t(
                'Choose the academic role and department for this invitation.',
                'اختر الدور الأكاديمي والقسم لهذه الدعوة.',
              ))
        }
      />
      {notice && (
        <ResultAlert
          kind={
            ['unknown', 'not-recorded'].includes(notice) ? 'pending' : 'error'
          }
          title={
            notice === 'unknown'
              ? t('The result needs checking', 'تحتاج النتيجة إلى التحقق')
              : notice === 'not-recorded'
                ? t(
                    'No committed result was found',
                    'لم تُعثر على نتيجة محفوظة',
                  )
                : notice === 'conflict'
                  ? t(
                      'This invitation cannot be applied',
                      'لا يمكن تطبيق هذه الدعوة',
                    )
                  : t('Check the form', 'تحقق من النموذج')
          }
        >
          <p dir="auto">
            {notice === 'unknown'
              ? t(
                  'Check the original request before trying again. The current details are kept unchanged.',
                  'تحقق من الطلب الأصلي قبل المحاولة مجددًا. تبقى التفاصيل الحالية دون تغيير.',
                )
              : notice === 'not-recorded'
                ? t(
                    'Retry the original request with the same details.',
                    'أعد محاولة الطلب الأصلي بالتفاصيل نفسها.',
                  )
                : notice === 'conflict'
                  ? t(
                      'The address may already belong to an incompatible or suspended account, or the record has changed. No identity was moved or elevated.',
                      'قد يكون العنوان مرتبطًا بحساب غير متوافق أو موقوف، أو تغيّر السجل. لم يُنقل حساب أو تُرفع صلاحياته.',
                    )
                  : notice === 'duplicate'
                    ? t(
                        'Choose a unique institution code.',
                        'اختر رمزًا فريدًا للمؤسسة.',
                      )
                    : t(
                        'Correct the highlighted fields, or reload to check current availability.',
                        'صحح الحقول المحددة أو أعد التحميل للتحقق من التوافر.',
                      )}
          </p>
          {draft.status === 'unknown' && (
            <div className="on-actions">
              <Button
                pending={busy}
                disabled={busy}
                ref={checkButton}
                onClick={() => void reconcile()}
              >
                {t('Check original request', 'التحقق من الطلب الأصلي')}
              </Button>
              {notice === 'not-recorded' && (
                <Button
                  pending={busy}
                  variant="outline"
                  disabled={busy}
                  onClick={() => void commit()}
                >
                  {t('Retry original request', 'إعادة محاولة الطلب الأصلي')}
                </Button>
              )}
            </div>
          )}
        </ResultAlert>
      )}
      <div className="on-task-grid">
        <Card>
          <CardHeader>
            <CardTitle>
              {uni
                ? t('University identity', 'هوية الجامعة')
                : t('Person to invite', 'الشخص المدعو')}
            </CardTitle>
            <CardDescription>
              {admin
                ? t('University administrator · ', 'مدير الجامعة · ') +
                  (institutionName ?? '')
                : uni
                  ? t(
                      'Both names appear throughout the bilingual repository.',
                      'يظهر الاسمان في المستودع ثنائي اللغة.',
                    )
                  : t(
                      'No password or project assignment is needed here.',
                      'لا تحتاج هنا إلى كلمة مرور أو إسناد مشروع.',
                    )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(validate)} noValidate>
              <FieldGroup>
                {uni ? (
                  <>
                    {field(
                      'code',
                      t('Institution code', 'رمز المؤسسة'),
                      t(
                        '2–32 uppercase letters, numbers or underscores. Start with a letter.',
                        '٢–٣٢ حرفًا لاتينيًا كبيرًا أو رقمًا أو شرطة سفلية. ابدأ بحرف.',
                      ),
                      'ltr',
                    )}
                    {field(
                      'name_en',
                      t('English name', 'الاسم بالإنجليزية'),
                      t('Up to 120 characters.', 'حتى ١٢٠ حرفًا.'),
                      'ltr',
                    )}
                    {field(
                      'name_ar',
                      t('Arabic name', 'الاسم بالعربية'),
                      undefined,
                      'rtl',
                    )}
                  </>
                ) : (
                  <>
                    {field('name', t('Full name', 'الاسم الكامل'))}
                    {field(
                      'email',
                      t('Email address', 'عنوان البريد الإلكتروني'),
                      t(
                        'Use the person’s individual account address.',
                        'استخدم عنوان الحساب الفردي للشخص.',
                      ),
                      'ltr',
                    )}
                    {!admin && (
                      <>
                        <Field>
                          <FieldLabel htmlFor="on-role">
                            {t('Academic role', 'الدور الأكاديمي')}
                          </FieldLabel>
                          <Select
                            value={v['role'] ?? ''}
                            disabled={locked}
                            onValueChange={(s) =>
                              form.setValue('role', s, { shouldDirty: true })
                            }
                          >
                            <SelectTrigger id="on-role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="wsv2">
                              <SelectItem value="faculty_supervisor">
                                {roleName(locale, 'faculty_supervisor')}
                              </SelectItem>
                              <SelectItem value="student">
                                {roleName(locale, 'student')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field
                          data-invalid={!!form.formState.errors['department']}
                        >
                          <FieldLabel htmlFor="on-department">
                            {t('Department', 'القسم')}
                          </FieldLabel>
                          <Select
                            value={v['department'] ?? ''}
                            disabled={locked}
                            onValueChange={(s) => {
                              form.setValue('department', s, {
                                shouldDirty: true,
                              });
                              form.clearErrors('department');
                            }}
                          >
                            <SelectTrigger
                              id="on-department"
                              aria-invalid={
                                !!form.formState.errors['department']
                              }
                              aria-describedby={
                                form.formState.errors['department']
                                  ? 'on-department-help on-department-error'
                                  : 'on-department-help'
                              }
                            >
                              <SelectValue
                                placeholder={t(
                                  'Choose a department',
                                  'اختر القسم',
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent className="wsv2">
                              {departments.map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  <bdi dir="ltr">{d.code}</bdi>:{' '}
                                  {locale === 'ar' ? d.nameAr : d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldDescription id="on-department-help">
                            {t(
                              'These are your university’s fixed academic options.',
                              'هذه هي الخيارات الأكاديمية الثابتة لجامعتك.',
                            )}
                          </FieldDescription>
                          {form.formState.errors['department'] && (
                            <FieldError id="on-department-error">
                              {form.formState.errors['department'].message}
                            </FieldError>
                          )}
                        </Field>
                      </>
                    )}
                  </>
                )}
              </FieldGroup>
              <div className="on-form-actions">
                <Button
                  disabled={
                    locked || (!uni && !admin && departments.length !== 3)
                  }
                  type="submit"
                  ref={reviewButton}
                >
                  {busy && <LoaderCircle className="animate-spin" />}
                  {uni
                    ? t('Review university', 'مراجعة الجامعة')
                    : t('Review invitation', 'مراجعة الدعوة')}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy}
                  onClick={goBack}
                  pending={busy}
                >
                  {t('Cancel', 'إلغاء')}
                </Button>
              </div>
              {!uni && !admin && departments.length !== 3 && (
                <p dir="auto" role="alert">
                  {t(
                    'The university departments are unavailable. Reload before inviting.',
                    'أقسام الجامعة غير متاحة. أعد التحميل قبل الدعوة.',
                  )}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <Card className="on-context-card">
          <CardHeader>
            <CardTitle>
              {uni
                ? t('Departments · automatic', 'الأقسام · تلقائيًا')
                : t('What happens next', 'ما الخطوة التالية')}
            </CardTitle>
            <CardDescription>
              {uni
                ? t(
                    'All three departments appear when the university is created.',
                    'تظهر الأقسام الثلاثة عند إنشاء الجامعة.',
                  )
                : t(
                    'One account, one institution, a clear next step.',
                    'حساب واحد ومؤسسة واحدة وخطوة تالية واضحة.',
                  )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uni ? (
              <DepartmentPreview locale={locale} />
            ) : (
              <ol className="on-next-steps">
                <li>
                  <Mail />
                  <div>
                    <strong>{t('Account setup', 'إعداد الحساب')}</strong>
                    <p dir="auto">
                      {t(
                        'A new person receives a one-use setup link and chooses their own password.',
                        'يتلقى الشخص الجديد رابط إعداد لمرة واحدة ويختار كلمة مروره.',
                      )}
                    </p>
                  </div>
                </li>
                <li>
                  <ShieldCheck />
                  <div>
                    <strong>
                      {t(
                        'Existing account stays intact',
                        'يبقى الحساب الحالي سليمًا',
                      )}
                    </strong>
                    <p dir="auto">
                      {t(
                        'A compatible account is reused without changing its identity or password. Pending invitations can be managed from Account access.',
                        'يُستخدم الحساب المتوافق دون تغيير هويته أو كلمة مروره. تُدار الدعوات المعلقة من وصول الحساب.',
                      )}
                    </p>
                  </div>
                </li>
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={review}
        onOpenChange={(o) => {
          if (!busy) setReview(o);
        }}
      >
        <DialogContent
          className="wsv2 on-confirm"
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (reviewButton.current?.disabled) checkButton.current?.focus();
            else reviewButton.current?.focus();
          }}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          <DialogHeader>
            <DialogTitle>
              {uni
                ? t('Review university', 'مراجعة الجامعة')
                : t('Review invitation', 'مراجعة الدعوة')}
            </DialogTitle>
            <DialogDescription>
              {uni
                ? t(
                    'Create this institution with three fixed departments.',
                    'أنشئ هذه المؤسسة بثلاثة أقسام ثابتة.',
                  )
                : t(
                    'Confirm the person, university and intended role. No password will be shown.',
                    'أكد الشخص والجامعة والدور المقصود. لن تُعرض كلمة مرور.',
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="on-confirm-summary">
            {uni ? (
              <>
                <bdi dir="ltr">{v['code']}</bdi>
                <strong dir="ltr">{v['name_en']}</strong>
                <strong dir="rtl">{v['name_ar']}</strong>
                <DepartmentPreview locale={locale} />
              </>
            ) : (
              <>
                <strong dir="auto">{v['name']}</strong>
                <bdi dir="ltr">{v['email']}</bdi>
                <span>{institutionName}</span>
                <span>
                  {roleName(
                    locale,
                    admin ? 'university_admin' : (v['role'] ?? ''),
                  )}{' '}
                  {!admin && (
                    <>
                      {' '}
                      ·{' '}
                      <bdi dir="ltr">
                        {
                          departments.find((d) => d.id === v['department'])
                            ?.code
                        }
                      </bdi>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              pending={busy}
              disabled={busy}
              onClick={() => void commit()}
            >
              {busy
                ? t('Saving…', 'جارٍ الحفظ…')
                : uni
                  ? t('Create university', 'إنشاء الجامعة')
                  : admin
                    ? t('Invite administrator', 'دعوة المدير')
                    : t('Invite person', 'دعوة الشخص')}
            </Button>
            <Button
              pending={busy}
              disabled={busy}
              variant="outline"
              onClick={() => setReview(false)}
            >
              {t('Back to form', 'العودة إلى النموذج')}
            </Button>
          </DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={busy}
              variant="ghost"
              className="on-dialog-close"
              aria-label={t('Close confirmation', 'إغلاق التأكيد')}
              pending={busy}
            >
              <X />
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!leave}
        onOpenChange={(o) => {
          if (!o) setLeave('');
        }}
      >
        <DialogContent
          className="wsv2 on-confirm"
          showCloseButton={false}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            backButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('Keep your changes?', 'الاحتفاظ بتغييراتك؟')}
            </DialogTitle>
            <DialogDescription>
              {notice === 'unknown'
                ? t(
                    'Check the original request before leaving to avoid losing its recovery context.',
                    'تحقق من الطلب الأصلي قبل المغادرة حتى لا تفقد سياق الاستعادة.',
                  )
                : uni
                  ? t(
                      'This university has not been created. Leaving discards the unsaved form.',
                      'لم تُنشأ الجامعة. تؤدي المغادرة إلى تجاهل النموذج غير المحفوظ.',
                    )
                  : t(
                      'Your invitation has not been sent. Leaving discards this unsent form.',
                      'لم تُرسل الدعوة. تؤدي المغادرة إلى تجاهل النموذج غير المرسل.',
                    )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLeave('')}>
              {t('Keep editing', 'متابعة التحرير')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                draft.values = {};
                draft.status = 'ready';
                router.push(leave);
              }}
            >
              {t('Discard and leave', 'تجاهل ومغادرة')}
            </Button>
          </DialogFooter>
          <DialogClose asChild>
            <Button
              disabled={busy}
              variant="ghost"
              className="on-dialog-close"
              aria-label={t('Close confirmation', 'إغلاق التأكيد')}
              pending={busy}
            >
              <X />
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      {exitGuard}
    </section>
  );
}
