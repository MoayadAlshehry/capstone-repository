import { BidiData, BidiLabel } from '../bidi.js';
import { BidiFact, BidiFacts } from '../bidi.js';
import type { CSSProperties, ReactNode } from 'react';
import { StatusMessage } from './presentation.js';
export type SkeletonShape = 'line' | 'block' | 'avatar' | 'media' | 'row';
export function Skeleton({
  shape = 'line',
  width,
  height,
  pulse = false,
  className = '',
}: {
  shape?: SkeletonShape;
  width?: string;
  height?: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={'ds-skeleton ' + className}
      data-shape={shape}
      data-pulse={pulse || undefined}
      style={
        {
          '--ds-shape-width': width,
          '--ds-shape-height': height,
        } as CSSProperties
      }
    />
  );
}
export type LoadingTemplate =
  | 'home'
  | 'catalogue-grid'
  | 'catalogue-list'
  | 'project-header'
  | 'authors'
  | 'file-tree'
  | 'file-preview'
  | 'assessment'
  | 'token-context'
  | 'workspace-list'
  | 'workspace-detail';
export function SkeletonTemplate({
  template,
  pulse = false,
}: {
  template: LoadingTemplate;
  pulse?: boolean;
}) {
  const lines = (
    <>
      <Skeleton width="92%" pulse={pulse} />
      <Skeleton width="76%" pulse={pulse} />
    </>
  );
  if (template === 'catalogue-grid' || template === 'catalogue-list')
    return (
      <div
        className="pav-results results ds-card-skeletons"
        data-view={template === 'catalogue-grid' ? 'grid' : 'list'}
        data-template={template}
        aria-hidden="true"
      >
        {[0, 1].map((i) => (
          <article className="pav-object" key={i}>
            <div className="result-media">
              <Skeleton
                shape="media"
                height="100%"
                className="cover"
                pulse={pulse}
              />
            </div>
            <div className="pav-object-sheet">
              <span className="eyebrow">
                <Skeleton width="62%" pulse={pulse} />
              </span>
              <h3 dir="auto">
                <Skeleton width="70%" pulse={pulse} />
              </h3>
              <p dir="auto" className="ds-placeholder-lines">
                {lines}
              </p>
              <div className="byline ds-skeleton-authors">
                <Skeleton shape="avatar" pulse={pulse} />
                <Skeleton shape="avatar" pulse={pulse} />
                <Skeleton shape="avatar" pulse={pulse} />
              </div>
              <small>
                <Skeleton width="68%" pulse={pulse} />
              </small>
            </div>
            <div className="pav-object-end">
              <div className="score">
                <span>
                  <Skeleton width="10ch" pulse={pulse} />
                </span>
                <div>
                  <Skeleton width="7ch" height="1.5em" pulse={pulse} />
                </div>
              </div>
              <Skeleton
                shape="block"
                width="140px"
                height="var(--cr-geometry-public-form-control-min)"
                pulse={pulse}
              />
            </div>
          </article>
        ))}
      </div>
    );
  if (template === 'home')
    return (
      <>
        <article
          className="pav-window ds-feature-skeleton"
          data-template={template}
          aria-hidden="true"
        >
          <div className="ds-media-slot">
            <Skeleton
              className="cover"
              shape="media"
              height="100%"
              pulse={pulse}
            />
          </div>
          <div className="pav-window-note">
            <span className="eyebrow">
              <Skeleton width="70%" pulse={pulse} />
            </span>
            <h2 dir="auto">
              <Skeleton width="80%" pulse={pulse} />
            </h2>
            <p dir="auto" className="ds-placeholder-lines">
              {lines}
            </p>
            <div className="score">
              <Skeleton width="70%" pulse={pulse} />
              <Skeleton width="55%" height="2lh" pulse={pulse} />
            </div>
            <Skeleton shape="block" width="180px" height="46px" pulse={pulse} />
          </div>
          <div className="pav-provenance" aria-hidden="true">
            <div className="ds-skeleton-authors ds-feature-credit-placeholder">
              <Skeleton
                shape="block"
                width="100%"
                height="80px"
                pulse={pulse}
              />
            </div>
            <Skeleton width="28ch" pulse={pulse} />
          </div>
        </article>
      </>
    );
  if (template === 'authors')
    return (
      <div
        className="ds-skeleton-template ds-skeleton-authors"
        data-template={template}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div className="ds-author-placeholder" key={i}>
            <Skeleton shape="avatar" pulse={pulse} />
            <Skeleton width="14ch" height="21px" pulse={pulse} />
          </div>
        ))}
      </div>
    );
  if (template === 'file-tree')
    return (
      <div
        className="file-inventory ds-file-skeleton"
        data-template={template}
        aria-hidden="true"
      >
        {[0, 1, 2].map((i) => (
          <div className="ds-file-placeholder" key={i}>
            <Skeleton width="4ch" pulse={pulse} />
            <Skeleton width="80%" pulse={pulse} />
            <Skeleton width="56%" pulse={pulse} />
          </div>
        ))}
      </div>
    );
  if (template === 'file-preview')
    return (
      <div
        className="reader-scroll ds-preview-skeleton"
        data-template={template}
        aria-hidden="true"
      >
        <Skeleton width="55%" height="2lh" pulse={pulse} />
        <div className="ds-placeholder-lines">
          {lines}
          <Skeleton width="90%" pulse={pulse} />
          <Skeleton width="64%" pulse={pulse} />
        </div>
      </div>
    );
  return (
    <div
      className="ds-skeleton-template"
      data-template={template}
      aria-hidden="true"
    >
      {template === 'project-header' ? (
        <div className="pav-academic-strip">
          <BidiFacts className="facts">
            {[0, 1, 2, 3, 4].map((i) => (
              <BidiFact key={i}>
                <BidiLabel dir="auto">
                  <Skeleton width="12ch" pulse={pulse} />
                </BidiLabel>
                <BidiData dir="auto">
                  <Skeleton width="80%" pulse={pulse} />
                </BidiData>
              </BidiFact>
            ))}
          </BidiFacts>
        </div>
      ) : template === 'workspace-list' ? (
        [0, 1, 2].map((i) => (
          <div className="ds-workspace-row-placeholder" key={i}>
            <Skeleton width="52%" pulse={pulse} />
            <Skeleton
              shape="block"
              width="100px"
              height="var(--cr-geometry-workspace-control-default)"
              pulse={pulse}
            />
          </div>
        ))
      ) : (
        <>
          <Skeleton width="68%" pulse={pulse} />
          <Skeleton width="92%" pulse={pulse} />
          <Skeleton width="78%" pulse={pulse} />
        </>
      )}
    </div>
  );
}
export type ReadinessPhase =
  'idle' | 'cold' | 'warm' | 'slow' | 'ready' | 'empty' | 'error' | 'cancelled';
export function ReadinessRegion({
  phase,
  label,
  status,
  fallback,
  empty,
  error,
  children,
  retainContent = false,
  className = '',
}: {
  phase: ReadinessPhase;
  label: string;
  status: string;
  fallback: ReactNode;
  empty: ReactNode;
  error: ReactNode;
  children: ReactNode;
  retainContent?: boolean;
  className?: string;
}) {
  const busy = phase === 'cold' || phase === 'warm' || phase === 'slow';
  const body =
    phase === 'error' ? (
      retainContent ? (
        <>
          {children}
          {error}
        </>
      ) : (
        error
      )
    ) : phase === 'empty' ? (
      empty
    ) : busy && !retainContent ? (
      fallback
    ) : (
      children
    );
  return (
    <>
      <div
        className={'ds-readiness ' + className}
        role="region"
        aria-label={label}
        aria-busy={busy}
      >
        {body}
      </div>
      <div
        className="ds-loading-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {phase === 'error' ? '' : status}
      </div>
    </>
  );
}
export function LoadingError({
  message,
  retry,
}: {
  message: string;
  retry?: ReactNode;
}) {
  return (
    <>
      <StatusMessage kind="danger">{message}</StatusMessage>
      {retry}
    </>
  );
}
