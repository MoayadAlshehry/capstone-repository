'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import { useEffect, useRef, useState } from 'react';
import type { SemesterFile } from '@capstone/domain';
import { initialEvidence } from './experience';
import { AcademicExplorer } from '../semester/explorer';
import { useSemesterMemory } from '../semester/memory';
import { t, size, date, type Locale } from '../semester/common';
import { deniedRead } from '../semester/read-status';
import { Button } from '@capstone/ui/workspace-v2';
export function AcademicEvidence({
  locale,
  actor,
  project,
  version,
  submission,
  files,
  readerOnly = true,
  recordNavigation = false,
  onSelected,
  onDenied,
  queryUrl,
  authorityUrl,
  scopeKey,
  publicLabel,
  originalLabel,
  readingNotice,
  initialFile,
  authorityRequiresUsable = true,
  showDownload = true,
}: {
  locale: Locale;
  actor: string;
  project: string;
  version: string;
  submission?: string | undefined;
  files: SemesterFile[];
  readerOnly?: boolean;
  recordNavigation?: boolean;
  onSelected?: ((file: SemesterFile | undefined) => void) | undefined;
  onDenied?: (() => void) | undefined;
  queryUrl?: ((mode: string, file?: string) => string) | undefined;
  authorityUrl?: string | undefined;
  scopeKey?: string | undefined;
  publicLabel?: string | undefined;
  originalLabel?: string | undefined;
  readingNotice?: string | undefined;
  initialFile?: string | undefined;
  authorityRequiresUsable?: boolean;
  showDownload?: boolean;
}) {
  const memory = useSemesterMemory(actor, project),
    key = 'academic.file.' + (scopeKey ?? submission ?? version),
    [selected, setSelected] = useState(
      initialEvidence(files, initialFile ?? memory[key])?.id ?? '',
    ),
    [denied, setDenied] = useState(false),
    copy = (en: string, ar: string) => t(locale, en, ar);
  useEffect(() => {
    onSelected?.(denied ? undefined : files.find((f) => f.id === selected));
  }, [selected, denied, files, onSelected]);
  const notified = useRef(onDenied);
  notified.current = onDenied;
  useEffect(() => {
    let live = true;
    const check = () => {
      void fetch(
        authorityUrl ??
          '/api/academic?' +
            (submission ? 'round=' + submission : 'project=' + project),
        { cache: 'no-store', headers: { 'X-Workspace-Actor': actor } },
      )
        .then(async (r) => {
          const invalid =
            deniedRead(r.status) ||
            (r.ok &&
              !!authorityUrl &&
              authorityRequiresUsable &&
              (await r.json()).usable !== true);
          if (invalid && live) {
            setDenied(true);
            setSelected('');
            delete memory[key];
            notified.current?.();
          }
        })
        .catch(() => {});
    };
    const clear = () => {
      setDenied(true);
      setSelected('');
      delete memory[key];
      notified.current?.();
    };
    window.addEventListener('focus', check);
    window.addEventListener('semester-memory-cleared', clear);
    const timer = setInterval(check, 30000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [
    actor,
    project,
    submission,
    memory,
    key,
    authorityUrl,
    authorityRequiresUsable,
  ]);
  const query = (mode: string, file?: string) =>
    '/api/native-files?' +
    new URLSearchParams({
      project,
      version,
      mode,
      ...(submission ? { submission } : {}),
      ...(file ? { file } : {}),
      ...(mode === 'preview' ? { syntax: 'studio' } : {}),
    });
  return (
    <>
      {showDownload && !denied && files.length > 0 && (
        <div className="ss-reader-actions">
          <Button asChild variant="outline">
            <a href={(queryUrl ?? query)('zip')} download>
              {copy('Download permitted ZIP', 'تنزيل ZIP المسموح')}
            </a>
          </Button>
        </div>
      )}
      <AcademicExplorer
        key={actor + ':' + version + ':' + (submission ?? 'working')}
        locale={locale}
        actor={actor}
        project={project}
        version={version}
        submission={submission}
        files={denied ? [] : files}
        selected={selected}
        reveal={
          initialFile
            ? {
                file: initialFile,
                nonce: 'initial.' + initialFile,
                reading: true,
              }
            : undefined
        }
        onSelect={(id) => {
          setSelected(id);
          memory[key] = id;
          onSelected?.(files.find((f) => f.id === id));
        }}
        publicLabel={publicLabel}
        queryUrl={queryUrl ?? query}
        sheetClassName="ac-evidence-sheet"
        readerOnly={readerOnly}
        recordNavigation={recordNavigation}
        fileContext={
          originalLabel ??
          (submission
            ? copy('Frozen original', 'أصل محفوظ')
            : copy('Validated original', 'أصل مقبول'))
        }
        unavailable={denied}
        onDenied={() => {
          setDenied(true);
          setSelected('');
          delete memory[key];
          onSelected?.(undefined);
          onDenied?.();
        }}
        details={(preview) => (
          <section className="ss-file-details">
            <h2 dir="auto">{copy('Original file', 'الأصل الدقيق')}</h2>
            {preview && (
              <BidiFacts>
                <BidiLabel dir="auto">{copy('Size', 'الحجم')}</BidiLabel>
                <BidiData dir="auto">{size(preview.meta.size)}</BidiData>
                {preview.meta.uploader && (
                  <>
                    <BidiLabel dir="auto">
                      {copy('Uploaded by', 'رفعه')}
                    </BidiLabel>
                    <BidiData dir="auto">
                      <bdi dir="auto">{preview.meta.uploader}</bdi>
                    </BidiData>
                  </>
                )}
                {preview.meta.uploadedAt && (
                  <>
                    <BidiLabel dir="auto">
                      {copy('Upload time', 'وقت الرفع')}
                    </BidiLabel>
                    <BidiData dir="auto">
                      {date(locale, preview.meta.uploadedAt)}
                    </BidiData>
                  </>
                )}
              </BidiFacts>
            )}
            <p dir="auto" className="ss-muted">
              {readingNotice ??
                copy(
                  'Read-only inspection never executes an uploaded original. A missing preview is not a score of zero.',
                  'لا ينفذ الفحص للقراءة فقط أي أصل مرفوع. غياب المعاينة لا يعني درجة صفر.',
                )}
            </p>
          </section>
        )}
      />
    </>
  );
}
