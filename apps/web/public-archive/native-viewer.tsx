'use client';
import { Button as PublicButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useIsPublicUI } from '../public-ui/scope';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { csvSourceRanges } from '../native-files/source-locator';
import { SafeMarkdown } from '../native-files/markdown';
import { CodeReader } from '../semester/code-reader';
import { readableCodeTokens, type Locale, type PublicPreview } from './core';
const Pdf = dynamic(() => import('../native-files/pdf'), { ssr: false });
export function NativeFileViewer({
  locale,
  data,
  state,
  asset,
  name,
  retry,
  failed,
  resolve,
  imageFit,
  setImageFit,
  csvHead,
  setCsvHead,
  pdfView,
  setPdfView,
  publicOriginal,
  sourceLines,
}: {
  locale: Locale;
  data: PublicPreview | null;
  state: string;
  asset: string;
  name: string;
  retry: () => void;
  failed: () => void;
  resolve: (url: string, image: boolean) => string;
  imageFit: boolean;
  setImageFit: (value: boolean) => void;
  csvHead: boolean;
  setCsvHead: (value: boolean) => void;
  pdfView: { page: number; zoom: number; fit: 'width' | 'page' };
  setPdfView: (view: {
    page: number;
    zoom: number;
    fit: 'width' | 'page';
  }) => void;
  publicOriginal?: string;
  sourceLines?: ReturnType<typeof csvSourceRanges>;
}) {
  const publicUI = useIsPublicUI(),
    Action = publicUI ? PublicButton : 'button';
  const t = useTranslations('Archive');
  const csvPositions =
    sourceLines ??
    (data?.family === 'csv' ? csvSourceRanges(data.text ?? '') : []);
  if (state === 'unavailable')
    return (
      <div className="lra-viewer-state">
        <h4 dir="auto">{t('files.unavailableTitle')}</h4>
        <p dir="auto">{t('files.unavailableText')}</p>
      </div>
    );
  if (state === 'failed')
    return (
      <div className="lra-viewer-state" role="alert">
        <h4 dir="auto">{t('files.failedTitle')}</h4>
        <p dir="auto">{t('files.failedText')}</p>
        <Action className="lra-text-action" onClick={retry}>
          {t('common.retry')}
        </Action>
      </div>
    );
  if (!data)
    return (
      <p dir="auto" className="lra-viewer-state" role="status">
        {t(state === 'idle' ? 'files.chooseTitle' : 'files.loading')}
      </p>
    );
  if (!data.meta.size)
    return (
      <p dir="auto" className="lra-viewer-state">
        {t('files.emptyFile')}
      </p>
    );
  if (data.family === 'unsupported' || data.error === 'IMAGE_LIMIT')
    return (
      <div className="lra-viewer-state">
        <h4 dir="auto">{t('files.unsupportedTitle')}</h4>
        <p dir="auto">{t('files.unsupportedText')}</p>
      </div>
    );
  return (
    <>
      {data.error && (
        <p dir="auto" className="lra-viewer-note" role="status">
          {t('files.malformed')}
        </p>
      )}
      {data.truncated && (
        <p dir="auto" className="lra-viewer-note" role="status">
          {t('files.bounded')}
        </p>
      )}
      {data.family === 'markdown' && (
        <div className="lra-document" dir="auto">
          <SafeMarkdown text={data.text ?? ''} resolvePublic={resolve} />
        </div>
      )}
      {['source', 'json'].includes(data.family) && (
        <CodeReader
          key={data.meta.id}
          locale={locale}
          text={data.text ?? ''}
          tokens={readableCodeTokens(data.tokens)}
          language={data.language}
          truncated={data.truncated}
        />
      )}
      {data.family === 'csv' && (
        <>
          <label dir="auto" className="lra-csv-heading">
            {publicUI ? (
              <Checkbox
                checked={csvHead}
                onCheckedChange={(checked) => setCsvHead(checked === true)}
                aria-label={t('files.firstRowHeader')}
              />
            ) : (
              <input
                type="checkbox"
                checked={csvHead}
                onChange={(event) => setCsvHead(event.target.checked)}
              />
            )}
            {t('files.firstRowHeader')}
          </label>
          <div
            className="lra-table-scroll"
            role="region"
            tabIndex={0}
            aria-label={name}
            dir="ltr"
          >
            <table dir="ltr">
              {csvHead && (
                <thead>
                  <tr
                    data-source-line-start={csvPositions[0]?.start}
                    data-source-line-end={csvPositions[0]?.end}
                  >
                    {data.rows?.[0]?.map((cell, index) => (
                      <th dir="auto" scope="col" key={index}>
                        <bdi dir="auto">{cell}</bdi>
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {data.rows?.slice(csvHead ? 1 : 0).map((row, index) => (
                  <tr
                    key={index}
                    data-source-line-start={
                      csvPositions[index + (csvHead ? 1 : 0)]?.start
                    }
                    data-source-line-end={
                      csvPositions[index + (csvHead ? 1 : 0)]?.end
                    }
                  >
                    {row.map((cell, col) => (
                      <td dir="auto" key={col}>
                        <bdi dir="auto">{cell}</bdi>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.truncated && (
            <p dir="auto" className="lra-viewer-note">
              {t('files.rowsPreview', { count: data.rows?.length ?? 0 })}
            </p>
          )}
        </>
      )}
      {data.family === 'pdf' && (
        <Pdf
          url={asset}
          failed={failed}
          studioLocale={locale}
          publicView={pdfView}
          onPublicViewChange={setPdfView}
          {...(publicOriginal ? { publicOriginal } : {})}
        />
      )}{' '}
      {data.family === 'image' && (
        <div className="lra-image-view">
          <Action
            className="lra-text-action"
            aria-pressed={imageFit}
            onClick={() => setImageFit(!imageFit)}
          >
            {imageFit
              ? locale === 'ar'
                ? 'الحجم الفعلي'
                : 'Actual size'
              : t('files.fitWidth')}
          </Action>
          <div tabIndex={0}>
            <img
              src={asset}
              alt={name}
              style={{ maxWidth: imageFit ? '100%' : 'none' }}
              onError={failed}
            />
          </div>
        </div>
      )}
      {data.family === 'audio' && (
        <audio
          src={asset}
          controls
          preload="metadata"
          aria-label={name}
          onError={failed}
        />
      )}{' '}
      {data.family === 'video' && (
        <video
          src={asset}
          controls
          preload="metadata"
          aria-label={name}
          onError={failed}
        />
      )}
    </>
  );
}
