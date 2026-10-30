'use client';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  defaultFile,
  fileEntries,
  fileSharePath,
  type Locale,
  type PublicFileItem,
  type PublicPreview,
} from './core';
export function usePublicReadingRoom({
  locale,
  project,
  version,
  files,
}: {
  locale: Locale;
  project: string;
  version: string;
  files: PublicFileItem[];
  error?: boolean;
}) {
  const t = useTranslations('Archive'),
    query = useSearchParams(),
    pathname = usePathname(),
    explicit = query.get('file'),
    initial = explicit
      ? files.find((f) => f.id === explicit)
      : defaultFile(files),
    [selected, setSelected] = useState(initial?.id ?? ''),
    [folder, setFolder] = useState(
      query.get('directory') ??
        (explicit
          ? (initial?.path.split('/').slice(0, -1).join('/') ?? '')
          : ''),
    ),
    [search, setSearch] = useState(''),
    [tab, setTab] = useState(explicit ? 'preview' : 'files'),
    [wide, setWide] = useState(false),
    [reading, setReading] = useState(false),
    [near, setNear] = useState(!!explicit),
    [preview, setPreview] = useState<{
      key: string;
      data: PublicPreview;
    } | null>(null),
    [state, setState] = useState<
      'idle' | 'loading' | 'loaded' | 'failed' | 'unavailable'
    >(explicit && !initial ? 'unavailable' : 'idle'),
    [retry, setRetry] = useState(0),
    [imageFit, setImageFit] = useState(true),
    [csvHead, setCsvHead] = useState(true),
    [pdfView, setPdfView] = useState({
      page: 1,
      zoom: 1,
      fit: 'width' as 'width' | 'page',
    }),
    [zipState, setZipState] = useState('');
  const section = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    nav = useRef<HTMLDivElement>(null),
    navScroll = useRef(0),
    activated = useRef(false),
    retainOnClear = useRef(false),
    urlActivation = useRef<string | null>(null),
    selection = files.find((f) => f.id === selected),
    entries = fileEntries(files, folder, search),
    base = '/api/public-files?' + new URLSearchParams({ project, version }),
    key = project + ':' + version + ':' + selected,
    asset = base + '&mode=asset&file=' + encodeURIComponent(selected),
    original = base + '&mode=original&file=' + encodeURIComponent(selected),
    data = preview?.key === key ? preview.data : null;
  useEffect(() => {
    const node = section.current;
    if (!node) return;
    const update = () =>
      setWide(
        node.clientWidth >= 900 &&
          window.innerHeight >= 650 &&
          parseFloat(getComputedStyle(node).fontSize) <= 20,
      );
    const o = new ResizeObserver(update);
    o.observe(node);
    window.addEventListener('resize', update);
    const i = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '240px' },
    );
    i.observe(node);
    return () => {
      o.disconnect();
      window.removeEventListener('resize', update);
      i.disconnect();
    };
  }, []);
  useEffect(() => {
    if (!explicit && retainOnClear.current) {
      retainOnClear.current = false;
      return;
    }
    const id = explicit
      ? files.find((f) => f.id === explicit)?.id
      : defaultFile(files)?.id;
    if (explicit && urlActivation.current !== explicit) {
      setFolder(
        files
          .find((f) => f.id === explicit)
          ?.path.split('/')
          .slice(0, -1)
          .join('/') ?? '',
      );
      setSearch('');
    }
    urlActivation.current = null;
    setSelected(id ?? '');
    setPreview(null);
    setState(explicit && !id ? 'unavailable' : 'idle');
    if (explicit) setNear(true);
    setTab(explicit ? 'preview' : 'files');
    setPdfView({ page: 1, zoom: 1, fit: 'width' });
    setCsvHead(true);
  }, [explicit, project, version]);
  useEffect(() => {
    if (!near || !selected) return;
    const controller = new AbortController();
    setPreview(null);
    setState('loading');
    void (async () => {
      try {
        const response = await fetch(
          base + '&mode=preview&file=' + encodeURIComponent(selected),
          { cache: 'no-store', signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!response.ok) {
          if ([403, 404].includes(response.status)) {
            setState('unavailable');
            return;
          }
          throw Error();
        }
        const result = (await response.json()) as PublicPreview;
        if (result.meta.id !== selected) throw Error();
        if (!controller.signal.aborted) {
          setPreview({ key, data: result });
          setState('loaded');
        }
      } catch {
        if (!controller.signal.aborted) setState('failed');
      }
    })();
    return () => controller.abort();
  }, [key, near, retry]);
  useEffect(() => {
    if (activated.current && tab === 'preview') {
      focusReader(heading.current);
    }
    if (tab === 'files' && nav.current)
      nav.current.scrollTop = navScroll.current;
  }, [tab, selected, wide, reading]);
  function focusReader(node: HTMLHeadingElement | null) {
    if (!node || !activated.current) return;
    requestAnimationFrame(() => {
      if (!node.isConnected || !activated.current) return;
      node.focus({ preventScroll: true });
      activated.current = false;
      if (!wide)
        section.current?.scrollIntoView({
          block: 'start',
          behavior: 'instant',
        });
    });
  }
  function select(file: string) {
    urlActivation.current = file;
    navScroll.current = nav.current?.scrollTop ?? navScroll.current;
    activated.current = true;
    setNear(true);
    setSelected(file);
    setTab('preview');
    setPreview(null);
    setState('loading');
    setPdfView({ page: 1, zoom: 1, fit: 'width' });
    const p = new URLSearchParams(query.toString());
    p.delete('directory');
    p.set('file', file);
    history.pushState(null, '', pathname + '?' + p + '#public-files');
    if (file === selected) setRetry((n) => n + 1);
  }
  function back() {
    setTab('files');
    if (explicit) {
      retainOnClear.current = true;
      const p = new URLSearchParams(query.toString());
      p.delete('file');
      history.replaceState(
        null,
        '',
        pathname + (p.size ? '?' + p : '') + '#public-files',
      );
    }
    requestAnimationFrame(() =>
      nav.current
        ?.querySelector<HTMLElement>('[aria-current=true] .lra-file-select')
        ?.focus(),
    );
  }
  async function downloadZip(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    if (zipState === t('files.zipPreparing')) return;
    setZipState(t('files.zipPreparing'));
    try {
      const response = await fetch(base + '&mode=zip', {
        method: 'HEAD',
        cache: 'no-store',
      });
      if (!response.ok) throw Error();
      setZipState(t('files.zipFormat'));
      location.assign(base + '&mode=zip');
    } catch {
      setZipState(t('files.zipFailed'));
    }
  }
  function resolve(value: string, image: boolean) {
    if (value.startsWith('#')) return value;
    if (/^https?:\/\//i.test(value)) return image ? '' : value;
    if (
      /[\\\u0000-\u001f]/u.test(value) ||
      /^[a-z][a-z0-9+.-]*:/i.test(value) ||
      value.startsWith('//')
    )
      return '';
    try {
      const path = decodeURIComponent(
          new URL(value, 'https://public.invalid/' + (selection?.path ?? ''))
            .pathname,
        ).slice(1),
        match = files.find((f) => f.path === path);
      if (!match || (image && !/^image\/(png|jpeg|webp)$/.test(match.mime)))
        return '';
      return image
        ? base + '&mode=asset&file=' + match.id
        : fileSharePath(locale, project, match.id);
    } catch {
      return '';
    }
  }
  return {
    t,
    selected,
    folder,
    setFolder,
    search,
    setSearch,
    tab,
    setTab,
    wide,
    reading,
    setReading,
    near,
    setNear,
    state,
    setState,
    retry,
    setRetry,
    imageFit,
    setImageFit,
    csvHead,
    setCsvHead,
    pdfView,
    setPdfView,
    zipState,
    section,
    heading,
    nav,
    selection,
    entries,
    base,
    key,
    asset,
    original,
    data,
    select,
    back,
    downloadZip,
    resolve,
    focusReader,
  };
}
