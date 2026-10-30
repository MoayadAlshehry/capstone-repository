'use client';
import { useId, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  List,
  CircleCheck,
  Button,
  Label,
  RadioGroup,
  RadioGroupItem,
  Textarea,
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../workspace-v2/index.js';
import type { ReactNode } from 'react';
import type {
  RubricCriterionView,
  CriterionValueView,
  AssessmentLevel,
} from '../workspace-v2/assessment.js';
import { ScopedSheetContent as SheetContent } from './overlays.js';
type Locale = 'en' | 'ar';
const t = (locale: Locale, en: string, ar: string) =>
  locale === 'ar' ? ar : en;
export function CriterionPanel({
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
}) {
  const id = useId(),
    [picker, setPicker] = useState(false),
    opener = useRef<HTMLButtonElement>(null),
    copy = (en: string, ar: string) => t(locale, en, ar),
    c = criteria[index]!,
    v = values[index]!,
    done = values.filter((x) => x.level !== null).length,
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
        />
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
                    {values[i]!.level !== null ? (
                      <CircleCheck size={18} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span>
                    {item.title}
                    <small>
                      {i === index ? copy('Current · ', 'الحالي · ') : ''}
                      {values[i]!.level !== null
                        ? copy('Completed', 'مكتمل')
                        : copy('Unselected', 'غير محدد')}
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
