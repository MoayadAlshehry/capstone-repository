'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ImagePlus,
  ImageIcon,
  UploadIcon as Upload,
  LockKeyhole,
} from '@capstone/ui/workspace-v2';
import {
  ProjectCover,
  useVisualMedia,
  type VisualTargetView,
  type VisualStateView,
} from '@capstone/ui/visual-media';
import {
  IMAGE_UPLOAD_BYTES,
  centeredFraming,
  type VisualFraming,
} from '@capstone/domain';
import { ImageFraming } from './cropper';

const errors: Record<string, [string, string]> = {
  IMAGE_SIZE: [
    'Choose an image up to 5 MB.',
    'اختر صورة لا تتجاوز 5 ميغابايت.',
  ],
  IMAGE_TYPE: [
    'Choose a JPEG, PNG or WebP image. SVG and animated images are not accepted.',
    'اختر صورة JPEG أو PNG أو WebP. لا تُقبل صور SVG أو الصور المتحركة.',
  ],
  IMAGE_INVALID: [
    'This image could not be read. Choose another image.',
    'تعذرت قراءة الصورة. اختر صورة أخرى.',
  ],
  IMAGE_DIMENSIONS: [
    'Use an image at least 200 × 200 pixels for covers, or 64 × 64 for photos. Maximum 16 megapixels.',
    'استخدم صورة لا تقل عن 200 × 200 بكسل للأغلفة، أو 64 × 64 للصور الشخصية. الحد الأقصى 16 ميغابكسل.',
  ],
  MEDIA_CONFLICT: [
    'This image changed in another window. Review the current image before trying again.',
    'تغيرت الصورة في نافذة أخرى. راجع الصورة الحالية قبل المحاولة مجددًا.',
  ],
  MEDIA_READ_ONLY: [
    'This record is now read only. Refresh the page to view its current state.',
    'أصبح هذا السجل للقراءة فقط. حدّث الصفحة لعرض حالته الحالية.',
  ],
  IMAGE_RATE_LIMIT: [
    'Too many image changes. Try again later.',
    'أُجريت تغييرات كثيرة على الصور. حاول لاحقًا.',
  ],
  IMAGE_CAPACITY: [
    'Your image storage is full. Contact your administrator.',
    'مساحة تخزين صورك ممتلئة. تواصل مع المسؤول.',
  ],
  IMAGE_BUSY: [
    'Image processing is busy. Please try again.',
    'معالجة الصور مشغولة. حاول مجددًا.',
  ],
};
type Status = 'idle' | 'saving' | 'saved' | 'error' | 'unconfirmed';
export function MediaEditor({
  target,
  locale,
  readOnly = false,
}: {
  target: VisualTargetView;
  locale: 'en' | 'ar';
  readOnly?: boolean;
}) {
  const media = useVisualMedia(target),
    cover = target.kind === 'cover',
    copy = (en: string, ar: string) => (locale === 'ar' ? ar : en),
    container = useRef<HTMLElement>(null),
    input = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    removeTrigger = useRef<HTMLButtonElement>(null),
    live = useRef(true),
    selection = useRef(0);
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [framing, setFraming] = useState<VisualFraming>({ ...centeredFraming }),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState<Status>('idle'),
    [removed, setRemoved] = useState(false),
    [error, setError] = useState('');
  const operation = useRef<{
      target: VisualTargetView;
      command: string;
      revision: number;
      file: File | null;
      framing: VisualFraming;
    } | null>(null),
    busy = status === 'saving',
    uncertain = status === 'unconfirmed';
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!file) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [file]);
  function clear() {
    selection.current++;
    setFile(null);
    setReady(false);
    setFraming({ ...centeredFraming });
    operation.current = null;
    if (input.current) input.current.value = '';
  }
  function close() {
    if (busy || uncertain) return;
    setOpen(false);
    clear();
    setError('');
    setStatus('idle');
  }
  async function choose(candidate: File | undefined) {
    if (!candidate || busy || uncertain) return;
    const generation = ++selection.current;
    setFile(null);
    setReady(false);
    setError('');
    setStatus('idle');
    operation.current = null;
    setFraming({ ...centeredFraming });
    if (candidate.size > IMAGE_UPLOAD_BYTES) {
      setError('IMAGE_SIZE');
      return;
    }
    try {
      const b = new Uint8Array(await candidate.slice(0, 12).arrayBuffer());
      if (generation !== selection.current || !live.current) return;
      const valid =
        (b[0] === 255 && b[1] === 216 && b[2] === 255) ||
        (b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) ||
        (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
          String.fromCharCode(...b.slice(8, 12)) === 'WEBP');
      if (!valid) {
        setError('IMAGE_TYPE');
        return;
      }
      setFile(candidate);
    } catch {
      if (generation === selection.current && live.current)
        setError('IMAGE_INVALID');
    }
  }
  function accept(state: VisualStateView) {
    setRemoved(operation.current?.file === null);
    media.publish(target, state);
    clear();
    setStatus('saved');
    setError('');
    setOpen(false);
    setConfirm(false);
  }
  async function check() {
    const op = operation.current;
    if (!op) return;
    setStatus('saving');
    try {
      const response = await fetch(
        '/api/visual-media/receipt?command=' + op.command,
        { cache: 'no-store' },
      );
      if (!response.ok) throw Error();
      const data = (await response.json()) as {
        result: null | { state: VisualStateView };
      };
      if (!live.current) return;
      if (data.result) accept(data.result.state);
      else setStatus('unconfirmed');
    } catch {
      if (live.current) setStatus('unconfirmed');
    }
  }
  async function save(remove = false) {
    if (!media.data || busy) return;
    const op = operation.current ?? {
      target,
      command: crypto.randomUUID(),
      revision: media.data.revision,
      file: remove ? null : file,
      framing: { ...framing },
    };
    if (!remove && !op.file) return;
    operation.current = op;
    setStatus('saving');
    setError('');
    try {
      let body: FormData | string,
        headers: Record<string, string> = {};
      if (op.file) {
        const form = new FormData();
        form.set('target', JSON.stringify(op.target));
        form.set('revision', String(op.revision));
        form.set('command', op.command);
        form.set('framing', JSON.stringify(op.framing));
        form.set('image', op.file);
        body = form;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({
          target: op.target,
          revision: op.revision,
          command: op.command,
        });
      }
      const response = await fetch('/api/visual-media', {
          method: 'POST',
          headers,
          body,
        }),
        result = (await response.json()) as {
          state?: VisualStateView;
          code?: string;
          knownRejected?: boolean;
        };
      if (!live.current) return;
      if (!response.ok) {
        if (response.status >= 500 && !result.knownRejected) {
          setStatus('unconfirmed');
          return;
        }
        operation.current = null;
        setStatus('error');
        setError(result.code ?? 'MEDIA_UNAVAILABLE');
        media.refresh();
        return;
      }
      if (!result.state) throw Error();
      accept(result.state);
    } catch {
      if (live.current) setStatus('unconfirmed');
    }
  }
  const errorCopy =
      errors[error]?.[locale === 'ar' ? 1 : 0] ??
      copy(
        'The image could not be saved. Try again.',
        'تعذر حفظ الصورة. حاول مجددًا.',
      ),
    savedCopy = copy(
      cover
        ? removed
          ? 'Designed cover restored.'
          : 'Cover saved.'
        : removed
          ? 'Profile photo removed.'
          : 'Profile photo saved.',
      cover
        ? removed
          ? 'استُعيد الغلاف المصمم.'
          : 'حُفظ الغلاف.'
        : removed
          ? 'أُزيلت الصورة الشخصية.'
          : 'حُفظت الصورة الشخصية.',
    );
  const recovery = uncertain ? (
    <div
      role="alert"
      className="visual-recovery"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <p dir="auto">
        {copy(
          'The response was interrupted. Check whether your change was saved before making another change.',
          'انقطع الرد. تحقق من حفظ التغيير قبل إجراء تغيير آخر.',
        )}
      </p>
      <Button type="button" variant="outline" onClick={() => void check()}>
        {copy('Check saved change', 'التحقق من التغيير المحفوظ')}
      </Button>
    </div>
  ) : null;
  const focusReturn = (event: Event) => {
    event.preventDefault();
    (trigger.current ?? container.current)?.focus();
  };
  const focusRemoval = (event: Event) => {
    event.preventDefault();
    (removeTrigger.current ?? trigger.current ?? container.current)?.focus();
  };
  return (
    <section
      ref={container}
      tabIndex={-1}
      className={
        'visual-editor ' +
        (cover ? 'visual-editor-cover' : 'visual-editor-avatar')
      }
      aria-label={copy(
        cover ? 'Project cover' : 'Profile photo',
        cover ? 'غلاف المشروع' : 'الصورة الشخصية',
      )}
    >
      {cover && (
        <div className="visual-editor-preview">
          <ProjectCover
            projectId={target.project}
            versionId={target.version}
            image={media.data?.image ?? null}
            eager
          />
        </div>
      )}
      <div
        className="visual-editor-controls"
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <span className="visual-editor-eyebrow">
          {copy(
            cover ? 'PROJECT IDENTITY' : 'YOUR IDENTITY',
            cover ? 'هوية المشروع' : 'هويتك',
          )}
        </span>
        <h2 dir="auto">
          {copy(
            cover ? 'Cover image' : 'Profile photo',
            cover ? 'صورة الغلاف' : 'الصورة الشخصية',
          )}
        </h2>
        <p dir="auto">
          {copy(
            cover
              ? readOnly
                ? media.data?.image
                  ? 'Uploaded cover in this read-only record.'
                  : 'Research Editions: default artwork for this read-only record.'
                : media.data?.image
                  ? 'Your uploaded cover.'
                  : 'Research Editions: a default cover for this project.'
              : 'A recognizable photo beside your name, in workspaces and on projects you author or supervise.',
            cover
              ? readOnly
                ? media.data?.image
                  ? 'غلاف مرفوع في سجل للقراءة فقط.'
                  : 'إصدارات البحث: غلاف افتراضي لهذا السجل للقراءة فقط.'
                : media.data?.image
                  ? 'غلافك المرفوع.'
                  : 'إصدارات البحث: غلاف افتراضي لهذا المشروع.'
              : 'صورة تعرّف بك بجانب اسمك، في مساحات العمل والمشاريع التي تؤلفها أو تشرف عليها.',
          )}
        </p>
        {media.status === 'loading' && !media.data ? (
          <p dir="auto" role="status">
            {copy('Loading image settings…', 'جارٍ تحميل إعدادات الصورة…')}
          </p>
        ) : media.status === 'error' ? (
          <div role="alert">
            <p dir="auto">
              {copy(
                'Image settings could not be loaded.',
                'تعذر تحميل إعدادات الصورة.',
              )}
            </p>
            <Button type="button" variant="outline" onClick={media.refresh}>
              {copy('Try again', 'حاول مجددًا')}
            </Button>
          </div>
        ) : media.data?.canEdit ? (
          <>
            <div className="visual-editor-actions">
              <Button
                type="button"
                ref={trigger}
                variant={cover ? 'default' : 'outline'}
                onClick={() => {
                  setError('');
                  setStatus('idle');
                  setOpen(true);
                }}
              >
                <ImagePlus size={16} aria-hidden="true" />
                {copy(
                  cover
                    ? media.data.image
                      ? 'Change cover'
                      : 'Add a cover'
                    : media.data.image
                      ? 'Change photo'
                      : 'Add a photo',
                  cover
                    ? media.data.image
                      ? 'تغيير الغلاف'
                      : 'إضافة غلاف'
                    : media.data.image
                      ? 'تغيير الصورة'
                      : 'إضافة صورة',
                )}
              </Button>
              {media.data.image && (
                <Button
                  type="button"
                  ref={removeTrigger}
                  variant="ghost"
                  disabled={busy || uncertain}
                  onClick={() => {
                    setStatus('idle');
                    setError('');
                    setConfirm(true);
                  }}
                >
                  {copy('Remove', 'إزالة')}
                </Button>
              )}
            </div>
            <p dir="auto" className="visual-editor-help">
              {copy(
                cover
                  ? 'Landscape · 16:10 · adjust before saving'
                  : 'Square · 1:1 · adjust before saving',
                cover
                  ? 'أفقي · 16:10 · اضبطه قبل الحفظ'
                  : 'مربع · 1:1 · اضبطها قبل الحفظ',
              )}
            </p>
          </>
        ) : (
          <p dir="auto" className="visual-editor-readonly">
            <LockKeyhole size={14} aria-hidden="true" />
            {copy(
              readOnly
                ? 'Read only. Uploaded submission covers stay frozen.'
                : 'Managed by the project lead.',
              readOnly
                ? 'للقراءة فقط. تبقى أغلفة الإرسالات المرفوعة ثابتة.'
                : 'يدير قائد المشروع هذا الغلاف.',
            )}
          </p>
        )}
        {status === 'saved' && (
          <p dir="auto" role="status" className="visual-editor-success">
            {savedCopy}
          </p>
        )}
        {!open && !confirm && error && (
          <p dir="auto" role="alert">
            {errorCopy}
          </p>
        )}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (value) setOpen(true);
          else close();
        }}
      >
        <DialogContent
          className="wsv2 visual-crop-dialog"
          showCloseButton={!busy && !uncertain}
          closeLabel={copy('Cancel image change', 'إلغاء تغيير الصورة')}
          onCloseAutoFocus={focusReturn}
        >
          <DialogHeader dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <DialogTitle>
              {copy(
                cover ? 'Frame project cover' : 'Frame profile photo',
                cover ? 'تأطير الغلاف' : 'تأطير الصورة',
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="visual-crop-body">
            <DialogDescription dir={locale === 'ar' ? 'rtl' : 'ltr'}>
              {copy(
                cover
                  ? 'Choose, frame, then save.'
                  : 'Choose a photo, then frame it.',
                cover
                  ? 'اختر صورة واضبطها ثم احفظ.'
                  : 'اختر صورة واضبطها ثم احفظ.',
              )}
            </DialogDescription>
            <input
              ref={input}
              type="file"
              className="visual-file-input"
              tabIndex={-1}
              accept="image/jpeg,image/png,image/webp"
              aria-label={copy(
                cover ? 'Choose project cover' : 'Choose profile photo',
                cover ? 'اختر غلاف المشروع' : 'اختر صورة شخصية',
              )}
              disabled={busy || uncertain}
              onChange={(event) => void choose(event.currentTarget.files?.[0])}
            />
            {preview ? (
              <ImageFraming
                key={preview}
                src={preview}
                kind={target.kind}
                locale={locale}
                framing={framing}
                onChange={setFraming}
                onReady={() => setReady(true)}
                onError={() => {
                  setFile(null);
                  setReady(false);
                  setError('IMAGE_INVALID');
                }}
                disabled={busy || uncertain}
              />
            ) : (
              <div
                className="visual-upload-empty"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                <div className="visual-upload-icon">
                  <ImageIcon size={30} aria-hidden="true" />
                </div>
                <strong>
                  {copy(
                    cover
                      ? 'Give your work a visual identity'
                      : 'A familiar face, wherever you work',
                    cover ? 'امنح عملك هوية بصرية' : 'وجه مألوف في مساحات عملك',
                  )}
                </strong>
                <p dir="auto">
                  {copy(
                    cover
                      ? 'Use a landscape image. You can adjust its position and zoom before saving.'
                      : 'Your photo will be framed as a square and displayed in a circle.',
                    cover
                      ? 'استخدم صورة أفقية. يمكنك ضبط موضعها وتكبيرها قبل الحفظ.'
                      : 'ستُؤطّر صورتك بشكل مربع وتُعرض داخل دائرة.',
                  )}
                </p>
              </div>
            )}
            <div className="visual-file-choice">
              <Button
                type="button"
                variant="outline"
                disabled={busy || uncertain}
                onClick={() => {
                  if (input.current) input.current.value = '';
                  input.current?.click();
                }}
              >
                <Upload size={15} aria-hidden="true" />
                {copy(
                  file ? 'Choose another image' : 'Choose an image',
                  file ? 'اختيار صورة أخرى' : 'اختيار صورة',
                )}
              </Button>
              {file && <span dir="ltr">{file.name}</span>}
            </div>
            <p
              className="visual-editor-help"
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
            >
              {copy(
                cover
                  ? 'JPEG, PNG, WebP · 5 MB max · ideally 1600 × 1000 px.'
                  : 'JPEG, PNG, WebP · 5 MB max · ideally 512 × 512 px.',
                cover
                  ? 'JPEG، PNG، WebP · حتى 5 ميغابايت · يفضّل 1600 × 1000 بكسل.'
                  : 'JPEG، PNG، WebP · حتى 5 ميغابايت · يفضّل 512 × 512 بكسل.',
              )}
            </p>
            {cover && (
              <p
                className="visual-editor-help"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                {copy(
                  'Submitted uploads stay unchanged.',
                  'تبقى أغلفة الإرسالات المرفوعة كما هي.',
                )}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="visual-editor-error"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
              >
                {errorCopy}
              </p>
            )}
            {recovery}
          </div>
          <DialogFooter className="visual-crop-footer">
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={close}
            >
              {copy('Cancel', 'إلغاء')}
            </Button>
            <Button
              type="button"
              disabled={busy || !file || !ready || !media.data?.canEdit}
              onClick={() => void save()}
            >
              {copy(
                busy
                  ? 'Saving…'
                  : uncertain
                    ? 'Retry same change'
                    : cover
                      ? 'Save cover'
                      : 'Save photo',
                busy
                  ? 'جارٍ الحفظ…'
                  : uncertain
                    ? 'إعادة محاولة التغيير نفسه'
                    : cover
                      ? 'حفظ الغلاف'
                      : 'حفظ الصورة',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirm}
        onOpenChange={(value) => {
          if (!busy && !uncertain) setConfirm(value);
        }}
      >
        <DialogContent
          className="wsv2 visual-remove-dialog"
          showCloseButton={!busy && !uncertain}
          closeLabel={copy('Cancel removal', 'إلغاء الإزالة')}
          onCloseAutoFocus={focusRemoval}
        >
          <DialogHeader dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            <DialogTitle>
              {copy(
                cover
                  ? 'Use the designed cover?'
                  : 'Remove your profile photo?',
                cover ? 'استخدام الغلاف المصمم؟' : 'إزالة صورتك الشخصية؟',
              )}
            </DialogTitle>
            <DialogDescription>
              {copy(
                cover
                  ? 'Your project will use its designed cover. Earlier submitted covers are preserved.'
                  : 'Your designed avatar will appear instead. You can add a new photo anytime.',
                cover
                  ? 'سيستخدم مشروعك غلافه المصمم. تبقى الأغلفة المرسلة سابقًا محفوظة.'
                  : 'ستظهر صورتك الرمزية المصممة بدلًا منها. يمكنك إضافة صورة جديدة في أي وقت.',
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p dir="auto" role="alert">
              {errorCopy}
            </p>
          )}
          {recovery}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy || uncertain}
              onClick={() => setConfirm(false)}
            >
              {copy('Cancel', 'إلغاء')}
            </Button>
            <Button
              pending={busy}
              type="button"
              disabled={busy}
              onClick={() => void save(true)}
            >
              {copy(
                busy
                  ? 'Removing…'
                  : uncertain
                    ? 'Retry same change'
                    : cover
                      ? 'Use designed cover'
                      : 'Remove photo',
                busy
                  ? 'جارٍ الإزالة…'
                  : uncertain
                    ? 'إعادة محاولة التغيير نفسه'
                    : cover
                      ? 'استخدام الغلاف المصمم'
                      : 'إزالة الصورة',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
