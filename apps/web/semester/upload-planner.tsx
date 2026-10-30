'use client';
import { BidiValue } from '@capstone/ui/bidi';
import { useEffect, useRef, useState } from 'react';
import type { SemesterFile } from '@capstone/domain';
import {
  Button,
  Input,
  Field,
  FieldLabel,
  Badge,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  FolderOpen,
  UploadIcon,
  ArrowLeft,
  Search,
} from '@capstone/ui/workspace-v2';
import { t, size, type Locale } from './common';
import {
  originalCountLabel,
  uploadActionLabel,
  uploadIssues,
} from '../uploads/issues';
import {
  destination,
  effectivePolicy,
  plannedRows,
  stagedFolders,
  replaceOverrides,
  folderPolicy,
  type StagedOriginal,
  type Visibility,
} from './upload-model';
export interface PlannedUpload {
  file: File;
  path: string;
  intended: Visibility;
  skip: boolean;
}
export function UploadPlanner({
  open,
  onOpenChange,
  locale,
  folder,
  files,
  lead,
  projectTitle,
  available,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  folder: string;
  files: SemesterFile[];
  lead: boolean;
  versionNumber?: number | undefined;
  projectTitle?: string | undefined;
  available?: number | undefined;
  onStart: (rows: PlannedUpload[]) => Promise<void>;
}) {
  const [stage, setStage] = useState(1),
    [rows, setRows] = useState<StagedOriginal[]>([]),
    [base, setBase] = useState(folder),
    [segment, setSegment] = useState(''),
    [defaultPolicy, setDefaultPolicy] = useState<Visibility>('restricted'),
    [rules, setRules] = useState<Record<string, Visibility>>({}),
    [query, setQuery] = useState(''),
    [picker, setPicker] = useState(false),
    [replaceRule, setReplaceRule] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [supportsFolder, setSupportsFolder] = useState(false),
    [page, setPage] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null),
    copy = (en: string, ar: string) => t(locale, en, ar);
  useEffect(() => {
    if (open) {
      setBase(folder);
      setSegment('');
      setStage(1);
      setRows([]);
      setRules({});
      setDefaultPolicy('restricted');
      setQuery('');
      setPicker(false);
      setError(false);
      setPage(1);
    } else setRows([]);
  }, [open]);
  useEffect(() => {
    setSupportsFolder('webkitdirectory' in document.createElement('input'));
    folderInput.current?.setAttribute('webkitdirectory', '');
  }, [open]);
  const select = (selection: FileList | null) => {
    if (!selection) return;
    setRows((current) => [
      ...current,
      ...Array.from(selection).map((original) => ({
        id: crypto.randomUUID(),
        original,
        relative: original.webkitRelativePath || original.name,
        skip: false,
        replace: false,
      })),
    ]);
    if (fileInput.current) fileInput.current.value = '';
    if (folderInput.current) folderInput.current.value = '';
  };
  let target = '',
    destinationError = false;
  try {
    target = destination(base, segment);
  } catch {
    destinationError = true;
  }
  const planned = plannedRows(rows, target, files),
    active = planned.filter((r) => !r.skip),
    total = active.reduce((n, r) => n + r.original.size, 0),
    folders = stagedFolders(rows),
    existingFolders = stagedFolders(files.map((f) => ({ relative: f.path }))),
    filtered = planned.filter((r) =>
      r.path.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ),
    pages = Math.max(1, Math.ceil(filtered.length / 30)),
    currentPage = Math.min(page, pages),
    shown = filtered.slice((currentPage - 1) * 30, currentPage * 30),
    publicCount = lead
      ? active.filter(
          (r) => effectivePolicy(r, rules, defaultPolicy).value === 'public',
        ).length
      : 0,
    blocked =
      destinationError ||
      !active.length ||
      active.some((r) => r.issues.length) ||
      available === undefined ||
      total > available;
  const patch = (id: string, update: Partial<StagedOriginal>) =>
    setRows((values) =>
      values.map((r) => (r.id === id ? { ...r, ...update } : r)),
    );
  const policyControl = (
    value: Visibility,
    onChange: (v: Visibility) => void,
    label: string,
  ) => (
    <label dir="auto" className="ss-plan-policy">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as Visibility)}
      >
        <option value="restricted">{copy('Restricted', 'مقيّد')}</option>
        <option value="public">
          {copy('Public after approved publication', 'عام بعد الموافقة والنشر')}
        </option>
      </select>
    </label>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <SheetContent
        className="wsv2 ss-upload-task ss-explorer-sheet"
        side="right"
        closeLabel={copy('Close upload planner', 'إغلاق مهمة الرفع')}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document
            .querySelector<HTMLButtonElement>('[data-upload-entry]')
            ?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{copy('Upload originals', 'رفع الأصول')}</SheetTitle>
          <SheetDescription>
            <bdi dir="auto">{projectTitle}</bdi>
            {' · '}
            {copy(
              'Current work · private preparation',
              'العمل الحالي · إعداد خاص',
            )}
            .{' '}
            {copy(
              'Nothing transfers until you review and start.',
              'لا يبدأ النقل حتى تراجع وتبدأ.',
            )}
          </SheetDescription>
        </SheetHeader>
        <div
          className="ss-plan-steps"
          aria-label={copy('Upload steps', 'خطوات الرفع')}
        >
          {[1, 2, 3].map((n) => (
            <span key={n} aria-current={stage === n ? 'step' : undefined}>
              {n} ·{' '}
              {n === 1
                ? copy('Select', 'اختيار')
                : n === 2
                  ? copy('Destination & access', 'المسار والوصول')
                  : copy('Review', 'مراجعة')}
            </span>
          ))}
        </div>
        <div className="ss-plan-body">
          {stage === 1 ? (
            <>
              <div
                className="ss-drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) select(e.dataTransfer.files);
                }}
              >
                <UploadIcon />
                <h3 dir="auto">
                  {copy(
                    'Select original files or a folder',
                    'اختر ملفات أصلية أو مجلدًا',
                  )}
                </h3>
                <p dir="auto">
                  {copy(
                    'Drop files here, or use the keyboard-accessible selection buttons. Folder selection preserves nested paths; empty folders are not imported.',
                    'أسقط ملفات هنا، أو استخدم أزرار الاختيار المتاحة بلوحة المفاتيح. يحتفظ اختيار المجلد بالمسارات المتداخلة؛ لا تُستورد المجلدات الفارغة.',
                  )}
                </p>
                <div className="ss-plan-actions">
                  <Button onClick={() => fileInput.current?.click()}>
                    {copy('Choose files', 'اختيار ملفات')}
                  </Button>
                  {supportsFolder && (
                    <Button
                      variant="outline"
                      onClick={() => folderInput.current?.click()}
                    >
                      {copy('Choose folder', 'اختيار مجلد')}
                    </Button>
                  )}
                </div>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                aria-label={copy(
                  'Choose staged originals',
                  'اختيار الأصول للمراجعة',
                )}
                onChange={(e) => select(e.target.files)}
              />
              <input
                ref={(node) => {
                  folderInput.current = node;
                  node?.setAttribute('webkitdirectory', '');
                }}
                type="file"
                multiple
                hidden
                aria-label={copy(
                  'Choose staged directory',
                  'اختيار مجلد للمراجعة',
                )}
                onChange={(e) => select(e.target.files)}
              />
            </>
          ) : null}
          {stage >= 2 && (
            <>
              <div className="ss-plan-destination">
                <h3 dir="auto">
                  {copy('Destination in this project', 'المسار داخل المشروع')}
                </h3>
                <code dir="ltr">
                  <BidiValue kind="path">
                    {copy('Project files', 'ملفات المشروع')}
                    {target && ' / ' + target}
                  </BidiValue>
                </code>
                <Button variant="outline" onClick={() => setPicker((v) => !v)}>
                  <FolderOpen />
                  {copy('Change folder', 'تغيير المجلد')}
                </Button>
                {picker && (
                  <div className="ss-plan-folder-picker">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setBase('');
                        setPicker(false);
                      }}
                    >
                      {copy('Project files root', 'جذر ملفات المشروع')}
                    </Button>
                    {existingFolders.map((f) => (
                      <Button
                        variant="ghost"
                        key={f}
                        onClick={() => {
                          setBase(f);
                          setPicker(false);
                        }}
                      >
                        <code dir="ltr">
                          <BidiValue kind="path">{f}</BidiValue>
                        </code>
                      </Button>
                    ))}
                  </div>
                )}
                <Field>
                  <FieldLabel htmlFor="ss-new-upload-segment">
                    {copy(
                      'New nested segment (optional)',
                      'مسار متداخل جديد (اختياري)',
                    )}
                  </FieldLabel>
                  <Input
                    id="ss-new-upload-segment"
                    dir="ltr"
                    value={segment}
                    onChange={(e) => setSegment(e.target.value)}
                    placeholder="semester"
                    aria-invalid={destinationError}
                  />
                </Field>
                {destinationError && (
                  <p dir="auto" role="alert">
                    {copy(
                      'Use safe relative folder segments; traversal, reserved names and hidden/internal folders are rejected.',
                      'استخدم أجزاء مسار نسبية آمنة؛ تُرفض محاولات الانتقال والأسماء المحجوزة والمجلدات الداخلية.',
                    )}
                  </p>
                )}
                <p dir="auto">
                  {copy(
                    'New folders appear when their files finish uploading. Folder uploads keep their structure under this destination.',
                    'تظهر المجلدات الجديدة عند اكتمال رفع ملفاتها. يحتفظ رفع المجلدات ببنيتها داخل هذه الوجهة.',
                  )}
                </p>
              </div>
              <section className="ss-plan-access">
                <h3 dir="auto">
                  {copy(
                    'Visibility after approved publication',
                    'الإتاحة بعد الموافقة والنشر',
                  )}
                </h3>
                <p dir="auto">
                  {copy(
                    'New files enter Restricted in private project work. Public choices do not publish the project or grant a license.',
                    'تدخل الملفات الجديدة مقيّدة في العمل الخاص للمشروع. لا تنشر الخيارات العامة المشروع ولا تمنحه ترخيصًا.',
                  )}
                </p>
                {lead ? (
                  policyControl(
                    defaultPolicy,
                    setDefaultPolicy,
                    copy('Batch default', 'الخيار الافتراضي للدفعة'),
                  )
                ) : (
                  <Badge variant="outline">
                    {copy(
                      'Restricted · only the current lead changes visibility',
                      'مقيّد · القائد الحالي فقط يغيّر الإتاحة',
                    )}
                  </Badge>
                )}
                {lead && folders.length > 0 && (
                  <details>
                    <summary>
                      {copy(
                        'Folder rules · this upload only',
                        'قواعد المجلدات · لهذا الرفع فقط',
                      )}
                    </summary>
                    {folders.map((f) => (
                      <div key={f} className="ss-plan-folder-rule">
                        <code dir="ltr">
                          <BidiValue kind="path">{f}</BidiValue>
                        </code>
                        {policyControl(
                          folderPolicy(f, rules, defaultPolicy),
                          (v) =>
                            setRules((current) => ({ ...current, [f]: v })),
                          copy('Rule for ', 'قاعدة ') + f,
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => setReplaceRule(f)}
                        >
                          {copy(
                            'Apply to all descendants (replace overrides)',
                            'تطبيق على جميع الملفات الفرعية (استبدال التخصيصات)',
                          )}
                        </Button>
                      </div>
                    ))}
                  </details>
                )}
                {replaceRule && (
                  <div className="ss-plan-confirm" role="alert">
                    <p dir="auto">
                      <code dir="ltr">
                        <BidiValue kind="path">{replaceRule}</BidiValue>
                      </code>{' '}
                      ·{' '}
                      {
                        rows.filter(
                          (r) =>
                            r.relative.startsWith(replaceRule + '/') &&
                            r.override,
                        ).length
                      }{' '}
                      {copy('file overrides', 'تخصيصات ملفات')} +{' '}
                      {
                        Object.keys(rules).filter((f) =>
                          f.startsWith(replaceRule + '/'),
                        ).length
                      }{' '}
                      {copy(
                        'nested rules will be replaced.',
                        'قواعد متداخلة ستُستبدل.',
                      )}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setReplaceRule(null)}
                    >
                      {copy('Keep overrides', 'إبقاء التخصيصات')}
                    </Button>
                    <Button
                      onClick={() => {
                        const next = replaceOverrides(
                          rows,
                          rules,
                          replaceRule,
                          folderPolicy(replaceRule, rules, defaultPolicy),
                        );
                        setRows(next.rows);
                        setRules(next.rules);
                        setReplaceRule(null);
                      }}
                    >
                      {copy(
                        'Confirm replace overrides',
                        'تأكيد استبدال التخصيصات',
                      )}
                    </Button>
                  </div>
                )}
              </section>
            </>
          )}
          <div className="ss-plan-summary">
            <strong>
              {originalCountLabel(active.length, locale)} ·{' '}
              <span dir="ltr">{size(total)}</span> ·{' '}
              {originalCountLabel(
                stagedFolders(active).length,
                locale,
                'folder',
              )}
            </strong>
            {stage >= 2 && (
              <p dir="auto">
                {active.length - publicCount} {copy('Restricted', 'مقيّد')} /{' '}
                {publicCount}{' '}
                {copy('Public after publication', 'عام بعد النشر')}
              </p>
            )}
            <p dir="auto">
              {copy('Current quota estimate', 'تقدير التخزين الحالي')}:{' '}
              {available === undefined ? (
                copy(
                  'Unknown: refresh before starting',
                  'غير متاح: حدّث قبل البدء',
                )
              ) : (
                <span dir="ltr">
                  {size(available)} {copy('available', 'متاح')}
                </span>
              )}
            </p>
            {available !== undefined && total > available && (
              <p dir="auto" role="alert">
                {copy(
                  'Selected bytes exceed the current available quota. Skip files or select a smaller batch.',
                  'تتجاوز البيانات المختارة التخزين المتاح. تجاوز ملفات أو اختر دفعة أصغر.',
                )}
              </p>
            )}
          </div>
          {rows.length > 0 && (
            <>
              <label dir="auto" className="ss-plan-search">
                <Search />
                <Input
                  type="search"
                  aria-label={copy(
                    'Search selected files',
                    'البحث في الملفات المختارة',
                  )}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <div className="ss-plan-file-list">
                {shown.map((row) => {
                  const effective = lead
                    ? effectivePolicy(row, rules, defaultPolicy)
                    : { value: 'restricted', source: 'batch' };
                  return (
                    <article key={row.id} data-plan-row={row.id}>
                      <strong>
                        <BidiValue kind="path">{row.original.name}</BidiValue>
                      </strong>
                      <small dir="ltr">{size(row.original.size)}</small>
                      <code dir="ltr">
                        <BidiValue kind="path">{row.path}</BidiValue>
                      </code>
                      {stage >= 2 && (
                        <>
                          <label dir="auto">
                            <span>
                              {copy(
                                'Relative file path before upload',
                                'مسار الملف النسبي قبل الرفع',
                              )}
                            </span>
                            <Input
                              dir="ltr"
                              value={row.relative}
                              aria-label={
                                copy('Path for ', 'مسار ') + row.original.name
                              }
                              aria-invalid={
                                row.issues.some(
                                  (issue) => !issue.startsWith('File size '),
                                ) || undefined
                              }
                              aria-describedby={
                                row.issues.length
                                  ? 'ss-upload-issues-' + row.id
                                  : undefined
                              }
                              onChange={(e) =>
                                patch(row.id, {
                                  relative: e.target.value,
                                  replace: false,
                                })
                              }
                            />
                          </label>
                          {lead ? (
                            policyControl(
                              effective.value as Visibility,
                              (v) => patch(row.id, { override: v }),
                              copy('Visibility for ', 'إتاحة ') +
                                row.original.name,
                            )
                          ) : (
                            <Badge variant="outline">
                              {copy('Restricted', 'مقيّد')}
                            </Badge>
                          )}
                          <small>
                            {effective.source === 'file'
                              ? copy('Individual override', 'تخصيص فردي')
                              : effective.source === 'folder'
                                ? copy(
                                    'Inherited folder rule',
                                    'قاعدة مجلد موروثة',
                                  )
                                : copy(
                                    'Inherited batch default',
                                    'خيار الدفعة الموروث',
                                  )}
                          </small>
                          {row.override && (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                patch(row.id, { override: undefined })
                              }
                            >
                              {copy(
                                'Use inherited visibility',
                                'استخدام الإتاحة الموروثة',
                              )}
                            </Button>
                          )}
                          {row.collision && (
                            <div className="ss-plan-collision">
                              <p dir="auto">
                                {copy(
                                  'A file already uses this path. Replace it in current work; earlier submitted files stay unchanged.',
                                  'يوجد ملف بهذا المسار. استبدله في العمل الحالي؛ تبقى الملفات المرسلة سابقًا دون تغيير.',
                                )}
                              </p>
                              <label dir="auto">
                                <input
                                  type="checkbox"
                                  checked={row.replace}
                                  onChange={(e) =>
                                    patch(row.id, { replace: e.target.checked })
                                  }
                                />{' '}
                                {copy(
                                  'Confirm replacement of ',
                                  'تأكيد استبدال ',
                                )}
                                <code dir="ltr">
                                  <BidiValue kind="path">
                                    {row.collision.path}
                                  </BidiValue>
                                </code>
                              </label>
                            </div>
                          )}
                        </>
                      )}
                      {row.issues.length > 0 && (
                        <ul
                          id={'ss-upload-issues-' + row.id}
                          role="alert"
                          className="ss-plan-errors"
                        >
                          {row.issues.map((issue, i) => (
                            <li key={i}>{uploadIssues([issue], locale)}</li>
                          ))}
                        </ul>
                      )}
                      <label dir="auto">
                        <input
                          type="checkbox"
                          checked={row.skip}
                          onChange={(e) =>
                            patch(row.id, { skip: e.target.checked })
                          }
                        />
                        {copy('Skip this file', 'تجاوز هذا الملف')}
                      </label>
                    </article>
                  );
                })}
              </div>
              {!filtered.length && (
                <p dir="auto" role="status">
                  {copy(
                    'No selected files match. Try another path or clear the search.',
                    'لا تطابق الملفات المختارة هذا البحث. جرّب مسارًا آخر أو امسح البحث.',
                  )}
                </p>
              )}
              {query && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setQuery('');
                    setPage(1);
                  }}
                >
                  {copy('Clear search', 'مسح البحث')}
                </Button>
              )}
              {filtered.length > 30 && (
                <div className="ss-plan-actions">
                  <Button
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    {copy('Previous', 'السابق')}
                  </Button>
                  <span>
                    {currentPage} / {pages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={currentPage * 30 >= filtered.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    {copy('Next', 'التالي')}
                  </Button>
                </div>
              )}
            </>
          )}
          {stage === 3 && (
            <p dir="auto" className="ss-plan-consequence">
              {copy(
                'Review the file paths and access choices. Uploads can finish separately; access changes apply to successfully uploaded files.',
                'راجع مسارات الملفات وخيارات الوصول. قد تكتمل الملفات بصورة منفصلة؛ تُطبق تغييرات الوصول على الملفات التي اكتمل رفعها.',
              )}
            </p>
          )}
          {error && (
            <p dir="auto" role="alert">
              {copy(
                'Your project access could not be confirmed. Refresh before uploading.',
                'تعذر تأكيد وصولك إلى المشروع. حدّث الصفحة قبل الرفع.',
              )}
            </p>
          )}
        </div>
        <footer className="ss-plan-footer">
          <Button
            pending={busy}
            variant="outline"
            disabled={busy}
            onClick={() =>
              stage === 1 ? onOpenChange(false) : setStage((s) => s - 1)
            }
          >
            <ArrowLeft />
            {copy('Back', 'عودة')}
          </Button>
          {stage < 3 ? (
            <Button
              disabled={!rows.length || destinationError || busy}
              onClick={() => setStage((s) => s + 1)}
            >
              {copy('Continue', 'متابعة')}
            </Button>
          ) : (
            <Button
              disabled={blocked || busy}
              onClick={async () => {
                setBusy(true);
                setError(false);
                try {
                  await onStart(
                    planned.map((row) => ({
                      file: row.original,
                      path: row.path,
                      intended: lead
                        ? effectivePolicy(row, rules, defaultPolicy).value
                        : 'restricted',
                      skip: row.skip,
                    })),
                  );
                  onOpenChange(false);
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? copy('Checking authority', 'التحقق من الصلاحية')
                : uploadActionLabel(active.length, locale)}
            </Button>
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}
