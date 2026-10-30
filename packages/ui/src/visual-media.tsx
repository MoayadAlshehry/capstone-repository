'use client';
import { coverScenes, coverSceneIndex, visualHash } from './cover-scenes.js';
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
/** Keep addresses intact while preferring punctuation boundaries on narrow identity rows. */
export function IdentityEmail({ email }: { email: string }) {
  return (
    <bdi dir="ltr">
      {email.split(/([.@])/u).map((part, index) => (
        <Fragment key={index}>
          {part}
          {(part === '.' || part === '@') && <wbr />}
        </Fragment>
      ))}
    </bdi>
  );
}

export interface VisualTargetView {
  kind: 'cover' | 'avatar';
  project?: string;
  version?: string;
  submission?: string;
  user?: string;
  published?: boolean;
  person?: 'author' | 'supervisor';
  order?: number;
  grant?: string;
}
export interface VisualImageView {
  id: string;
  width: number;
  height: number;
  smallWidth: number;
  smallHeight: number;
  src: string;
  smallSrc: string;
}
export interface VisualStateView {
  image: VisualImageView | null;
  revision: number;
  canEdit: boolean;
}
type Entry = {
  status: 'loading' | 'ready' | 'error';
  data: VisualStateView | null;
};
const keyOf = (target: VisualTargetView) =>
  JSON.stringify(target, Object.keys(target).sort());
