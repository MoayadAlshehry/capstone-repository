'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSite, type Project } from './model.js';
const initials = (name: string) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
/** Attribution uses a count rule in SSR and the browser; width never changes which names are shown. */
export function AuthorCredit({ p }: { p: Project; all?: boolean }) {
  const { href, l, ar, integration } = useSite(),
    id = useId(),
    root = useRef<HTMLDivElement>(null),
    details = useRef<HTMLDetailsElement>(null),
    trigger = useRef<HTMLElement>(null),
    panel = useRef<HTMLDivElement>(null),
    opened = useRef(false),
    projectScope = useRef(p.id + ':' + p.authors.length),
    [open, setOpen] = useState(false),
    [enhanced, setEnhanced] = useState(false);
  const contains = (target: EventTarget | null) =>
    target instanceof Node &&
    !!(
      root.current?.contains(target) ||
      details.current?.contains(target) ||
      panel.current?.contains(target)
    );
  function close(restore = false) {
    if (enhanced && panel.current?.matches(':popover-open'))
      panel.current.hidePopover();
    if (details.current) details.current.open = false;
    opened.current = false;
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  }
  function position() {
    if (!opened.current || !panel.current || !trigger.current) return;
    if (
      typeof panel.current.showPopover !== 'function' ||
      !panel.current.matches(':popover-open')
    )
      return;
    const viewport = window.visualViewport,
      left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0,
      width = viewport?.width ?? innerWidth,
      height = viewport?.height ?? innerHeight,
      anchor = trigger.current.getBoundingClientRect();
    if (anchor.bottom < top || anchor.top > top + height) {
      close();
      return;
    }
    panel.current.style.inlineSize =
      Math.max(0, Math.min(320, width - 32)) + 'px';
    panel.current.style.maxBlockSize = Math.max(0, height - 32) + 'px';
    const box = panel.current.getBoundingClientRect(),
      start = ar ? anchor.right - box.width : anchor.left;
    panel.current.style.left =
      Math.max(left + 16, Math.min(start, left + width - box.width - 16)) +
      'px';
    panel.current.style.top =
      (anchor.bottom + 8 + box.height <= top + height - 16
        ? anchor.bottom + 8
        : Math.max(top + 16, anchor.top - box.height - 8)) + 'px';
  }
  function show() {
    if (!details.current || !trigger.current?.getClientRects().length) return;
    document.dispatchEvent(new CustomEvent('cr-ds:authors', { detail: id }));
    details.current.open = true;
    if (enhanced && !panel.current?.matches(':popover-open'))
      panel.current?.showPopover();
    opened.current = true;
    setOpen(true);
    position();
    requestAnimationFrame(() => requestAnimationFrame(position));
  }
  useEffect(() => {
    if (details.current?.open) {
      opened.current = true;
      setOpen(true);
    }
    setEnhanced('showPopover' in HTMLElement.prototype);
  }, []);
  useLayoutEffect(() => {
    if (open && enhanced) {
      if (!panel.current?.matches(':popover-open'))
        panel.current?.showPopover();
      position();
    }
  }, [open, enhanced, ar]);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
        if (opened.current && !contains(e.target)) close();
      },
      another = (e: Event) => {
        if ((e as CustomEvent).detail !== id && opened.current) close();
      },
      resize = () => {
        if (opened.current) position();
      };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('cr-ds:authors', another);
    addEventListener('resize', resize);
    addEventListener('scroll', resize, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (panel.current) observer?.observe(panel.current);
    if (trigger.current) observer?.observe(trigger.current);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('cr-ds:authors', another);
      removeEventListener('resize', resize);
      removeEventListener('scroll', resize, true);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      observer?.disconnect();
    };
  }, [id, ar, enhanced, p.authors.length]);
  useEffect(() => {
    const next = p.id + ':' + p.authors.length;
    if (projectScope.current !== next) {
      close();
      projectScope.current = next;
    }
  }, [p.id, p.authors.length]);
  const names = (popup = false) => (
    <ol
      className={
        'author-names ' + (popup ? 'credit-popup-names' : 'credit-inline')
      }
      aria-label={l('Project authors', 'مؤلفو المشروع')}
      dir={ar ? 'rtl' : 'ltr'}
    >
      {p.authors.map((a, index) => (
        <li key={p.id + ':' + index}>
          <a href={href('catalogue', undefined, { author: a.name })}>
            <span className="avatar" aria-hidden="true">
              {integration?.avatar?.(p, index, a.name) ?? initials(a.name)}
            </span>
            <bdi dir="auto">{a.name}</bdi>
          </a>
        </li>
      ))}
    </ol>
  );
  if (!p.authors.length)
    return (
      <span className="author-unlisted" dir={ar ? 'rtl' : 'ltr'}>
        {l('Authors not listed', 'لم تُدرج أسماء المؤلفين')}
      </span>
    );
  if (p.authors.length <= 4)
    return (
      <div
        ref={root}
        className="byline author-credit credit-full"
        data-count={p.authors.length}
        data-authors={p.authors.map((a) => a.name).join('|')}
      >
        {names()}
      </div>
    );
  return (
    <details
      ref={details}
      className="byline author-credit credit-adaptive"
      data-count={p.authors.length}
      data-enhanced={enhanced || undefined}
      data-authors={p.authors.map((a) => a.name).join('|')}
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          opened.current = false;
          setOpen(false);
          if (enhanced && panel.current?.matches(':popover-open'))
            panel.current.hidePopover();
        } else if (!enhanced) {
          opened.current = true;
          setOpen(true);
        }
      }}
      onBlur={(e) => {
        if (opened.current && !contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && opened.current) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <summary
        ref={trigger}
        className="author-trigger"
        dir="ltr"
        aria-label={l(
          'Show all ' +
            new Intl.NumberFormat('en').format(p.authors.length) +
            ' authors',
          'عرض جميع المؤلفين (' +
            new Intl.NumberFormat('ar-u-nu-arab').format(p.authors.length) +
            ')',
        )}
        aria-expanded={enhanced ? open : undefined}
        aria-controls={id}
        onClick={(e) => {
          if (enhanced) {
            e.preventDefault();
            if (opened.current) close();
            else show();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            show();
            requestAnimationFrame(() =>
              panel.current?.querySelector<HTMLAnchorElement>('a')?.focus(),
            );
          }
        }}
      >
        <span className="avatar-stack" aria-hidden="true">
          {p.authors.map((a, index) => (
            <span className="avatar" key={p.id + ':' + index}>
              {integration?.avatar?.(p, index, a.name) ?? initials(a.name)}
            </span>
          ))}
        </span>
        <bdi className="credit-count" aria-hidden="true">
          {new Intl.NumberFormat(ar ? 'ar-u-nu-arab' : 'en').format(
            p.authors.length,
          )}
        </bdi>
        <svg
          className="credit-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div
        ref={panel}
        id={id}
        popover={enhanced ? 'manual' : undefined}
        data-open={open}
        className="author-popover"
        role="region"
        aria-labelledby={id + '-title'}
        dir={ar ? 'rtl' : 'ltr'}
      >
        <h4 dir="auto" id={id + '-title'}>
          {l('Project authors', 'مؤلفو المشروع')}
        </h4>
        {names(true)}
      </div>
    </details>
  );
}
