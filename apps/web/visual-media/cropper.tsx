'use client';
import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { Button, RotateCcw, Move } from '@capstone/ui/workspace-v2';
import {
  visualCrop,
  centeredFraming,
  visualAspectRatio,
  type VisualFraming,
} from '@capstone/domain';

export function ImageFraming({
  src,
  kind,
  locale,
  framing,
  onChange,
  onReady,
  onError,
  disabled,
}: {
  src: string;
  kind: 'cover' | 'avatar';
  locale: 'en' | 'ar';
  framing: VisualFraming;
  onChange: (value: VisualFraming) => void;
  onReady: () => void;
  onError: () => void;
  disabled: boolean;
}) {
  const [dimensions, setDimensions] = useState<{
      width: number;
      height: number;
    } | null>(null),
    [dragging, setDragging] = useState(false),
    drag = useRef<{ x: number; y: number; frame: VisualFraming } | null>(null),
    zoomControl = useRef<HTMLInputElement>(null),
    id = useId(),
    copy = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const crop = dimensions
      ? visualCrop(dimensions.width, dimensions.height, kind, framing)
      : null,
    overflowX = dimensions && crop ? dimensions.width / crop.width - 1 : 0,
    overflowY = dimensions && crop ? dimensions.height / crop.height - 1 : 0;
  useEffect(() => {
    if (dimensions) zoomControl.current?.focus({ preventScroll: true });
  }, [dimensions]);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (
      !drag.current ||
      disabled ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    const box = event.currentTarget.getBoundingClientRect(),
      start = drag.current,
      clamp = (v: number) => Math.min(1, Math.max(0, v));
    onChange({
      ...framing,
      x:
        overflowX > 0
          ? clamp(
              start.frame.x - (event.clientX - start.x) / box.width / overflowX,
            )
          : 0.5,
      y:
        overflowY > 0
          ? clamp(
              start.frame.y -
                (event.clientY - start.y) / box.height / overflowY,
            )
          : 0.5,
    });
  }
  const controls = [
    {
      key: 'zoom' as const,
      label: copy('Zoom', 'التكبير'),
      min: 1,
      max: 3,
      step: 0.01,
      value: framing.zoom.toFixed(2) + '×',
    },
    {
      key: 'x' as const,
      label: copy('Horizontal position', 'الموضع الأفقي'),
      min: 0,
      max: 1,
      step: 0.01,
      value: Math.round(framing.x * 100) + '%',
    },
    {
      key: 'y' as const,
      label: copy('Vertical position', 'الموضع العمودي'),
      min: 0,
      max: 1,
      step: 0.01,
      value: Math.round(framing.y * 100) + '%',
    },
  ];
  return (
    <div className="visual-framing">
      <div className="visual-preview-dock">
        <div className="visual-frame-meta">
          <span dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            {copy(
              kind === 'cover' ? 'Landscape cover' : 'Square photo',
              kind === 'cover' ? 'غلاف أفقي' : 'صورة مربعة',
            )}
          </span>
          <bdi>{kind === 'cover' ? '16:10' : '1:1'}</bdi>
        </div>
        <div
          className={
            'visual-frame ' + (kind === 'avatar' ? 'visual-frame-avatar' : '')
          }
          style={{ aspectRatio: visualAspectRatio[kind] }}
          data-dragging={dragging}
          data-disabled={disabled}
          role="img"
          aria-label={copy(
            'Selected image framing preview',
            'معاينة تأطير الصورة المختارة',
          )}
          aria-describedby={id}
          onPointerDown={(event) => {
            if (disabled || !dimensions) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              frame: { ...framing },
            };
            setDragging(true);
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            drag.current = null;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            style={
              dimensions && crop
                ? {
                    width: (dimensions.width / crop.width) * 100 + '%',
                    height: (dimensions.height / crop.height) * 100 + '%',
                    left: (-crop.left / crop.width) * 100 + '%',
                    top: (-crop.top / crop.height) * 100 + '%',
                  }
                : { visibility: 'hidden' }
            }
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
              onReady();
            }}
            onError={onError}
          />
          <span className="visual-frame-guides" aria-hidden="true" />
          {kind === 'avatar' && (
            <span className="visual-frame-circle" aria-hidden="true" />
          )}
        </div>
      </div>
      <p
        id={id}
        className="visual-framing-hint"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <Move size={15} aria-hidden="true" />
        {copy(
          'Drag or use the sliders. Zoom to reveal more positioning space.',
          'اسحب أو استخدم المؤشرات. كبّر لتحريك أوسع.',
        )}
      </p>
      {crop && crop.width < (kind === 'cover' ? 640 : 128) && (
        <p className="visual-editor-help" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {copy(
            'Small crop. A larger image will look sharper.',
            'اقتصاص صغير. الصورة الأكبر أوضح.',
          )}
        </p>
      )}
      <fieldset
        className="visual-frame-controls"
        disabled={disabled || !dimensions}
      >
        <legend dir="auto" className="sr-only">
          {copy('Image framing controls', 'عناصر التحكم في تأطير الصورة')}
        </legend>
        {controls.map((control) => (
          <label key={control.key} className="visual-range" dir="ltr">
            <span dir={locale === 'ar' ? 'rtl' : 'ltr'}>{control.label}</span>
            <output dir="ltr">{control.value}</output>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={framing[control.key]}
              disabled={disabled || !dimensions}
              ref={control.key === 'zoom' ? zoomControl : undefined}
              aria-label={control.label}
              aria-valuetext={control.value}
              onChange={(event) =>
                onChange({
                  ...framing,
                  [control.key]: Number(event.target.value),
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <Button
        type="button"
        variant="ghost"
        className="visual-frame-reset"
        disabled={
          disabled ||
          (framing.x === 0.5 && framing.y === 0.5 && framing.zoom === 1)
        }
        onClick={() => onChange({ ...centeredFraming })}
      >
        <RotateCcw size={14} aria-hidden="true" />
        {copy('Reset framing', 'إعادة ضبط التأطير')}
      </Button>
    </div>
  );
}
