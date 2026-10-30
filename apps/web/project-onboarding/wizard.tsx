'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  workspaceHistoryEvent,
  type WorkspaceHistoryIntent,
} from '../assessment-studio/history-guard';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  useForm,
  useFieldArray,
  Controller,
  type FieldPath,
} from 'react-hook-form';
import { z } from 'zod';
import {
  projectCreationSchema,
  projectTeamSchema,
  projectPersonSchema,
  projectYearSchema,
  canonicalDepartments,
  type ProjectCreation,
  type DepartmentOption,
  type ResolvedProjectPerson,
  type GuidedProjectRecord,
} from '@capstone/domain';
import {
  Button,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  RadioGroup,
  RadioGroupItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Badge,
} from '@capstone/ui/workspace-v2';
import { useMemoryDraft } from '../account-entry/drafts';
import { ResultAlert } from '../account-entry/fields';
import { FacultyPicker } from './faculty-picker';
import {
  ProjectCard,
  IdentityState,
  projectError,
  t,
  type Locale,
} from './common';
type Values = ProjectCreation & { reason: string };
type Preview = {
  supervisor: ResolvedProjectPerson;
  students: ResolvedProjectPerson[];
};
interface Receipt {
  id: string;
  operation: string;
  revision: number;
}
const blankStudent = () => ({ name: '', email: '', lead: false });
function fromRecord(record: GuidedProjectRecord, locale: Locale): Values {
  return {
    title: record.title,
    department: record.departmentId,
    year: record.year,
    locale,
    supervisor: {
      name: record.supervisor.name,
      email: record.supervisor.email!,
      existingId: record.supervisor.id,
    },
    students: record.authors.map((x) => ({
      name: x.name,
      email: x.email!,
      lead: !!x.lead,
      existingId: x.id,
    })),
    reason: '',
  };
}
async function api(operation: string, payload: unknown, command?: string) {
  const response = await fetch('/api/project-onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation,
      payload,
      ...(command ? { command } : {}),
    }),
  });
  const value = (await response.json()) as Preview &
    ResolvedProjectPerson &
    Receipt & { code?: string; knownRejected?: boolean; fields?: string[] };
  return { ok: response.ok, value };
}
export function ProjectWizard({
  locale,
  actorKey,
  institution,
  departments,
  parent,
  record,
  lockedCommand,
  onDone,
  onCancel,
}: {
  locale: Locale;
  actorKey: string;
  institution: string;
  departments: DepartmentOption[];
  parent: string;
  record?: GuidedProjectRecord;
  lockedCommand?: string | undefined;
  onDone?: (receipt: Receipt) => void;
  onCancel?: () => void;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    search = useSearchParams().toString(),
    draft = useMemoryDraft(actorKey + ':' + pathname.replace(/^\/(en|ar)/, '')),
    seed: Values = record
      ? fromRecord(record, locale)
      : {
          title: '',
          department: '',
          year: '',
          locale,
          supervisor: { name: '', email: '' },
          students: [blankStudent()],
          reason: '',
        };
  type Stored = {
    values: Values;
    step: number;
    mode: string;
    returnToReview?: boolean;
  };
  let stored: Stored | null = null;
  try {
    stored = JSON.parse(draft.values['wizard'] ?? 'null') as Stored | null;
  } catch {}
  const form = useForm<Values>({ defaultValues: stored?.values ?? seed }),
    { fields, append, remove, move } = useFieldArray({
      control: form.control,
      name: 'students',
    }),
    values = form.watch();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [returnToReview, setReturnToReview] = useState(
      stored?.returnToReview ?? false,
    ),
    [removing, setRemoving] = useState<string | null>(null),
    [announcement, setAnnouncement] = useState('');
  const [step, setStep] = useState(stored?.step ?? (record ? 2 : 1)),
    [mode, setMode] = useState(
      stored?.mode ?? (record ? 'existing' : 'existing'),
    ),
    [preview, setPreview] = useState<Preview | null>(() => {
      try {
        return JSON.parse(draft.values['preview'] ?? 'null') as Preview | null;
      } catch {
        return null;
      }
    }),
    [identities, setIdentities] = useState<
      Record<string, ResolvedProjectPerson>
    >(() => {
      const restored: Record<string, ResolvedProjectPerson> = {};
      if (
        preview?.supervisor.email === values.supervisor.email &&
        preview.supervisor.name === values.supervisor.name
      )
        restored.supervisor = preview.supervisor;
      preview?.students.forEach((p, i) => {
        if (
          p.email === values.students[i]?.email &&
          p.name === values.students[i]?.name
        )
          restored['student-' + i] = p;
      });
      return restored;
    }),
    [error, setError] = useState(''),
    [state, setState] = useState(
      lockedCommand
        ? 'unknown'
        : draft.status === 'pending' || draft.status === 'unknown'
          ? draft.status
          : 'editing',
    ),
    [checking, setChecking] = useState(false),
    [leave, setLeave] = useState<string | null>(null);
  const cid = useRef(lockedCommand ?? draft.values['command'] ?? ''),
    frozen = useRef(draft.values['payload'] ?? ''),
    busy = useRef(false),
    done = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    leaveTrigger = useRef<HTMLElement | null>(null),
    leaveCommit = useRef<(() => void | Promise<void>) | null>(null),
    baseline = useRef(draft.values['baseline'] ?? JSON.stringify(seed));
  const expectedRevision = useRef(
    Number(draft.values['revision'] ?? record?.revision ?? 0),
  );
  if (record) draft.values['revision'] = String(expectedRevision.current);
  const nonLocale = (v: Values) => JSON.stringify({ ...v, locale: 'en' }),
    dirty =
      nonLocale(values) !== nonLocale(JSON.parse(baseline.current) as Values),
    pending = state === 'pending' || state === 'unknown',
    disabled = pending || checking;
  const copy = (en: string, ar: string) => t(locale, en, ar);
  const Heading = record ? 'h2' : 'h1';
  const labels = [
    copy('Project details', 'تفاصيل المشروع'),
    copy('Supervisor', 'المشرف'),
    copy('Students & lead', 'الطلاب والقائد'),
    copy('Review', 'المراجعة'),
  ];
  useEffect(() => {
    draft.values['baseline'] = baseline.current;
    draft.values['wizard'] = JSON.stringify({
      values,
      step,
      mode,
      returnToReview,
    });
    draft.status = state;
    draft.values['preview'] = JSON.stringify(preview);
  }, [values, step, mode, state, draft, preview, returnToReview]);
  useEffect(() => {
    if (!pending) form.setValue('locale', locale);
  }, [locale, form, pending]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    const media = window.matchMedia('(min-width:1024px)');
    const update = () => setSummaryOpen(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || pending) e.preventDefault();
    };
    const links = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest('a');
      if (
        !anchor ||
        (!dirty && !pending) ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        anchor.target === '_blank'
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname.replace(/^\/(en|ar)/, '') ===
          pathname.replace(/^\/(en|ar)/, '')
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      leaveTrigger.current = document.activeElement as HTMLElement | null;
      leaveCommit.current = null;
      setLeave(url.pathname + url.search);
    };
    const intent = (e: Event) => {
      if (!dirty && !pending) return;
      const event = e as CustomEvent<{
        destination: string;
        commit: () => void | Promise<void>;
      }>;
      const url = new URL(event.detail.destination, window.location.origin);
      if (
        url.pathname.replace(/^\/(en|ar)/, '') ===
        pathname.replace(/^\/(en|ar)/, '')
      )
        return;
      event.preventDefault();
      leaveTrigger.current = document.activeElement as HTMLElement | null;
      leaveCommit.current = event.detail.commit;
      setLeave(url.pathname + url.search);
    };
    const origin = pathname + (search ? '?' + search : '') + location.hash;
    const back = (e: Event) => {
      if (!dirty && !pending) return;
      const intent = e as CustomEvent<WorkspaceHistoryIntent>;
      const destination = intent.detail.destination;
      if (destination === origin) return;
      intent.preventDefault();
      leaveTrigger.current = document.activeElement as HTMLElement | null;
      leaveCommit.current = intent.detail.resume;
      setLeave(destination);
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('workspace-navigation-intent', intent);
    window.addEventListener(workspaceHistoryEvent, back);
    document.addEventListener('click', links, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('workspace-navigation-intent', intent);
      window.removeEventListener(workspaceHistoryEvent, back);
      document.removeEventListener('click', links, true);
    };
  }, [dirty, pending, pathname, search]);
  function cancelCorrection() {
    draft.values = {};
    draft.status = 'ready';
    onCancel?.();
  }
  function navigateAway() {
    if (pending) return;
    draft.values = {};
    draft.status = 'ready';
    if (leave === 'close' && onCancel) onCancel();
    else if (leaveCommit.current) {
      const commit = leaveCommit.current;
      leaveCommit.current = null;
      void commit();
    } else router.push(leave ?? parent);
  }
  function focusIssue(path: string) {
    const destination =
      path.startsWith('students') || path === 'reason'
        ? 3
        : path.startsWith('supervisor.')
          ? 2
          : 1;
    if (step !== destination) {
      setStep(destination);
      requestAnimationFrame(() => focusIssueElement(path));
      return;
    }
    focusIssueElement(path);
  }
  function focusIssueElement(path: string) {
    if (path.startsWith('supervisor.') && mode === 'existing') {
      document.getElementById('po-faculty-picker')?.focus();
      return;
    }
    if (path === 'students') {
      (
        document.getElementById('po-lead-0') ??
        document.getElementById('po-add-student')
      )?.focus();
      return;
    }
    try {
      form.setFocus(path as FieldPath<Values>);
    } catch {
      document
        .getElementById(path === 'department' ? 'po-department' : path)
        ?.focus();
    }
  }
  function issues(list: { path: PropertyKey[]; message: string }[]) {
    form.clearErrors();
    for (const x of list)
      form.setError(x.path.join('.') as FieldPath<Values>, {
        type: 'validate',
        message: copy(
          x.message === 'DUPLICATE_PERSON'
            ? 'Use a unique email distinct from the supervisor.'
            : x.message === 'ONE_LEAD_REQUIRED'
              ? 'Choose exactly one project lead.'
              : 'Check this required field and its permitted format.',
          x.message === 'DUPLICATE_PERSON'
            ? 'استخدم بريدًا فريدًا يختلف عن بريد المشرف.'
            : x.message === 'ONE_LEAD_REQUIRED'
              ? 'اختر قائدًا واحدًا للمشروع.'
              : 'تحقق من الحقل المطلوب وصيغته المسموحة.',
        ),
      });
    setError('INVALID_INPUT');
    focusIssue(list[0]?.path.join('.') ?? 'title');
  }
  function person(i?: number) {
    const v =
      i === undefined
        ? form.getValues('supervisor')
        : form.getValues(`students.${i}`);
    return {
      name: v.name,
      email: v.email,
      ...(v.existingId ? { existingId: v.existingId } : {}),
    };
  }
  function commandPayload() {
    const v = form.getValues();
    return record
      ? {
          project: record.id,
          revision: expectedRevision.current,
          reason: v.reason.trim(),
          supervisor: person(),
          students: v.students.map((x, i) => ({ ...person(i), lead: x.lead })),
          locale: v.locale,
        }
      : {
          title: v.title,
          department: v.department,
          year: v.year,
          supervisor: person(),
          students: v.students.map((x, i) => ({ ...person(i), lead: x.lead })),
          locale: v.locale,
        };
  }
  async function advance() {
    if (busy.current || disabled) return;
    form.clearErrors();
    setError('');
    if (step === 1) {
      if (record) {
        setStep(2);
        return;
      }
      const parsed = z
        .object({
          title: projectPersonSchema.shape.name,
          department: z.uuid(),
          year: projectYearSchema,
        })
        .safeParse({
          title: values.title,
          department: values.department,
          year: values.year,
        });
      if (!parsed.success) {
        issues(parsed.error.issues);
        return;
      }
      form.setValue('year', parsed.data.year);
      if (returnToReview) {
        await reviewCurrent();
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const parsed = projectPersonSchema.safeParse(person());
      if (!parsed.success) {
        issues(
          parsed.error.issues.map((x) => ({
            ...x,
            path: ['supervisor', ...x.path],
          })),
        );
        return;
      }
      setChecking(true);
      try {
        const response = await api('resolve', {
          department: values.department,
          role: 'faculty_supervisor',
          person: parsed.data,
        });
        if (!response.ok) {
          form.setError('supervisor.email', {
            type: 'server',
            message: projectError(
              locale,
              response.value.code ?? 'INVALID_INPUT',
            ),
          });
          focusIssue('supervisor.email');
          setError(response.value.code ?? 'UNAVAILABLE');
          return;
        }
        setIdentities((old) => ({ ...old, supervisor: response.value }));
        if (!response.value.nameMatches) {
          setError('VERIFY_NAME');
          return;
        }
        if (record?.locked && response.value.status !== 'active') {
          setError('FROZEN_TEAM');
          return;
        }
        if (response.value.id)
          form.setValue('supervisor.existingId', response.value.id);
        if (returnToReview) {
          await reviewCurrent();
          return;
        }
        setStep(3);
      } catch {
        setError('READ_UNAVAILABLE');
      } finally {
        setChecking(false);
      }
      return;
    }
    await reviewCurrent();
  }
  async function reviewCurrent() {
    const raw = commandPayload(),
      parsed = (record ? projectTeamSchema : projectCreationSchema).safeParse(
        raw,
      );
    if (!parsed.success) {
      issues(parsed.error.issues);
      return;
    }
    setChecking(true);
    try {
      const response = await api(
        record ? 'team.preview' : 'preview',
        parsed.data,
      );
      if (!response.ok) {
        for (const path of response.value.fields ?? [])
          form.setError(path as FieldPath<Values>, {
            type: 'server',
            message: projectError(
              locale,
              response.value.code ?? 'INVALID_INPUT',
            ),
          });
        if (response.value.fields?.[0]) focusIssue(response.value.fields[0]);
        setError(response.value.code ?? 'READ_UNAVAILABLE');
        return;
      }
      const v = response.value as Preview;
      setPreview(v);
      const map: Record<string, ResolvedProjectPerson> = {
        supervisor: v.supervisor,
      };
      v.students.forEach((x, i) => {
        map['student-' + i] = x;
      });
      setIdentities(map);
      if (!v.supervisor.nameMatches || v.students.some((x) => !x.nameMatches)) {
        setError('VERIFY_NAME');
        return;
      }
      v.students.forEach((x, i) => {
        if (x.id) form.setValue(`students.${i}.existingId`, x.id);
      });
      if (v.supervisor.id)
        form.setValue('supervisor.existingId', v.supervisor.id);
      setStep(4);
      setReturnToReview(false);
    } catch {
      setError('READ_UNAVAILABLE');
    } finally {
      setChecking(false);
    }
  }
  function editSection(next: number) {
    setReturnToReview(true);
    setStep(next);
  }
  function removeAuthor(id: string) {
    const index = fields.findIndex((x) => x.id === id);
    if (index < 0) return;
    const wasLead = form.getValues(`students.${index}.lead`);
    remove(index);
    setIdentities({});
    setRemoving(null);
    setAnnouncement(
      wasLead
        ? copy(
            'Lead removed. Choose a project lead.',
            'أُزيل القائد. اختر قائدًا للمشروع.',
          )
        : copy(
            'Student removed. Author order updated.',
            'أُزيل الطالب وحُدث ترتيب المؤلفين.',
          ),
    );
    requestAnimationFrame(() =>
      document
        .getElementById(
          fields.length > 1
            ? 'po-students-' + Math.min(index, fields.length - 2) + '-name'
            : 'po-add-student',
        )
        ?.focus(),
    );
  }
  function updateUrl(command: string) {
    const url = new URL(window.location.href);
    url.searchParams.set(record ? 'teamCommand' : 'command', command);
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  function clearCommand() {
    cid.current = '';
    frozen.current = '';
    delete draft.values['command'];
    delete draft.values['payload'];
    const url = new URL(window.location.href);
    url.searchParams.delete(record ? 'teamCommand' : 'command');
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  function complete(r: Receipt) {
    if (done.current) return;
    if (
      r.operation !== (record ? 'team' : 'create') ||
      (record && r.id !== record.id)
    ) {
      setState('unknown');
      return;
    }
    done.current = true;
    draft.values = {};
    draft.status = 'ready';
    if (record) {
      clearCommand();
      onDone?.(r);
    } else
      router.replace(
        '/' +
          (window.location.pathname.split('/')[1] === 'ar' ? 'ar' : 'en') +
          '/admin/university/projects/created/' +
          cid.current +
          '?from=' +
          encodeURIComponent(parent),
      );
  }
  async function create() {
    if (busy.current || pending || done.current) return;
    const parsed = (
      record ? projectTeamSchema : projectCreationSchema
    ).safeParse(commandPayload());
    if (!parsed.success) {
      issues(parsed.error.issues);
      setStep(3);
      return;
    }
    busy.current = true;
    cid.current ||= crypto.randomUUID();
    frozen.current = JSON.stringify(parsed.data);
    draft.values['command'] = cid.current;
    draft.values['payload'] = frozen.current;
    draft.status = 'pending';
    updateUrl(cid.current);
    setState('pending');
    setError('');
    try {
      const response = await api(
        record ? 'team' : 'create',
        JSON.parse(frozen.current),
        cid.current,
      );
      if (response.ok) complete(response.value);
      else if (response.value.knownRejected) {
        setState('editing');
        setError(response.value.code ?? 'INVALID_INPUT');
        clearCommand();
      } else setState('unknown');
    } catch {
      setState('unknown');
    } finally {
      busy.current = false;
    }
  }
  async function recheck() {
    if (checking || !cid.current) return;
    setChecking(true);
    try {
      const response = await fetch(
        '/api/project-onboarding?command=' + encodeURIComponent(cid.current),
        { cache: 'no-store' },
      );
      if (!response.ok) throw Error();
      const value = (await response.json()) as { receipt: Receipt | null };
      if (value.receipt) complete(value.receipt);
      else {
        setState('unknown');
        setError('UNCONFIRMED');
      }
    } catch {
      setState('unknown');
      setError('UNCONFIRMED');
    } finally {
      setChecking(false);
    }
  }
  function retainName(key: string, index?: number) {
    const v = identities[key];
    if (!v?.id) return;
    if (index === undefined) {
      form.setValue('supervisor.name', v.name, { shouldDirty: true });
      form.setValue('supervisor.existingId', v.id);
    } else {
      form.setValue(`students.${index}.name`, v.name, { shouldDirty: true });
      form.setValue(`students.${index}.existingId`, v.id);
    }
    setIdentities((old) => ({ ...old, [key]: { ...v, nameMatches: true } }));
    setError('');
  }
  function identityHint(key: string, index?: number) {
    const v = identities[key];
    return v ? (
      <div className="po-identity-hint">
        <IdentityState locale={locale} state={v.identity} />
        {!v.nameMatches && (
          <>
            <p dir="auto">
              {copy('This address belongs to', 'ينتمي هذا العنوان إلى')}{' '}
              <strong>
                <bdi dir="auto">{v.name}</bdi>
              </strong>
              .{' '}
              {copy(
                'Verify and retain the stored identity. Its name and credentials will not change.',
                'تحقق واحتفظ بالهوية المسجلة. لن يتغير الاسم أو بيانات الاعتماد.',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => retainName(key, index)}
            >
              {copy('Use the stored identity', 'استخدام الهوية المسجلة')}
            </Button>
          </>
        )}
      </div>
    ) : (
      <p dir="auto" className="po-hint">
        {copy('Will verify on review', 'سيُتحقق عند المراجعة')}
      </p>
    );
  }
  const field = (
    path: FieldPath<Values>,
    label: string,
    type = 'text',
    hint?: string,
  ) => {
    const e = form.getFieldState(path, form.formState).error,
      id = 'po-' + path.replaceAll('.', '-');
    return (
      <Field data-invalid={!!e} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type={type}
          autoComplete={type === 'email' ? 'email' : 'off'}
          dir={
            type === 'email' || path === 'year'
              ? 'ltr'
              : locale === 'ar'
                ? 'rtl'
                : 'ltr'
          }
          disabled={disabled}
          aria-invalid={!!e}
          aria-describedby={
            [hint ? id + '-hint' : '', e ? id + '-error' : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
          {...form.register(path, {
            onChange: () => {
              if (path === 'supervisor.email' || path === 'supervisor.name') {
                form.setValue('supervisor.existingId', undefined);
                setIdentities((old) => {
                  const next = { ...old };
                  delete next.supervisor;
                  return next;
                });
              }
              const student = path.match(/^students\.(\d+)\.(email|name)$/);
              if (student) {
                form.setValue(
                  `students.${Number(student[1])}.existingId`,
                  undefined,
                );
                setIdentities((old) => {
                  const next = { ...old };
                  delete next['student-' + student[1]];
                  return next;
                });
              }
            },
          })}
        />
        {hint && <FieldDescription id={id + '-hint'}>{hint}</FieldDescription>}
        {e && <FieldError id={id + '-error'}>{e.message}</FieldError>}
      </Field>
    );
  };
  return (
    <section
      className={'po-task ' + (record ? 'po-team-task' : '')}
      data-step={step}
      data-state={state}
      data-locale={locale}
    >
      {!record && (
        <div className="po-task-top">
          <Link href={parent} className="po-back">
            <ArrowLeft />
            {copy('Back to Projects', 'العودة إلى المشاريع')}
          </Link>
          <Button
            variant="ghost"
            type="button"
            onClick={() =>
              dirty || pending ? setLeave(parent) : router.push(parent)
            }
          >
            {copy('Cancel', 'إلغاء')}
          </Button>
        </div>
      )}
      <header
        className="po-question-heading"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <p dir="auto">
          {record
            ? copy('Correct project team', 'تصحيح فريق المشروع')
            : copy('New project', 'مشروع جديد')}{' '}
          · {copy(`Step ${step} of 4`, `الخطوة ${step} من 4`)}
        </p>
        <Heading ref={heading} tabIndex={-1}>
          {pending
            ? copy('Check the original request', 'التحقق من الطلب الأصلي')
            : step === 4
              ? record
                ? copy(
                    'Check the team before confirming',
                    'تحقق من الفريق قبل التأكيد',
                  )
                : copy(
                    'Check details before creating',
                    'تحقق من التفاصيل قبل الإنشاء',
                  )
              : labels[step - 1]}
        </Heading>
        <p dir="auto">
          {step === 1
            ? copy(
                'Start with the essentials. Students complete the abstract, keywords and files later.',
                'ابدأ بالأساسيات. يكمل الطلاب الملخص والكلمات المفتاحية والملفات لاحقًا.',
              )
            : step === 2
              ? copy(
                  'Assign one faculty supervisor from this university.',
                  'حدد مشرفًا واحدًا من هيئة تدريس هذه الجامعة.',
                )
              : step === 3
                ? copy(
                    'Add the authors in their intended order and choose one project lead.',
                    'أضف المؤلفين بترتيبهم المقصود واختر قائدًا واحدًا للمشروع.',
                  )
                : copy(
                    'Review the project, people and individual account invitations.',
                    'راجع المشروع والأشخاص ودعوات الحسابات الفردية.',
                  )}
        </p>
      </header>
      <ol
        className="po-steps"
        aria-label={
          record
            ? copy('Team correction steps', 'خطوات تصحيح الفريق')
            : copy('Project creation steps', 'خطوات إنشاء المشروع')
        }
      >
        {labels.map((x, i) => (
          <li key={i} aria-current={step === i + 1 ? 'step' : undefined}>
            <span>{i + 1}</span>
            <span>{x}</span>
          </li>
        ))}
      </ol>
      <p dir="auto" className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {error && !pending && (
        <ResultAlert
          kind="error"
          title={
            error === 'VERIFY_NAME'
              ? copy('Verify the existing identity', 'تحقق من الهوية الحالية')
              : copy('Check the details', 'تحقق من التفاصيل')
          }
        >
          {error === 'READ_UNAVAILABLE'
            ? copy(
                'The authorized identity read could not finish. Your entries are kept; try Continue again.',
                'تعذر إكمال قراءة الهوية المصرح بها. تبقى البيانات محفوظة؛ حاول المتابعة مجددًا.',
              )
            : error === 'VERIFY_NAME'
              ? copy(
                  'Use the authoritative stored name shown beside the row, then continue. No account name is overwritten.',
                  'استخدم الاسم المعتمد المعروض بجانب الصف ثم تابع. لن يُستبدل اسم أي حساب.',
                )
              : projectError(locale, error)}
          {record && error === 'IDENTITY_OR_STATE_CHANGED' && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeave('close')}
            >
              {copy('Review current project', 'مراجعة المشروع الحالي')}
            </Button>
          )}
        </ResultAlert>
      )}
      {pending ? (
        <ProjectCard
          title={
            state === 'pending'
              ? record
                ? copy(
                    'Team correction is being checked',
                    'جارٍ التحقق من تصحيح الفريق',
                  )
                : copy('Creation is being checked', 'جارٍ التحقق من الإنشاء')
              : copy('The outcome needs checking', 'تحتاج النتيجة إلى التحقق')
          }
          description={copy(
            'No new request is sent while this original command is unresolved.',
            'لن يُرسل طلب جديد ما دام هذا الطلب الأصلي غير محسوم.',
          )}
        >
          <ResultAlert
            kind="pending"
            title={copy(
              'Your original request is preserved',
              'حُفظ الطلب الأصلي',
            )}
          >
            {record
              ? copy(
                  'Recheck this team correction receipt. No new correction is sent while the original result remains uncertain.',
                  'أعد فحص إيصال تصحيح الفريق هذا. لا يُرسل تصحيح جديد ما دامت نتيجة الطلب الأصلي غير مؤكدة.',
                )
              : copy(
                  'Recheck the committed receipt. A refresh cannot create another project or another set of invitations.',
                  'أعد فحص إيصال الحفظ. لا يؤدي التحديث إلى إنشاء مشروع آخر أو مجموعة دعوات جديدة.',
                )}
          </ResultAlert>
          <Button type="button" onClick={recheck} disabled={checking}>
            {checking && <LoaderCircle />}
            {record
              ? copy('Recheck team correction', 'إعادة التحقق من تصحيح الفريق')
              : copy('Recheck creation', 'إعادة التحقق من الإنشاء')}
          </Button>
          {error === 'UNCONFIRMED' && (
            <p dir="auto" role="status">
              {copy(
                'The server has not confirmed the original result yet. Recheck before starting another request.',
                'لم يؤكد الخادم نتيجة الطلب الأصلي بعد. أعد التحقق قبل بدء طلب آخر.',
              )}
            </p>
          )}
        </ProjectCard>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 4) void create();
            else void advance();
          }}
          noValidate
        >
          <div
            className={'po-task-grid ' + (step === 4 ? 'po-full-review' : '')}
          >
            <div className="po-task-body">
              {step === 1 && (
                <ProjectCard
                  title={copy('Project essentials', 'أساسيات المشروع')}
                  description={institution}
                >
                  {record ? (
                    <BidiFacts className="po-summary">
                      <BidiLabel dir="auto">
                        {copy('Project', 'المشروع')}
                      </BidiLabel>
                      <BidiData dir="auto">
                        <bdi dir="auto">
                          {record.title ||
                            copy('Untitled project', 'مشروع دون عنوان')}
                        </bdi>
                      </BidiData>
                      <BidiLabel dir="auto">
                        {copy('Department / year', 'القسم / السنة')}
                      </BidiLabel>
                      <BidiData dir="ltr">
                        {record.department} · {record.year}
                      </BidiData>
                    </BidiFacts>
                  ) : (
                    <div className="po-fields">
                      {field(
                        'title',
                        copy('Project title', 'عنوان المشروع'),
                        'text',
                        copy(
                          'A provisional title, up to 200 characters.',
                          'عنوان مبدئي لا يتجاوز 200 حرف.',
                        ),
                      )}
                      <Controller
                        control={form.control}
                        name="department"
                        render={({ field: f, fieldState }) => (
                          <Field data-invalid={!!fieldState.error}>
                            <FieldLabel htmlFor="po-department">
                              {copy('Department', 'القسم')}
                            </FieldLabel>
                            <Select value={f.value} onValueChange={f.onChange}>
                              <SelectTrigger
                                id="po-department"
                                ref={f.ref}
                                onBlur={f.onBlur}
                                aria-invalid={!!fieldState.error}
                                aria-describedby={
                                  fieldState.error
                                    ? 'po-department-error'
                                    : undefined
                                }
                              >
                                <SelectValue
                                  placeholder={copy(
                                    'Choose your department',
                                    'اختر القسم',
                                  )}
                                />
                              </SelectTrigger>
                              <SelectContent className="wsv2">
                                {departments.map((d) => (
                                  <SelectItem value={d.id} key={d.id}>
                                    <span dir="ltr">{d.code}</span>:{' '}
                                    {locale === 'ar'
                                      ? canonicalDepartments.find(
                                          (x) => x.code === d.code,
                                        )?.nameAr
                                      : d.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {fieldState.error && (
                              <FieldError id="po-department-error">
                                {fieldState.error.message}
                              </FieldError>
                            )}
                          </Field>
                        )}
                      />
                      {field(
                        'year',
                        copy('Academic year', 'السنة الأكاديمية'),
                        'text',
                        copy(
                          'Two consecutive years, for example 2026–2027.',
                          'سنتان متتاليتان، مثل 2026–2027.',
                        ),
                      )}
                    </div>
                  )}
                </ProjectCard>
              )}
              {step === 2 && (
                <ProjectCard
                  title={copy('Assigned faculty supervisor', 'المشرف المعيّن')}
                  description={copy(
                    'One account, in this university and the selected department.',
                    'حساب واحد في هذه الجامعة والقسم المحدد.',
                  )}
                >
                  <div className="po-choice">
                    <Button
                      type="button"
                      variant={mode === 'existing' ? 'secondary' : 'outline'}
                      aria-pressed={mode === 'existing'}
                      onClick={() => setMode('existing')}
                    >
                      {copy('Use existing faculty', 'استخدام مشرف حالي')}
                    </Button>
                    {!record?.locked && (
                      <Button
                        type="button"
                        variant={mode === 'new' ? 'secondary' : 'outline'}
                        aria-pressed={mode === 'new'}
                        onClick={() => setMode('new')}
                      >
                        {copy('Invite a new supervisor', 'دعوة مشرف جديد')}
                      </Button>
                    )}
                  </div>
                  {mode === 'existing' ? (
                    <>
                      <FacultyPicker
                        locale={locale}
                        department={values.department}
                        value={
                          values.supervisor.existingId
                            ? values.supervisor.name
                            : ''
                        }
                        disabled={disabled}
                        invalid={!!form.formState.errors.supervisor}
                        onSelect={(x) => {
                          form.setValue(
                            'supervisor',
                            { name: x.name, email: x.email, existingId: x.id },
                            { shouldDirty: true },
                          );
                          setIdentities((old) => ({
                            ...old,
                            supervisor: {
                              ...x,
                              role: 'faculty_supervisor',
                              status: x.status as 'active' | 'inactive',
                              identity:
                                x.status === 'active'
                                  ? 'existing-active'
                                  : 'existing-invitation',
                              nameMatches: true,
                            },
                          }));
                          setError('');
                        }}
                      />
                      <div className="po-chosen">
                        {values.supervisor.name && (
                          <>
                            <strong>
                              <bdi dir="auto">{values.supervisor.name}</bdi>
                            </strong>
                            <span dir="ltr">{values.supervisor.email}</span>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="po-fields">
                      {field(
                        'supervisor.name',
                        copy('Supervisor full name', 'الاسم الكامل للمشرف'),
                      )}
                      {field(
                        'supervisor.email',
                        copy('Supervisor email', 'بريد المشرف'),
                        'email',
                      )}
                      <p dir="auto" className="po-hint">
                        {copy(
                          'New account. A setup invitation will be queued only after the project is created.',
                          'حساب جديد. ستُدرج دعوة الإعداد بعد إنشاء المشروع فقط.',
                        )}
                      </p>
                    </div>
                  )}
                  {identityHint('supervisor')}
                  {mode === 'existing' && form.formState.errors.supervisor && (
                    <FieldError id="po-supervisor-error">
                      {copy(
                        'Choose an eligible supervisor or use Invite a new supervisor.',
                        'اختر مشرفًا مؤهلًا أو استخدم دعوة مشرف جديد.',
                      )}
                    </FieldError>
                  )}
                </ProjectCard>
              )}
              {step === 3 && (
                <ProjectCard
                  title={copy('Student authors', 'الطلاب المؤلفون')}
                  description={
                    record?.locked
                      ? copy(
                          'Submitted author names and order are frozen. You may select a currently active lead.',
                          'ثبتت أسماء المؤلفين وترتيبهم بعد التقديم. يمكنك اختيار قائد نشط حاليًا.',
                        )
                      : copy(
                          'List students in author order. Select one lead; accounts are checked when you review.',
                          'أدرج الطلاب بترتيب المؤلفين واختر قائدًا واحدًا. تُفحص الحسابات عند المراجعة.',
                        )
                  }
                >
                  <RadioGroup
                    className="po-author-group"
                    value={String(values.students.findIndex((x) => x.lead))}
                    onValueChange={(v) => {
                      values.students.forEach((_, i) =>
                        form.setValue(`students.${i}.lead`, i === Number(v), {
                          shouldDirty: true,
                        }),
                      );
                      setAnnouncement(
                        copy(
                          'Project lead selected: ',
                          'اختير قائد المشروع: ',
                        ) +
                          (values.students[Number(v)]?.name ||
                            copy('Student ', 'الطالب ') + (Number(v) + 1)),
                      );
                    }}
                    aria-label={copy('Project lead', 'قائد المشروع')}
                    aria-describedby={
                      form.formState.errors.students
                        ? 'po-team-error'
                        : undefined
                    }
                  >
                    <ol className="po-author-rows">
                      {fields.map((f, i) => (
                        <li
                          key={f.id}
                          className="po-author-row"
                          data-lead={!!values.students[i]?.lead}
                        >
                          <div className="po-author-top">
                            <strong>
                              {copy(`Student ${i + 1}`, `الطالب ${i + 1}`)}
                              {values.students[i]?.lead && (
                                <Badge>
                                  {copy('Project lead', 'قائد المشروع')}
                                </Badge>
                              )}
                            </strong>
                            {!record?.locked && (
                              <div className="po-order-actions">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={i === 0 || disabled}
                                  aria-label={copy(
                                    `Move student ${i + 1} up`,
                                    `نقل الطالب ${i + 1} للأعلى`,
                                  )}
                                  onClick={() => {
                                    move(i, i - 1);
                                    setIdentities({});
                                    setAnnouncement(
                                      copy(
                                        'Author order updated.',
                                        'حُدث ترتيب المؤلفين.',
                                      ),
                                    );
                                  }}
                                >
                                  <ArrowUp />
                                  <span>{copy('Up', 'أعلى')}</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={i === fields.length - 1 || disabled}
                                  aria-label={copy(
                                    `Move student ${i + 1} down`,
                                    `نقل الطالب ${i + 1} للأسفل`,
                                  )}
                                  onClick={() => {
                                    move(i, i + 1);
                                    setIdentities({});
                                    setAnnouncement(
                                      copy(
                                        'Author order updated.',
                                        'حُدث ترتيب المؤلفين.',
                                      ),
                                    );
                                  }}
                                >
                                  <ArrowDown />
                                  <span>{copy('Down', 'أسفل')}</span>
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={disabled}
                                  aria-label={copy(
                                    `Remove student ${i + 1}`,
                                    `إزالة الطالب ${i + 1}`,
                                  )}
                                  onClick={() => {
                                    const entry = values.students[i];
                                    if (
                                      entry &&
                                      (entry.name.trim() ||
                                        entry.email.trim() ||
                                        entry.lead)
                                    )
                                      setRemoving(f.id);
                                    else removeAuthor(f.id);
                                  }}
                                >
                                  <Trash2 />
                                  <span>{copy('Remove', 'إزالة')}</span>
                                </Button>
                              </div>
                            )}
                          </div>
                          {record?.locked ? (
                            <div className="po-chosen">
                              <strong>
                                <bdi dir="auto">{values.students[i]?.name}</bdi>
                              </strong>
                              <span dir="ltr">{values.students[i]?.email}</span>
                            </div>
                          ) : (
                            <div className="po-author-fields">
                              {field(
                                `students.${i}.name`,
                                copy('Full name', 'الاسم الكامل'),
                              )}
                              {field(
                                `students.${i}.email`,
                                copy('Email address', 'عنوان البريد'),
                                'email',
                              )}
                            </div>
                          )}
                          <div className="po-lead-choice">
                            <RadioGroupItem
                              id={'po-lead-' + i}
                              value={String(i)}
                              disabled={
                                disabled ||
                                (record?.locked &&
                                  record.authors[i]?.status !== 'active')
                              }
                            />
                            <FieldLabel
                              htmlFor={'po-lead-' + i}
                              dir={locale === 'ar' ? 'rtl' : 'ltr'}
                            >
                              {copy(
                                `Project lead for student ${i + 1}`,
                                `قائد المشروع: الطالب ${i + 1}`,
                              )}
                            </FieldLabel>
                          </div>
                          {!record?.locked &&
                            (form.formState.errors.students?.[i] ? (
                              <p dir="auto" className="po-row-correction">
                                {copy(
                                  'Requires correction · check the fields above',
                                  'يلزم التصحيح · تحقق من الحقول أعلاه',
                                )}
                              </p>
                            ) : (
                              identityHint('student-' + i, i)
                            ))}
                        </li>
                      ))}
                    </ol>
                  </RadioGroup>
                  {form.formState.errors.students?.message && (
                    <FieldError id="po-team-error">
                      {copy(
                        'Use unique student identities and explicitly choose exactly one lead.',
                        'استخدم هويات طلاب فريدة واختر قائدًا واحدًا صراحة.',
                      )}
                    </FieldError>
                  )}
                  {!record?.locked && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={fields.length >= 1000 || disabled}
                      id="po-add-student"
                      onClick={() => {
                        append(blankStudent(), {
                          focusName: `students.${fields.length}.name`,
                        });
                        setAnnouncement(
                          copy(
                            'Student added. Enter their full name.',
                            'أُضيف طالب. أدخل اسمه الكامل.',
                          ),
                        );
                      }}
                    >
                      <Plus />
                      {copy('Add student', 'إضافة طالب')}
                    </Button>
                  )}
                  {fields.length >= 1000 && (
                    <p dir="auto" className="po-hint">
                      {copy(
                        'The existing institutional assignment service permits up to 1,000 authors.',
                        'تسمح خدمة الإسناد المؤسسية الحالية بما يصل إلى 1000 مؤلف.',
                      )}
                    </p>
                  )}
                  {record && (
                    <div className="po-fields po-reason">
                      {field(
                        'reason',
                        copy('Reason for team correction', 'سبب تصحيح الفريق'),
                        'text',
                        copy(
                          'A concise reason is required; 3–400 characters.',
                          'يلزم سبب موجز من 3 إلى 400 حرف.',
                        ),
                      )}
                    </div>
                  )}
                </ProjectCard>
              )}
              {step === 4 && preview && (
                <>
                  <ProjectCard
                    title={copy('Project and institution', 'المشروع والمؤسسة')}
                  >
                    <BidiFacts className="po-summary">
                      <BidiLabel dir="auto">
                        {copy('University', 'الجامعة')}
                      </BidiLabel>
                      <BidiData dir="auto">
                        <bdi dir="auto">{institution}</bdi>
                      </BidiData>
                      <BidiLabel dir="auto">
                        {copy('Title', 'العنوان')}
                      </BidiLabel>
                      <BidiData dir="auto">
                        <bdi dir="auto">{values.title}</bdi>
                      </BidiData>
                      <BidiLabel dir="auto">
                        {copy(
                          'Department / academic year',
                          'القسم / السنة الأكاديمية',
                        )}
                      </BidiLabel>
                      <BidiData dir="ltr">
                        {departments.find((x) => x.id === values.department)
                          ?.code ?? record?.department}{' '}
                        · {values.year}
                      </BidiData>
                    </BidiFacts>
                    {!record && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => editSection(1)}
                      >
                        {copy('Edit project details', 'تعديل تفاصيل المشروع')}
                      </Button>
                    )}
                  </ProjectCard>
                  <ProjectCard title={copy('Supervisor', 'المشرف')}>
                    <strong>
                      <bdi dir="auto">{preview.supervisor.name}</bdi>
                    </strong>
                    <p dir="ltr">{preview.supervisor.email}</p>
                    <IdentityState
                      locale={locale}
                      state={preview.supervisor.identity}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => editSection(2)}
                    >
                      {copy('Edit supervisor', 'تعديل المشرف')}
                    </Button>
                  </ProjectCard>
                  <ProjectCard
                    title={copy('Ordered author team', 'فريق المؤلفين المرتب')}
                  >
                    <ol className="po-review-authors">
                      {preview.students.map((x, i) => (
                        <li key={x.email}>
                          <div>
                            <strong>
                              <bdi dir="auto">{x.name}</bdi>
                            </strong>
                            <span dir="ltr">{x.email}</span>
                          </div>
                          <div>
                            <IdentityState locale={locale} state={x.identity} />
                            {values.students[i]?.lead && (
                              <strong className="po-lead-label">
                                {copy('Project lead', 'قائد المشروع')}
                              </strong>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => editSection(3)}
                    >
                      {copy('Edit students and lead', 'تعديل الطلاب والقائد')}
                    </Button>
                  </ProjectCard>
                  <ProjectCard
                    title={copy('Account access', 'الوصول إلى الحسابات')}
                  >
                    <BidiFacts className="po-access-summary">
                      <BidiFact>
                        <BidiLabel dir="auto">
                          {copy('New accounts', 'حسابات جديدة')}
                        </BidiLabel>
                        <BidiData dir="auto">
                          {
                            [preview.supervisor, ...preview.students].filter(
                              (x) => x.identity === 'new-invitation',
                            ).length
                          }
                        </BidiData>
                      </BidiFact>
                      <BidiFact>
                        <BidiLabel dir="auto">
                          {copy(
                            'Existing accounts reused',
                            'حسابات حالية ستُستخدم',
                          )}
                        </BidiLabel>
                        <BidiData dir="auto">
                          {
                            [preview.supervisor, ...preview.students].filter(
                              (x) => x.identity !== 'new-invitation',
                            ).length
                          }
                        </BidiData>
                      </BidiFact>
                    </BidiFacts>
                    <p dir="auto">
                      {record
                        ? copy(
                            'The current editable assignment is corrected with an audited reason. Frozen submission attribution stays intact.',
                            'يُصحح الإسناد الحالي مع سبب مسجل. تبقى بيانات التقديم المجمّدة سليمة.',
                          )
                        : copy(
                            'Create a private project with this team. Accounts that need setup receive individual invitations. Existing identities and completed sign-in details are preserved.',
                            'أنشئ مشروعًا خاصًا بهذا الفريق. تتلقى الحسابات التي تحتاج إلى إعداد دعوات فردية. تبقى هويات الحسابات الموجودة وبيانات دخولها المكتملة محفوظة.',
                          )}
                    </p>
                    <p dir="auto">
                      {copy(
                        'No files are uploaded, no academic review is submitted, and nothing is published by this action.',
                        'لا تُرفع ملفات ولا تُقدم مراجعة أكاديمية ولا يُنشر شيء بهذا الإجراء.',
                      )}
                    </p>
                    {record && (
                      <p dir="auto">
                        <strong>{copy('Reason', 'السبب')}: </strong>
                        <bdi dir="auto">{values.reason}</bdi>
                      </p>
                    )}
                  </ProjectCard>
                </>
              )}
            </div>
            {step !== 4 && (
              <aside
                className="po-live-summary"
                aria-label={copy('Project summary', 'ملخص المشروع')}
              >
                <details
                  open={summaryOpen}
                  onToggle={(e) => setSummaryOpen(e.currentTarget.open)}
                >
                  <summary>{copy('Your project', 'مشروعك')}</summary>
                  <strong>
                    <bdi dir="auto">
                      {values.title ||
                        copy('Title not entered yet', 'لم يُدخل العنوان بعد')}
                    </bdi>
                  </strong>
                  <p dir="auto">
                    <bdi dir="auto">{institution}</bdi>
                  </p>
                  {values.department && (
                    <p dir="ltr">
                      {departments.find((x) => x.id === values.department)
                        ?.code ?? record?.department}{' '}
                      · {values.year}
                    </p>
                  )}
                  <p dir="auto">
                    {values.supervisor.name ? (
                      <bdi dir="auto">{values.supervisor.name}</bdi>
                    ) : (
                      copy('Supervisor not selected', 'لم يُحدد المشرف')
                    )}
                  </p>
                  <p dir="auto">
                    {copy(
                      `${values.students.filter((x) => x.email.trim()).length} ${values.students.filter((x) => x.email.trim()).length === 1 ? 'student row' : 'student rows'} entered`,
                      `${values.students.filter((x) => x.email.trim()).length} صفوف طلاب مدخلة`,
                    )}
                  </p>
                </details>
              </aside>
            )}
          </div>
          <footer className="po-task-actions">
            <Button
              type="button"
              variant="outline"
              disabled={checking}
              onClick={() =>
                step > 1
                  ? setStep(step - 1)
                  : dirty
                    ? setLeave(parent)
                    : router.push(parent)
              }
            >
              <ArrowLeft />
              {copy('Back', 'السابق')}
            </Button>
            <Button
              type="submit"
              disabled={checking || (step === 4 && !preview)}
            >
              {checking && <LoaderCircle />}
              {step === 4
                ? record
                  ? copy('Confirm team correction', 'تأكيد تصحيح الفريق')
                  : copy('Create project', 'إنشاء المشروع')
                : returnToReview
                  ? copy('Return to Review', 'العودة إلى المراجعة')
                  : copy('Continue', 'متابعة')}
              <ArrowRight />
            </Button>
            {record && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => (dirty ? setLeave('close') : cancelCorrection())}
              >
                {copy('Cancel correction', 'إلغاء التصحيح')}
              </Button>
            )}
          </footer>
        </form>
      )}
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent
          className="wsv2 po-confirmation"
          role="alertdialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {copy('Remove this student?', 'إزالة هذا الطالب؟')}
            </DialogTitle>
            <DialogDescription>
              <bdi dir="auto">
                {values.students[fields.findIndex((x) => x.id === removing)]
                  ?.name || copy('This student row', 'صف الطالب')}
              </bdi>{' '}
              {copy(
                'will be removed from this unsaved roster. Remaining author order is preserved; removing the lead requires you to choose another.',
                'سيُزال من هذه القائمة غير المحفوظة. يبقى ترتيب المؤلفين الآخرين، ويلزم اختيار قائد آخر عند إزالة القائد.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoving(null)}
            >
              {copy('Keep student', 'الاحتفاظ بالطالب')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (removing) removeAuthor(removing);
              }}
            >
              {copy('Remove student', 'إزالة الطالب')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={leave !== null}
        onOpenChange={(open) => {
          if (!open) setLeave(null);
        }}
      >
        <DialogContent
          className="wsv2 po-confirmation"
          role="alertdialog"
          closeLabel={copy('Close', 'إغلاق')}
          onCloseAutoFocus={(e) => {
            if (leaveTrigger.current?.isConnected) {
              e.preventDefault();
              leaveTrigger.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {pending
                ? copy(
                    'Check the original request first',
                    'تحقق من الطلب الأصلي أولًا',
                  )
                : record
                  ? copy(
                      'Discard unsaved team corrections?',
                      'تجاهل تصحيحات الفريق غير المحفوظة؟',
                    )
                  : copy(
                      'Discard unsaved project details?',
                      'تجاهل تفاصيل المشروع غير المحفوظة؟',
                    )}
            </DialogTitle>
            <DialogDescription>
              {pending
                ? record
                  ? copy(
                      'The team correction outcome is uncertain. Recheck its receipt before leaving or sending another correction.',
                      'نتيجة تصحيح الفريق غير مؤكدة. أعد فحص الإيصال قبل المغادرة أو إرسال تصحيح آخر.',
                    )
                  : copy(
                      'The creation outcome is uncertain. Recheck its receipt before leaving or sending another request.',
                      'نتيجة الإنشاء غير مؤكدة. أعد فحص الإيصال قبل المغادرة أو إرسال طلب آخر.',
                    )
                : record
                  ? copy(
                      'These team corrections have not been saved. Keep editing or discard the unsent changes. The recorded team remains unchanged.',
                      'لم تُحفظ تصحيحات الفريق هذه. تابع التحرير أو تجاهل التعديلات غير المرسلة. يبقى الفريق المسجل دون تغيير.',
                    )
                  : copy(
                      'Your project and people have not been saved. Keep the details to continue or discard this draft.',
                      'لم تُحفظ تفاصيل المشروع والأشخاص. احتفظ بالتفاصيل للمتابعة أو تجاهل هذه المسودة.',
                    )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLeave(null)}
            >
              {copy('Keep editing', 'متابعة التحرير')}
            </Button>
            {!pending && (
              <Button type="button" onClick={navigateAway}>
                {copy('Discard details', 'تجاهل التفاصيل')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
