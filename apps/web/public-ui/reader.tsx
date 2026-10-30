'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/public-ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/public-ui/sheet';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { useSite, useUrlFile, type Project } from './model';
import { usePublicPortal } from './scope';
import { matchingFiles } from '../../../packages/ui/src/design-system/public/utilities';
// The existing sanitized Markdown/code/CSV renderers retain their byte bindings.
import { SourcePreview } from './source-preview';
export function PublicReader({ p }: { p: Project }) {
  const { t, l, contents, downloadAll, fileLink, integration } = useSite(),
    { file, select } = useUrlFile(p),
    portal = usePublicPortal();
  const [query, setQuery] = useState(''),
    [folder, setFolder] = useState(integration?.initialDirectory ?? ''),
    [focus, setFocus] = useState(false),
    [sheet, setSheet] = useState(false),
    [wrap, setWrap] = useState(true),
    [numbers, setNumbers] = useState(false),
    [notice, setNotice] = useState('');
  const inline = useRef<HTMLDivElement>(null),
    focusTrigger = useRef<HTMLButtonElement>(null),
    focused = useRef<HTMLDivElement>(null),
    position = useRef(0);
  const choose = (path: string) => {
    if (path !== file?.path) {
      position.current = 0;
      if (inline.current) inline.current.scrollTop = 0;
      if (focused.current) focused.current.scrollTop = 0;
    }
    select(path);
    setSheet(false);
    setNotice('');
  };
  const copy = async (code = false) => {
    if (!file) return;
    const value = code ? contents[file.contentKey] : fileLink(p, file.path);
    if (value === undefined) {
      setNotice(t('Preview unavailable'));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setNotice(t('linkCopied'));
    } catch {
      setNotice(t('Copy unavailable. Select this link:') + ' ' + value);
    }
  };
  if (!file)
    return (
      <section
        id="files"
        ref={integration?.readerRootRef}
        data-ui="file-reader"
      >
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t('files')}</EmptyTitle>
            <EmptyDescription>{t('publicFilesEmpty')}</EmptyDescription>
          </EmptyHeader>
          <Button asChild variant="outline">
            <a href="#overview">{t('Overview')} ↑</a>
          </Button>
        </Empty>
      </section>
    );
  const inventory = (
    <div className="pu-file-inventory">
      <Field>
        <FieldLabel
          htmlFor={focus || sheet ? 'focus-file-search' : 'file-search'}
        >
          {t('findFile')}
        </FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={focus || sheet ? 'focus-file-search' : 'file-search'}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('findFile')}
          />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel>{t('Folder')}</FieldLabel>
        <Select
          value={JSON.stringify(folder)}
          onValueChange={(value) => setFolder(JSON.parse(value) as string)}
        >
          <SelectTrigger aria-label={t('Folder')} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent {...portal}>
            <SelectItem value={'""'}>{t('All folders')}</SelectItem>
            {[
              ...new Set(
                p.publicFiles.map((f) =>
                  f.path.includes('/')
                    ? f.path.slice(0, f.path.lastIndexOf('/'))
                    : '/',
                ),
              ),
            ].map((v) => (
              <SelectItem key={v} value={JSON.stringify(v)}>
                <bdi dir="ltr">{v}</bdi>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <nav className="pu-file-list" aria-label={t('chooseFile')}>
        {matchingFiles(p.publicFiles, query, folder).map((f) => (
          <Button
            key={f.path}
            variant={file.path === f.path ? 'secondary' : 'ghost'}
            aria-pressed={file.path === f.path}
            onClick={() => choose(f.path)}
            className="pu-file-choice"
          >
            <span className="text-xs text-muted-foreground">
              {f.kind.toUpperCase()}
            </span>
            <strong>
              <bdi dir="ltr">{f.path.split('/').pop()}</bdi>
            </strong>
            <small>
              <bdi dir="ltr">
                {f.path.includes('/')
                  ? f.path.slice(0, f.path.lastIndexOf('/')) + '/'
                  : '/'}
              </bdi>{' '}
              · {f.sizeBytes} B
            </small>
          </Button>
        ))}
      </nav>
      {!matchingFiles(p.publicFiles, query, folder).length && (
        <p role="status">{t('No files match')}</p>
      )}
    </div>
  );
  const toolbar = (
    <div className="pu-reader-toolbar">
      <div className="min-w-0">
        <h3>
          <bdi dir="ltr">{file.path.split('/').pop()}</bdi>
        </h3>
        <Accordion type="single" collapsible>
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger className="py-2 text-xs">
              {t('File details')}
            </AccordionTrigger>
            <AccordionContent>
              <bdi dir="ltr">{file.path}</bdi>
              <p>
                {file.kind.toUpperCase()} · {file.sizeBytes} B
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button asChild size="sm">
          <a download href={file.originalUrl}>
            {t('download')} ↓
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => copy()}>
          {t('copyLink')}
        </Button>
      </div>
    </div>
  );
  const viewer = (
    <>
      {file.kind === 'code' && (
        <div className="flex gap-2 p-3 border-b flex-wrap">
          <Button
            size="sm"
            variant={wrap ? 'secondary' : 'ghost'}
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
          >
            {t('Wrap lines')}
          </Button>
          <Button
            size="sm"
            variant={numbers ? 'secondary' : 'ghost'}
            aria-pressed={numbers}
            onClick={() => setNumbers(!numbers)}
          >
            {t('Line numbers')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => copy(true)}>
            {t('copyCode')}
          </Button>
        </div>
      )}
      <small className="pu-source-label">
        {integration?.sourceLabel ?? t('Source file · English')}
      </small>
      {integration?.readerNotice}
      {integration?.preview ?? (
        <SourcePreview
          file={file}
          content={contents[file.contentKey]}
          wrap={wrap}
          numbers={numbers}
        />
      )}
    </>
  );
  return (
    <section
      id="files"
      ref={integration?.readerRootRef}
      className="pu-reader"
      data-ui="file-reader"
      data-file-kind={file.kind}
    >
      <Card>
        <CardContent className="grid gap-5">
          <header className="pu-reader-heading">
            <div>
              <span className="pu-eyebrow">
                {l(
                  p.publicFiles.length +
                    (p.publicFiles.length === 1
                      ? ' public file'
                      : ' public files'),
                  p.publicFiles.length === 1
                    ? 'ملف عام واحد'
                    : p.publicFiles.length === 2
                      ? 'ملفان عامان'
                      : p.publicFiles.length + ' ملفات عامة',
                )}
              </span>
              <h2 dir="auto">{t('files')}</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                ref={focusTrigger}
                variant="outline"
                aria-label={t('focusReading')}
                onClick={() => {
                  position.current = inline.current?.scrollTop ?? 0;
                  setFocus(true);
                }}
              >
                {l('Focus mode', 'وضع القراءة')} ⛶
              </Button>
              <Button
                variant="outline"
                aria-label={l(
                  'Download all public files',
                  'تنزيل الكل — الملفات العامة',
                )}
                onClick={async () => {
                  try {
                    await downloadAll(p);
                  } catch (error) {
                    setNotice(
                      error instanceof Error
                        ? error.message
                        : t('Preview unavailable'),
                    );
                  }
                }}
              >
                {l('Download all', 'تنزيل الكل')}
              </Button>
            </div>
          </header>
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetTrigger asChild>
              <Button variant="outline" className="pu-file-picker">
                {t('chooseFile')} ☷
              </Button>
            </SheetTrigger>
            <SheetContent {...portal}>
              <SheetHeader>
                <SheetTitle>{t('chooseFile')}</SheetTitle>
              </SheetHeader>
              <div className="p-4 overflow-y-auto">{inventory}</div>
            </SheetContent>
          </Sheet>
          <div className="pu-reader-grid">
            <aside>{inventory}</aside>
            <Card className="pu-reading">
              <div>{toolbar}</div>
              <div
                className="pu-reader-scroll"
                ref={inline}
                tabIndex={0}
                role="region"
                aria-label={t('File preview')}
                key={file.path}
              >
                {!focus && viewer}
              </div>
            </Card>
          </div>
          <p dir="auto" role="status" className="text-sm">
            {notice}
          </p>
        </CardContent>
      </Card>
      <Dialog
        open={focus}
        onOpenChange={(open) => {
          if (!open) {
            position.current = focused.current?.scrollTop ?? position.current;
            setFocus(false);
            requestAnimationFrame(() => {
              if (inline.current) inline.current.scrollTop = position.current;
            });
          }
        }}
      >
        <DialogContent
          {...portal}
          dir="ltr"
          className={portal.className + ' pu-focus-dialog'}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusTrigger.current?.focus();
          }}
          onOpenAutoFocus={() => {
            requestAnimationFrame(() => {
              if (focused.current) focused.current.scrollTop = position.current;
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('focusReading')}</DialogTitle>
            <DialogDescription>
              <bdi dir="ltr">{file.path}</bdi>
            </DialogDescription>
          </DialogHeader>
          {toolbar}
          <div
            ref={focused}
            className="pu-focus-scroll"
            role="region"
            tabIndex={0}
            aria-label={t('File preview')}
          >
            {viewer}
          </div>
          <p role="status">{notice}</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
