'use client';
import { useState, useEffect, useId } from 'react';
import {
  Button,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  ChevronsUpDown,
  Check,
} from '@capstone/ui/workspace-v2';
import { t, type Locale } from './common';
interface Faculty {
  id: string;
  name: string;
  email: string;
  department: string;
  status: string;
}
export function FacultyPicker({
  locale,
  department,
  value,
  onSelect,
  disabled = false,
  invalid = false,
}: {
  locale: Locale;
  department: string;
  value: string;
  onSelect: (x: Faculty) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(''),
    [rows, setRows] = useState<Faculty[]>([]),
    [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'),
    [retry, setRetry] = useState(0),
    [index, setIndex] = useState(0),
    listId = useId();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setState('loading');
    setRows([]);
    setIndex(0);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          '/api/project-onboarding?faculty=1&department=' +
            encodeURIComponent(department) +
            '&q=' +
            encodeURIComponent(q),
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw Error();
        const data = (await response.json()) as { rows: Faculty[] };
        setRows(data.rows);
        setState('ready');
      } catch {
        if (!controller.signal.aborted) setState('error');
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, q, department, retry]);
  const choose = (x: Faculty) => {
    if (state !== 'ready' || x.status === 'suspended') return;
    onSelect(x);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="po-faculty-trigger"
          variant="outline"
          type="button"
          id="po-faculty-picker"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'po-supervisor-error' : undefined}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          disabled={disabled}
          aria-label={t(
            locale,
            'Select existing faculty supervisor',
            'اختيار مشرف حالي',
          )}
        >
          <span>
            <bdi dir="auto">
              {value ||
                t(
                  locale,
                  'Search faculty by name or email',
                  'ابحث عن مشرف بالاسم أو البريد',
                )}
            </bdi>
          </span>
          <ChevronsUpDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="wsv2 po-faculty-popover"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={rows[index] ? listId + '-' + index : undefined}
          aria-autocomplete="list"
          aria-label={t(locale, 'Search faculty', 'بحث المشرفين')}
          value={q}
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (state !== 'ready') return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(rows.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (rows[index]) choose(rows[index]!);
            }
          }}
        />
        <div role="status" className="po-search-state">
          {state === 'loading'
            ? t(locale, 'Searching your university…', 'جارٍ البحث في جامعتك…')
            : state === 'error'
              ? t(
                  locale,
                  'Unable to load faculty. Retry or change the search.',
                  'تعذر تحميل المشرفين. أعد المحاولة أو غيّر البحث.',
                )
              : rows.length === 0
                ? t(
                    locale,
                    'No matching faculty. You can invite a new supervisor.',
                    'لا يوجد مشرف مطابق. يمكنك دعوة مشرف جديد.',
                  )
                : t(
                    locale,
                    'Choose one faculty supervisor.',
                    'اختر مشرفًا واحدًا.',
                  )}
        </div>
        {state === 'error' && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setRetry((n) => n + 1)}
          >
            {t(locale, 'Retry search', 'إعادة محاولة البحث')}
          </Button>
        )}
        <ul
          id={listId}
          role="listbox"
          aria-label={t(locale, 'University faculty', 'مشرفو الجامعة')}
        >
          {rows.map((x, i) => (
            <li
              key={x.id}
              id={listId + '-' + i}
              role="option"
              aria-selected={i === index}
              aria-disabled={x.status === 'suspended'}
              onMouseEnter={() => setIndex(i)}
            >
              <button
                type="button"
                disabled={x.status === 'suspended'}
                onClick={() => choose(x)}
              >
                <div>
                  <strong>
                    <bdi dir="auto">{x.name}</bdi>
                  </strong>
                  <span dir="ltr">{x.email}</span>
                  <small>
                    {x.department} ·{' '}
                    {x.status === 'active'
                      ? t(locale, 'Active', 'نشط')
                      : x.status === 'inactive'
                        ? t(locale, 'Setup pending', 'بانتظار الإعداد')
                        : t(
                            locale,
                            'Suspended: unavailable',
                            'موقوف: غير متاح',
                          )}
                  </small>
                </div>
                {value === x.name && <Check />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