const isId = (value: string | undefined) =>
  !!value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const Context = createContext<{
  entries: Record<string, Entry>;
  epoch: number;
  request: (t: VisualTargetView) => void;
  refresh: () => void;
  publish: (t: VisualTargetView, s: VisualStateView) => void;
} | null>(null);
export function VisualMediaProvider({
  children,
  resolve,
}: {
  children: ReactNode;
  resolve: (targets: VisualTargetView[]) => Promise<(VisualStateView | null)[]>;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({}),
    [epoch, setEpoch] = useState(0),
    cache = useRef(new Map<string, VisualTargetView>()),
    queue = useRef(new Map<string, VisualTargetView>()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0),
    suspended = useRef(false),
    resolveRef = useRef(resolve),
    channel = useRef<BroadcastChannel | null>(null);
  resolveRef.current = resolve;
  const flush = useCallback(async () => {
    timer.current = null;
    const batch = [...queue.current.entries()].slice(0, 50);
    for (const [key] of batch) queue.current.delete(key);
    if (!batch.length || suspended.current) return;
    const run = generation.current;
    try {
      const result = await resolveRef.current(batch.map(([, t]) => t));
      if (run !== generation.current) return;
      setEntries((old) => ({
        ...old,
        ...Object.fromEntries(
          batch.map(([key], i) => [
            key,
            { status: 'ready', data: result[i] ?? null },
          ]),
        ),
      }));
    } catch {
      if (run === generation.current)
        setEntries((old) => ({
          ...old,
          ...Object.fromEntries(
            batch.map(([key]) => [
              key,
              { status: 'error', data: old[key]?.data ?? null },
            ]),
          ),
        }));
    }
    if (queue.current.size) timer.current = setTimeout(() => void flush(), 0);
  }, []);
  const request = useCallback(
    (target: VisualTargetView) => {
      const key = keyOf(target);
      if (cache.current.has(key) || suspended.current) return;
      cache.current.set(key, target);
      queue.current.set(key, target);
      setEntries((old) => ({
        ...old,
        [key]: { status: 'loading', data: null },
      }));
      if (!timer.current) timer.current = setTimeout(() => void flush(), 0);
    },
    [flush],
  );
  const refresh = useCallback(() => {
    if (suspended.current) return;
    generation.current++;
    for (const [key, target] of cache.current) queue.current.set(key, target);
    if (!timer.current) timer.current = setTimeout(() => void flush(), 0);
  }, [flush]);
  const publish = useCallback(
    (target: VisualTargetView, state: VisualStateView) => {
      setEntries((old) => ({
        ...old,
        [keyOf(target)]: { status: 'ready', data: state },
      }));
      refresh();
      channel.current?.postMessage('changed');
    },
    [refresh],
  );
  useEffect(() => {
    const clear = () => {
      generation.current++;
      suspended.current = true;
      cache.current.clear();
      queue.current.clear();
      setEntries({});
    };
    const show = () => {
      suspended.current = false;
      setEpoch((n) => n + 1);
      refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('account-draft-cleared', clear);
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', show);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('capstone-visual-media');
      channel.current.onmessage = refresh;
    }
    return () => {
      generation.current++;
      if (timer.current) clearTimeout(timer.current);
      channel.current?.close();
      window.removeEventListener('account-draft-cleared', clear);
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', show);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ entries, epoch, request, refresh, publish }}>
      {children}
    </Context.Provider>
  );
}
export function useVisualMedia(target?: VisualTargetView) {
  const context = useContext(Context),
    key = target ? keyOf(target) : '';
  useEffect(() => {
    if (target) context?.request(target);
  }, [key, context?.epoch, context?.request]);
  return {
    status: context?.entries[key]?.status ?? 'loading',
    data: context?.entries[key]?.data ?? null,
    refresh: context?.refresh ?? (() => {}),
    publish: context?.publish ?? (() => {}),
  };
}
export function visualVariant(seed: string) {
  return visualHash(seed) % 4;
}
export function visualInitials(name: string) {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  return [words[0], words.length > 1 ? words.at(-1) : undefined]
    .filter(Boolean)
    .map((w) => Array.from(w!)[0])
    .join('')
    .toLocaleUpperCase('en');
}
function safeImage(image: VisualImageView | null) {
  return image &&
    image.src.startsWith('/api/visual-media/image?') &&
    image.smallSrc.startsWith('/api/visual-media/image?')
    ? image
    : null;
}
function MediaPixels({
  image,
  small,
  eager,
  alt = '',
  sizes,
}: {
  image: VisualImageView | null;
  small?: boolean;
  eager?: boolean;
  alt?: string | undefined;
  sizes?: string;
}) {
  const source = safeImage(image),
    context = useContext(Context),
    [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading'),
    pixels = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const node = pixels.current;
    if (node?.complete && node.naturalWidth > 0) setState('ready');
    else if (node?.complete && node.naturalWidth === 0) setState('failed');
  }, [source?.src, small]);
  if (!source || state === 'failed') return null;
  return (
    <img
      ref={pixels}
      className="visual-pixels"
      data-ready={state === 'ready'}
      src={small ? source.smallSrc : source.src}
      srcSet={
        !small && source.width !== source.smallWidth
          ? `${source.smallSrc} ${source.smallWidth}w, ${source.src} ${source.width}w`
          : undefined
      }
      sizes={
        !small
          ? (sizes ??
            '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 800px')
          : undefined
      }
      width={small ? source.smallWidth : source.width}
      height={small ? source.smallHeight : source.height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setState('ready')}
      onError={() => {
        setState('failed');
        context?.refresh();
      }}
    />
  );
}
export function DefaultProjectCover({ seed }: { seed: string }) {
  const variant = coverSceneIndex(seed),
    scene = coverScenes[variant]!;
  return (
    <svg
      className="visual-cover-art"
      data-variant={variant}
      data-scene={scene.id}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="1600" height="1000" className="edition-canvas" />
      {scene.plates.map((plate, i) => (
        <path
          key={i}
          d={plate.d}
          className={
            'edition-' + plate.tone + ('line' in plate ? ' edition-line' : '')
          }
          opacity={'opacity' in plate ? plate.opacity : undefined}
        />
      ))}
    </svg>
  );
}
export function ProjectCover({
  projectId,
  versionId,
  submission,
  grant,
  published = false,
  className = '',
  eager = false,
  image: provided,
}: {
  projectId?: string | undefined;
  versionId?: string | undefined;
  submission?: string | undefined;
  grant?: string | undefined;
  published?: boolean;
  className?: string | undefined;
  eager?: boolean;
  image?: VisualImageView | null;
}) {
  const target: VisualTargetView | undefined = isId(projectId)
    ? {
        kind: 'cover',
        project: projectId!,
        ...(versionId ? { version: versionId } : {}),
        ...(submission ? { submission } : {}),
        ...(grant ? { grant } : {}),
        ...(published ? { published: true } : {}),
      }
    : undefined;
  const media = useVisualMedia(target),
    image = provided === undefined ? (media.data?.image ?? null) : provided;
  return (
    <div
      className={'visual-cover ' + className}
      data-media-state={image ? 'identity-known' : media.status}
      aria-hidden="true"
    >
      <MediaPixels key={image?.src ?? 'default'} image={image} eager={eager} />
    </div>
  );
}
export function PersonAvatar({
  name,
  userId,
  projectId,
  versionId,
  submission,
  published,
  person,
  order,
  size = 'md',
  className = '',
}: {
  name: string;
  userId?: string | undefined;
  projectId?: string | undefined;
  versionId?: string | undefined;
  submission?: string | undefined;
  published?: boolean;
  person?: 'author' | 'supervisor';
  order?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string | undefined;
}) {
  const target: VisualTargetView | undefined =
    published && isId(projectId) && person
      ? {
          kind: 'avatar',
          project: projectId!,
          published: true,
          person,
          ...(order ? { order } : {}),
          ...(versionId ? { version: versionId } : {}),
        }
      : isId(userId)
        ? {
            kind: 'avatar',
            user: userId!,
            ...(projectId ? { project: projectId } : {}),
            ...(versionId ? { version: versionId } : {}),
            ...(submission ? { submission } : {}),
          }
        : undefined;
  const media = useVisualMedia(target),
    initials = visualInitials(name);
  return (
    <span
      className={`visual-avatar visual-avatar-${size} visual-avatar-tone-${visualVariant(name)} ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" focusable="false" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="currentColor" opacity=".1" />
        <path
          d="M6 44A29 29 0 0 0 53 11"
          fill="none"
          stroke="currentColor"
          opacity=".22"
          strokeWidth="2"
        />
      </svg>
      {initials ? (
        <span className="visual-avatar-initials">{initials}</span>
      ) : (
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="23" r="9" fill="currentColor" />
          <path d="M15 53v-7a17 17 0 0 1 34 0v7" fill="currentColor" />
        </svg>
      )}
      <MediaPixels
        key={media.data?.image?.src ?? 'default'}
        image={media.data?.image ?? null}
        small={size === 'xs' || size === 'sm'}
        sizes={size === 'lg' ? '80px' : '42px'}
      />
    </span>
  );
}
export function PublicAuthorAvatars({
  projectId,
  versionId,
  authors,
}: {
  projectId: string;
  versionId?: string | undefined;
  authors: readonly { name: string; order: number }[];
}) {
  return authors.length ? (
    <span className="visual-avatar-stack" aria-hidden="true">
      {authors.slice(0, 3).map((a) => (
        <PersonAvatar
          key={a.order}
          name={a.name}
          projectId={projectId}
          versionId={versionId}
          published
          person="author"
          order={a.order}
          size="xs"
        />
      ))}
    </span>
  ) : null;
}
