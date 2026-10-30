'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, Controller, type FieldPath } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import type {
  DraftFields,
  SemesterState,
  SemesterReceipt,
} from '@capstone/domain';
import { draftValidation, computingDomains } from '@capstone/domain';
import {
  Button,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  LoaderCircle,
} from '@capstone/ui/workspace-v2';
import { StudioCard, Notice, date, t, type Locale } from './common';
import { useSemesterMemory } from './memory';
import { useSemesterCommand, CommandRecovery } from './command';
import {
  guardedNavigation,
  useAssessmentExit,
} from '../assessment-studio/exit-guard';
type Values = {
  title: string;
  abstract: string;
  keywordsText: string;
  academic_year: string;
  domain: string;
};
const toValues = (f: DraftFields): Values => ({
  ...f,
  keywordsText: f.keywords.join('\n'),
});
const toFields = (v: Values): DraftFields => ({
  title: v.title,
  abstract: v.abstract,
  keywords: v.keywordsText
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean),
  academic_year: v.academic_year,
  domain: v.domain,
});
export function MetadataEditor({
  locale,
  actor,
  state,
  rootPath,
  active,
  locked,
  onDirty,
}: {
  locale: Locale;
  actor: string;
  state: SemesterState;
  rootPath: string;
  active: boolean;
  locked?: string | undefined;
  onDirty: (dirty: boolean) => void;
}) {
  const memory = useSemesterMemory(actor, state.project.id),
    initial = toValues(state.project.metadata),
    command = useSemesterCommand(
      memory,
      'metadata',
      state.project.id,
      state.project.version,
      actor,
      locked,
    ),
    router = useRouter();
  let stored: Values | undefined;
  try {
    stored = JSON.parse(memory.metadata ?? 'null') ?? undefined;
  } catch {}
  const form = useForm<Values>({ defaultValues: stored ?? initial }),
    values = form.watch(),
    baseline = useRef(memory.baseline ?? JSON.stringify(initial)),
    revision = useRef(
      Number(memory.revision ?? state.project.metadataRevision),
    ),
    dirty = JSON.stringify(values) !== baseline.current;
  const [conflict, setConflict] = useState<SemesterState | null>(null),
    [hydrated, setHydrated] = useState(false),
    [loading, setLoading] = useState(false),
    [saved, setSaved] = useState(false);
  const copy = (en: string, ar: string) => t(locale, en, ar);
  useEffect(() => setHydrated(true), []);
  const allowDestination = useCallback(
    (destination: string) => {
      const url = new URL(destination, location.origin);
      const path = url.pathname.replace(/^\/(en|ar)/, '');
      return (
        !command.pending &&
        url.origin === location.origin &&
        (path === rootPath || path.startsWith(rootPath + '/'))
      );
    },
    [rootPath, command.pending],
  );
  const exitGuard = useAssessmentExit(
    dirty || command.pending,
    locale,
    () => {
      for (const key of ['metadata', 'baseline', 'revision'])
        delete memory[key];
      form.reset(initial);
      baseline.current = JSON.stringify(initial);
    },
    {
      preserveLocaleSwitch: true,
      canDiscard: !command.pending,
      allowDestination,
      stayLabel: command.pending
        ? copy('Stay and check', 'البقاء والتحقق')
        : copy('Keep editing', 'متابعة التحرير'),
      description: copy(
        'Keep your text to continue editing, or discard it before leaving this project.',
        'احتفظ بالنص لمتابعة التحرير، أو تجاهله قبل مغادرة المشروع.',
      ),
    },
  );
  useEffect(() => {
    memory.metadata = JSON.stringify(values);
    memory.baseline = baseline.current;
    memory.revision = String(revision.current);
  }, [memory, values]);
  useEffect(() => {
    onDirty(dirty || command.pending);
  }, [dirty, command.pending, onDirty]);
  useEffect(() => {
    if (
      !dirty &&
      !command.pending &&
      state.project.metadataRevision !== revision.current
    ) {
      form.reset(toValues(state.project.metadata));
      baseline.current = JSON.stringify(toValues(state.project.metadata));
      revision.current = state.project.metadataRevision;
    }
  }, [
    state.project.metadataRevision,
    state.project.metadata,
    dirty,
    command.pending,
    form,
  ]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
        if (dirty || command.pending) e.preventDefault();
      },
      clear = () =>
        form.reset({
          title: '',
          abstract: '',
          keywordsText: '',
          academic_year: '',
          domain: '',
        });
    window.addEventListener('beforeunload', warn);
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [dirty, command.pending, rootPath, form, state.project.id]);
  function complete(receipt: SemesterReceipt) {
    const normalized = draftValidation(toFields(form.getValues())).fields,
      next = toValues(normalized);
    revision.current = receipt.revision;
    baseline.current = JSON.stringify(next);
    form.reset(next);
    memory.metadata = JSON.stringify(next);
    memory.baseline = baseline.current;
    memory.revision = String(revision.current);
    setSaved(true);
    router.refresh();
  }
  async function save() {
    form.clearErrors();
    setSaved(false);
    const result = draftValidation(toFields(form.getValues()));
    if (result.issues.length) {
      for (const issue of result.issues)
        form.setError(
          (issue.field === 'keywords'
            ? 'keywordsText'
            : issue.field) as FieldPath<Values>,
          {
            message: copy(
              'Check the permitted format and length.',
              'تحقق من الصيغة والطول المسموحين.',
            ),
          },
        );
      form.setFocus(
        (result.issues[0]!.field === 'keywords'
          ? 'keywordsText'
          : result.issues[0]!.field) as FieldPath<Values>,
      );
      return;
    }
    const receipt = await command.write({
      operation: 'metadata.save',
      project: state.project.id,
      version: state.project.version,
      revision: revision.current,
      fields: result.fields,
    });
    if (receipt) complete(receipt);
  }
  async function compare() {
    setLoading(true);
    try {
      const response = await fetch(
        '/api/semester?project=' + state.project.id,
        { cache: 'no-store' },
      );
      if (!response.ok) throw Error();
      setConflict((await response.json()) as SemesterState);
    } catch {
      setConflict(null);
    } finally {
      setLoading(false);
    }
  }
  const field = (
    name: FieldPath<Values>,
    label: string,
    hint: string,
    multiline = false,
  ) => {
    const error = form.getFieldState(name, form.formState).error;
    return (
      <Field data-invalid={!!error} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <FieldLabel htmlFor={'ss-' + name}>{label}</FieldLabel>
        {multiline ? (
          <Textarea
            id={'ss-' + name}
            rows={name === 'abstract' ? 9 : 4}
            disabled={!hydrated || !state.editable || command.pending}
            aria-invalid={!!error}
            aria-describedby={
              'ss-' + name + '-hint' + (error ? ' ss-' + name + '-error' : '')
            }
            {...form.register(name)}
          />
        ) : (
          <Input
            id={'ss-' + name}
            dir={
              name === 'academic_year' ? 'ltr' : locale === 'ar' ? 'rtl' : 'ltr'
            }
            disabled={!hydrated || !state.editable || command.pending}
            aria-invalid={!!error}
            aria-describedby={
              'ss-' + name + '-hint' + (error ? ' ss-' + name + '-error' : '')
            }
            {...form.register(name)}
          />
        )}
        <FieldDescription id={'ss-' + name + '-hint'}>{hint}</FieldDescription>
        {error && (
          <FieldError id={'ss-' + name + '-error'}>{error.message}</FieldError>
        )}
      </Field>
    );
  };
  return (
    <section
      hidden={!active}
      className="ss-metadata ss-focused-editor"
      data-template="metadata-edit"
    >
      <StudioCard title={copy('Project details', 'تفاصيل المشروع')}>
        <p dir="auto" className="ss-muted">
          {copy(
            'Keep the project title, summary and research context up to date.',
            'حدّث عنوان المشروع وملخصه وسياق البحث.',
          )}
        </p>
        <div aria-live="polite" className="ss-save-state">
          {!hydrated
            ? copy('Loading project details…', 'جارٍ تحميل تفاصيل المشروع…')
            : command.state === 'pending'
              ? copy('Saving project details…', 'جارٍ حفظ تفاصيل المشروع…')
              : command.pending
                ? copy(
                    'Saving outcome needs checking',
                    'يلزم التحقق من نتيجة الحفظ',
                  )
                : saved
                  ? copy('Saved on server', 'حُفظت على الخادم')
                  : dirty
                    ? copy('Unsaved changes', 'تغييرات غير محفوظة')
                    : copy('Latest project update', 'آخر تحديث للمشروع')}{' '}
          · {date(locale, state.project.updatedAt)}
        </div>
        {command.pending && (
          <CommandRecovery
            locale={locale}
            command={command}
            onDone={complete}
          />
        )}
        {command.error && !command.pending && (
          <Notice
            locale={locale}
            error
            title={
              command.error.code === 'CONFLICT'
                ? copy('Conflicting revision', 'تعارض في النسخة')
                : copy('Save was not completed', 'لم يكتمل الحفظ')
            }
          >
            <p dir="auto">
              {copy(
                'Your text is kept. Review the current saved details before making another change.',
                'يبقى النص محفوظًا هنا. راجع التفاصيل الحالية قبل إجراء تغيير آخر.',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void compare()}
            >
              {copy('Compare saved details', 'مقارنة التفاصيل المحفوظة')}
            </Button>
          </Notice>
        )}
        {!state.editable && (
          <Notice
            locale={locale}
            title={copy(
              'This submitted work is read only',
              'هذا العمل المرسل للقراءة فقط',
            )}
          >
            <p dir="auto">
              {copy(
                'You can inspect its saved details and review history.',
                'يمكنك الاطلاع على تفاصيلها المحفوظة وسجل المراجعات.',
              )}
            </p>
          </Notice>
        )}
        <form
          noValidate
          aria-busy={!hydrated}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="ss-fields"
        >
          {state.editable && (
            <footer className="ss-form-actions">
              <Button
                type="submit"
                disabled={
                  !hydrated || command.pending || loading || !!command.error
                }
              >
                {command.state === 'pending' && <LoaderCircle />}
                {copy('Save project details', 'حفظ تفاصيل المشروع')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!hydrated || command.pending || loading}
                onClick={() =>
                  guardedNavigation('/' + locale + rootPath, () =>
                    router.push('/' + locale + rootPath),
                  )
                }
              >
                {copy('Back to overview', 'العودة إلى النظرة العامة')}
              </Button>
            </footer>
          )}
          {field(
            'title',
            copy('Project title', 'عنوان المشروع'),
            copy(
              'Up to 200 characters.',
              'حتى 200 حرف. يلزم عنوان لإرسال نقطة مراجعة.',
            ),
          )}
          {field(
            'abstract',
            copy('Abstract', 'الملخص'),
            copy(
              'Optional for an interim draft; up to 5,000 characters.',
              'اختياري للمسودة المرحلية؛ حتى 5000 حرف.',
            ),
            true,
          )}
          {field(
            'keywordsText',
            copy('Keywords', 'الكلمات المفتاحية'),
            copy(
              'One keyword per line; blank lines are ignored. Commas stay within a keyword. Up to 10 unique keywords, 2–50 characters each.',
              'كلمة مفتاحية لكل سطر؛ تُتجاهل الأسطر الفارغة وتبقى الفواصل ضمن الكلمة. حتى 10 كلمات فريدة، من حرفين إلى 50 حرفًا لكل منها.',
            ),
            true,
          )}
          <div className="ss-field-pair">
            {field(
              'academic_year',
              copy('Academic year', 'السنة الأكاديمية'),
              copy(
                'Optional for a draft; consecutive years such as 2026–2027.',
                'اختيارية للمسودة؛ سنتان متتاليتان مثل 2026–2027.',
              ),
            )}
            <Controller
              control={form.control}
              name="domain"
              render={({ field: f }) => (
                <Field dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                  <FieldLabel htmlFor="ss-domain">
                    {copy('Computing domain', 'مجال الحوسبة')}
                  </FieldLabel>
                  <Select
                    value={f.value || 'unset'}
                    onValueChange={(v) => f.onChange(v === 'unset' ? '' : v)}
                    disabled={!hydrated || !state.editable || command.pending}
                  >
                    <SelectTrigger id="ss-domain">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="wsv2">
                      <SelectItem value="unset">
                        {copy('Not set yet', 'لم يُحدد بعد')}
                      </SelectItem>
                      {computingDomains.map((x) => (
                        <SelectItem key={x.code} value={x.code}>
                          {locale === 'ar' ? x.ar : x.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {copy(
                      'Optional for a checkpoint.',
                      'اختياري لنقطة المراجعة.',
                    )}
                  </FieldDescription>
                </Field>
              )}
            />
          </div>
        </form>
      </StudioCard>
      {exitGuard}
      <Dialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <DialogContent
          className="wsv2 ss-dialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {copy('Current saved details', 'التفاصيل المحفوظة الحالية')}
            </DialogTitle>
            <DialogDescription>
              {copy(
                'Using these values replaces your unsaved text. Keeping your text does not overwrite the server.',
                'يستبدل استخدام هذه القيم النص غير المحفوظ. لا يستبدل الاحتفاظ بالنص بيانات الخادم.',
              )}
            </DialogDescription>
          </DialogHeader>
          {conflict && (
            <div className="ss-compare">
              <strong>
                <bdi dir="auto">{conflict.project.metadata.title}</bdi>
              </strong>
              <p dir="auto">
                <bdi dir="auto">
                  {conflict.project.metadata.abstract ||
                    copy('No abstract saved', 'لم يُحفظ ملخص')}
                </bdi>
              </p>
              <p dir="auto">
                <bdi dir="auto">
                  {conflict.project.metadata.keywords.join(' · ')}
                </bdi>
              </p>
              <p dir="ltr">{conflict.project.metadata.academic_year}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)}>
              {copy('Keep my text', 'الاحتفاظ بنصي')}
            </Button>
            <Button
              onClick={() => {
                if (!conflict) return;
                const next = toValues(conflict.project.metadata);
                form.reset(next);
                baseline.current = JSON.stringify(next);
                revision.current = conflict.project.metadataRevision;
                memory.revision = String(revision.current);
                command.reset();
                setSaved(false);
                setConflict(null);
                router.refresh();
              }}
            >
              {copy('Use saved details', 'استخدام التفاصيل المحفوظة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
