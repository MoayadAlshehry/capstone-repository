'use client';
import { useState, useEffect } from 'react';
import { NativeFileViewer } from '../public-archive/native-viewer';
import { csvSourceRanges } from '../native-files/source-locator';
import type { PublicPreview } from '../public-archive/core';
/** The existing bounded media/PDF renderer stays behind the unchanged public-file endpoint. */
export function NativeRegion({
  data,
  asset,
  locale,
  pdfView,
  setPdfView,
  locateSource = false,
}: {
  data: PublicPreview;
  asset: string;
  locale: 'en' | 'ar';
  locateSource?: boolean;
  pdfView: { page: number; zoom: number; fit: 'width' | 'page' };
  setPdfView: (view: {
    page: number;
    zoom: number;
    fit: 'width' | 'page';
  }) => void;
}) {
  const [failed, setFailed] = useState(false),
    [imageFit, setImageFit] = useState(true),
    [csvHead, setCsvHead] = useState(true);
  const [sourceLines, setSourceLines] = useState<
    ReturnType<typeof csvSourceRanges>
  >([]);
  useEffect(() => {
    if (!locateSource || data.family !== 'csv' || data.meta.size > 4_000_000)
      return;
    const controller = new AbortController();
    setSourceLines([]);
    void (async () => {
      const response = await fetch(
        asset.replace('mode=asset', 'mode=original'),
        { signal: controller.signal, cache: 'no-store' },
      );
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let text = '',
        bytes = 0;
      try {
        while (bytes < 512_000) {
          const part = await reader.read();
          if (part.done) break;
          const value = part.value.subarray(0, 512_000 - bytes);
          bytes += value.byteLength;
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        if (!controller.signal.aborted)
          setSourceLines(
            csvSourceRanges(text).slice(0, data.rows?.length ?? 0),
          );
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    })().catch(() => undefined);
    return () => controller.abort();
  }, [asset, data.meta.id, locateSource]);
  return (
    <div className="p3-native-content">
      <NativeFileViewer
        sourceLines={sourceLines}
        locale={locale}
        data={data}
        state={failed ? 'failed' : 'loaded'}
        asset={asset}
        name={data.meta.path}
        retry={() => setFailed(false)}
        failed={() => setFailed(true)}
        resolve={() => ''}
        imageFit={imageFit}
        setImageFit={setImageFit}
        csvHead={csvHead}
        setCsvHead={setCsvHead}
        pdfView={pdfView}
        setPdfView={setPdfView}
        publicOriginal={asset.replace('mode=asset', 'mode=original')}
      />
    </div>
  );
}
