'use client';
import { formatScore } from '../score-format.js';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  List,
} from 'lucide-react';
import { Button } from './button.js';
import { Label } from './label.js';
import { RadioGroup, RadioGroupItem } from './radio-group.js';
import { Textarea } from './textarea.js';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './resizable.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs.js';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './sheet.js';
type Locale = 'en' | 'ar';
const t = (locale: Locale, en: string, ar: string) =>
  locale === 'ar' ? ar : en;
export type AssessmentVariant = 'supervisor' | 'committee' | 'independent';
export type AssessmentLevel = 0 | 1 | 2 | 3 | 4;
export type RubricCriterionView = {
  key: string;
  title: string;
  weight: number;
  intent: string;
  guidance?: string;
  anchors: ReadonlyArray<{
    level: AssessmentLevel;
    label: string;
    detail: string;
  }>;
};
export type CriterionValueView = { level: number | null; note: string };
/** Presentation only: adapters provide already-authorized context, rubric and commands. */
export function AcademicAssessmentWorkspace({
  locale,
  variant,
  title,
  back,
  scope,
  status,
  due,
  contextAction,
  evidence,
  assessment,
  tab,
  onTabChange,
  committeeGuest = false,
}: {
  locale: Locale;
  variant: AssessmentVariant;
  title: string;
  back: ReactNode;
  scope: string;
  status: string;
  due?: string;
  contextAction?: ReactNode;
  evidence: ReactNode;
  assessment: ReactNode;
  tab: string;
  onTabChange: (tab: string) => void;
  committeeGuest?: boolean;
}) {
  const id = useId(),
    copy = (en: string, ar: string) => t(locale, en, ar);
  return (
    <div className="as-workspace" data-variant={variant}>
      <header className="as-context">
        <div className="as-back">
          <ArrowLeft size={16} />
          {back}
        </div>
        <div className="as-context-main">
          <div>
            <p className="as-kicker" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {variant === 'independent'
                ? copy('Independent assessment', 'التقييم المستقل')
                : copy('Internal assessment', 'التقييم الداخلي')}
              <span>
                {' '}
                ·{' '}
                {variant === 'committee'
                  ? committeeGuest
                    ? copy(
                        'Your individual committee assessment',
                        'تقييمك الفردي للجنة',
                      )
                    : copy('Historical committee record', 'سجل اللجنة التاريخي')
                  : variant === 'supervisor'
                    ? copy('Supervisor', 'المشرف')
                    : copy('Your private review', 'تحكيمك الخاص')}
              </span>
            </p>
            <h1 dir="auto">{title}</h1>
            <p className="as-scope" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {scope}
              {due && (
                <>
                  {' '}
                  · {copy('Due', 'الموعد النهائي')} <bdi>{due}</bdi>
                </>
              )}
            </p>
          </div>
          <span className="as-status" role="status" aria-live="polite">
            {status}
          </span>
        </div>
        {contextAction && (
          <div className="as-context-action">{contextAction}</div>
        )}
      </header>
      <Tabs
        dir="ltr"
        value={tab}
        onValueChange={onTabChange}
        className="as-tabs"
      >
        <TabsList
          className="as-mode-switch"
          aria-label={copy('Assessment workspace view', 'عرض مساحة التقييم')}
        >
          <TabsTrigger value="evidence">
            <BookOpen size={16} />
            {copy('Evidence', 'الأدلة')}
          </TabsTrigger>
          <TabsTrigger value="assessment">
            <List size={16} />
            {copy('Assessment', 'التقييم')}
          </TabsTrigger>
        </TabsList>
        <ResizablePanelGroup
          orientation="horizontal"
          className="as-panes"
          id={id}
        >
          <ResizablePanel
            defaultSize="62%"
            minSize="420px"
            className="as-evidence-pane"
          >
            <TabsContent value="evidence" forceMount className="as-evidence">
              {evidence}
            </TabsContent>
          </ResizablePanel>
          <ResizableHandle
            withHandle
            className="as-divider"
            aria-label={copy(
              'Resize evidence and assessment',
              'تغيير حجم الأدلة والتقييم',
            )}
          />
          <ResizablePanel
            defaultSize="38%"
            minSize="340px"
            className="as-evaluation-pane"
          >
            <TabsContent
              value="assessment"
              forceMount
              className="as-evaluation"
            >
              {assessment}
            </TabsContent>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Tabs>
    </div>
  );
}
export function AssessmentCriterionPanel({
  locale,
  criteria,
  values,
  index,
  onCriterionChange,
  onChoose,
  onNote,
  disabled,
  onSave,
  saveDisabled,
  onReview,
  reviewDisabled,
  readiness,
  extra,
  feedback,
  noteLabel,
  criterionComplete,
  noteHelp,
  noteInvalid,
}: {
  locale: Locale;
  criteria: ReadonlyArray<RubricCriterionView>;
  values: ReadonlyArray<CriterionValueView>;
  index: number;
  onCriterionChange: (index: number) => void;
  onChoose: (level: AssessmentLevel) => void;
  onNote: (note: string) => void;
  disabled: boolean;
  onSave?: () => void;
  saveDisabled?: boolean;
  onReview: () => void;
  reviewDisabled: boolean;
  readiness: string;
  extra?: ReactNode;
  feedback?: ReactNode;
  noteLabel?: string;
  criterionComplete?: ReadonlyArray<boolean>;
  noteHelp?: string;
  noteInvalid?: boolean;
}) {
  const id = useId(),
    [picker, setPicker] = useState(false),
    opener = useRef<HTMLButtonElement>(null),
    copy = (en: string, ar: string) => t(locale, en, ar),
    c = criteria[index]!,
    v = values[index]!,
    isComplete = (i: number) =>
      criterionComplete?.[i] ?? values[i]!.level !== null,
    done = values.filter((_, i) => isComplete(i)).length,
    anchor = c.anchors.find((a) => a.level === v.level);
  return (
    <section
      className="as-criterion-panel"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <div className="as-progress">
        <span>
          {copy(
            `${done} of ${criteria.length} complete`,
            `${done} من ${criteria.length} مكتملة`,
          )}
        </span>
        <Button ref={opener} variant="ghost" onClick={() => setPicker(true)}>
          <List size={16} />
          {copy('View all criteria', 'عرض جميع المعايير')}
        </Button>
      </div>
      <div className="as-criterion-body">
        <p className="as-kicker" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {copy(
            `Criterion ${index + 1} of ${criteria.length}`,
            `المعيار ${index + 1} من ${criteria.length}`,
          )}
        </p>
        <div className="as-criterion-title">
          <h2 dir={locale === 'ar' ? 'rtl' : 'ltr'}>{c.title}</h2>
          <span dir="ltr">{c.weight}%</span>
        </div>
        <p dir="auto" className="as-intent">
          {c.intent}
        </p>
        <details className="as-guidance">
          <summary>
            {copy('View scoring guidance', 'عرض إرشادات التقييم')}
          </summary>
          {c.guidance && <p dir="auto">{c.guidance}</p>}
          <ol start={0}>
            {c.anchors.map((a) => (
              <li key={a.level}>
                <b>
                  {a.level} · {a.label}
                </b>
                <p dir="auto">{a.detail}</p>
              </li>
            ))}
          </ol>
        </details>
        <fieldset className="as-score-field" disabled={disabled}>
          <legend dir="auto">{copy('Choose a level', 'اختر مستوى')}</legend>
          <RadioGroup
            className="as-levels"
            dir="ltr"
            value={v.level === null ? '' : String(v.level)}
            onValueChange={(value) =>
              onChoose(Number(value) as AssessmentLevel)
            }
            disabled={disabled}
            aria-label={c.title}
            aria-describedby={id + '-anchor'}
          >
            {c.anchors.map((a) => (
              <Label
                className="as-level"
                htmlFor={id + '-' + a.level}
                key={a.level}
                data-selected={v.level === a.level}
              >
                <RadioGroupItem
                  id={id + '-' + a.level}
                  value={String(a.level)}
                  aria-label={a.level + ' · ' + a.label}
                />
                <span aria-hidden="true">{a.level}</span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="as-anchor" id={id + '-anchor'} aria-live="polite">
          <strong>
            {anchor ? anchor.label : copy('Unselected', 'غير محدد')}
          </strong>
          <p dir="auto">
            {anchor
              ? anchor.detail
              : copy(
                  'Read the original evidence, then choose a level. Zero is a deliberate assessment.',
                  'اقرأ الأدلة الأصلية، ثم اختر مستوى. الصفر تقييم متعمد.',
                )}
          </p>
        </div>
        <Label htmlFor={id + '-note'}>
          {noteLabel ??
            copy('Brief note (optional)', 'ملاحظة موجزة (اختيارية)')}
        </Label>
        <Textarea
          id={id + '-note'}
          rows={2}
          value={v.note}
          maxLength={2000}
          disabled={disabled}
          onChange={(e) => onNote(e.target.value)}
          className="as-note"
          aria-describedby={noteHelp ? id + '-note-help' : undefined}
          aria-invalid={noteInvalid || undefined}
        />
        {noteHelp && (
          <p dir="auto" className="as-readiness" id={id + '-note-help'}>
            {noteHelp}
          </p>
        )}
        {extra && <div className="as-extra">{extra}</div>}
        {feedback && <div className="as-feedback">{feedback}</div>}
      </div>
      <footer className="as-criterion-footer">
        <div className="as-pager">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => onCriterionChange(index - 1)}
            aria-label={copy('Previous criterion', 'المعيار السابق')}
          >
            <ArrowLeft size={16} />
            {copy('Previous', 'السابق')}
          </Button>
          <Button
            variant="ghost"
            disabled={index === criteria.length - 1}
            onClick={() => onCriterionChange(index + 1)}
            aria-label={copy('Next criterion', 'المعيار التالي')}
          >
            {copy('Next', 'التالي')}
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="as-completion-actions">
          {onSave && (
            <Button variant="outline" disabled={saveDisabled} onClick={onSave}>
              {copy('Save draft', 'حفظ المسودة')}
            </Button>
          )}
          <Button disabled={reviewDisabled} onClick={onReview}>
            {copy('Review assessment', 'مراجعة التقييم')}
          </Button>
        </div>
        <p dir="auto" className="as-readiness">
          {readiness}
        </p>
      </footer>
      <Sheet open={picker} onOpenChange={setPicker}>
        <SheetContent
          className="wsv2 as-sheet"
          closeLabel={copy('Close criteria', 'إغلاق المعايير')}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {copy('Assessment criteria', 'معايير التقييم')}
            </SheetTitle>
            <SheetDescription>
              {copy(
                'Choose a criterion. Your draft and selected file stay in place.',
                'اختر معيارًا. تبقى مسودتك والملف المختار كما هما.',
              )}
            </SheetDescription>
          </SheetHeader>
          <ol className="as-criteria-list">
            {criteria.map((item, i) => (
              <li key={item.key}>
                <Button
                  variant="ghost"
                  aria-current={i === index ? 'step' : undefined}
                  onClick={() => {
                    onCriterionChange(i);
                    setPicker(false);
                  }}
                  aria-label={copy(
                    `Criterion ${i + 1}: ${item.title}`,
                    `المعيار ${i + 1}: ${item.title}`,
                  )}
                >
                  <span className="as-criterion-number">
                    {isComplete(i) ? <CircleCheck size={18} /> : i + 1}
                  </span>
                  <span>
                    {item.title}
                    <small>
                      {i === index ? copy('Current · ', 'الحالي · ') : ''}
                      {isComplete(i)
                        ? copy('Completed', 'مكتمل')
                        : values[i]!.level === null
                          ? copy('Unselected', 'غير محدد')
                          : copy('Needs details', 'يحتاج تفاصيل')}
                    </small>
                  </span>
                  <b>{item.weight}%</b>
                </Button>
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>
    </section>
  );
}
export function AssessmentSummary({
  locale,
  title,
  total,
  rubric,
  attribution,
  criteria,
  values,
  onEdit,
  children,
  derived = false,
}: {
  locale: Locale;
  title: string;
  total: string | null;
  rubric: string;
  attribution?: ReactNode;
  criteria: ReadonlyArray<RubricCriterionView>;
  values: ReadonlyArray<CriterionValueView>;
  onEdit?: (index: number) => void;
  children?: ReactNode;
  derived?: boolean;
}) {
  const copy = (en: string, ar: string) => t(locale, en, ar);
  return (
    <section className="as-summary" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="as-summary-header">
        <div>
          <p className="as-kicker" dir="ltr">
            {rubric}
          </p>
          <h2 dir="auto">{title}</h2>
          {attribution && <p dir="auto">{attribution}</p>}
        </div>
        <div className="as-total">
          {total === null ? (
            <span dir="auto">{copy('Not available', 'غير متاح')}</span>
          ) : (
            <>
              <strong dir="ltr">{formatScore(total, locale)}</strong>
              <span>/100</span>
            </>
          )}
        </div>
      </header>
      <ol className="as-summary-criteria">
        {criteria.map((c, i) => {
          const v = values[i]!,
            a = derived
              ? undefined
              : c.anchors.find((a) => a.level === v.level);
          return (
            <li key={c.key}>
              <div className="as-summary-row">
                <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                  <h3 dir="auto">{c.title}</h3>
                  <span>
                    {c.weight}% ·{' '}
                    {derived
                      ? copy('Derived mean level', 'متوسط مستوى محتسب')
                      : (a?.label ?? copy('Unselected', 'غير محدد'))}
                  </span>
                </div>
                <b
                  dir={v.level === null ? 'auto' : 'ltr'}
                  data-unavailable={v.level === null || undefined}
                >
                  {v.level === null ? (
                    copy('Unselected', 'غير محدد')
                  ) : (
                    <>
                      {derived ? formatScore(v.level, locale) : v.level}
                      <small>/4</small>
                    </>
                  )}
                </b>
                {onEdit && (
                  <Button
                    variant="ghost"
                    onClick={() => onEdit(i)}
                    aria-label={copy(
                      `Edit criterion ${i + 1}`,
                      `تحرير المعيار ${i + 1}`,
                    )}
                  >
                    {copy('Edit', 'تحرير')}
                  </Button>
                )}
              </div>
              {v.note && (
                <p className="as-summary-note" dir="auto">
                  {v.note}
                </p>
              )}
              {a && (
                <details>
                  <summary>{copy('Scoring anchor', 'وصف المستوى')}</summary>
                  <p dir="auto">{a.detail}</p>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      {children && <div className="as-summary-end">{children}</div>}
    </section>
  );
}
