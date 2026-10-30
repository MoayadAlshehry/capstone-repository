'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { computingDomains } from '@capstone/domain';
import type { AcademicReadiness } from '@capstone/domain';
import {
  Button,
  ArrowLeft,
  FileCheck2,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@capstone/ui/workspace-v2';
import { AcademicEvidence } from './evidence';
import { StudioCard, t, size, type Locale } from '../semester/common';
import { useSemesterMemory } from '../semester/memory';
import { AcademicCommandProtection, useAcademicCommand } from './command';
const issues: Record<string, [string, string]> = {
  FINAL_REQUEST_REQUIRED: [
    'Ask your assigned supervisor to request final submission',
    'اطلب من المشرف المعيّن طلب الإرسال النهائي',
  ],
  TITLE: ['Title: 5–200 characters', 'العنوان: 5–200 حرف'],
  ABSTRACT: ['Abstract: 50–5,000 characters', 'الملخص: 50–5,000 حرف'],
  METADATA: [
    'Complete 1–10 valid keywords and project details',
    'أكمل 1–10 كلمات مفتاحية وتفاصيل صحيحة',
  ],
  YEAR: ['Set the academic year', 'حدد العام الأكاديمي'],
  DOMAIN: ['Choose the computing domain', 'اختر المجال الحاسوبي'],
  AUTHORS: [
    'The administrator must confirm the active author roster and one lead',
    'يؤكد المدير المؤلفين النشطين وقائدًا واحدًا',
  ],
  SUPERVISOR: [
    'An active assigned supervisor is required',
    'يلزم مشرف معيّن نشط',
  ],
  FILES_REQUIRED: [
    'Add at least one validated original',
    'أضف أصلًا مقبولًا واحدًا على الأقل',
  ],
  FILES_NOT_READY: [
    'Resolve originals awaiting validation',
    'عالج الأصول التي تنتظر التحقق',
  ],
  ACTIVE_UPLOAD: [
    'Finish or cancel active transfers before submission',
    'أكمل عمليات النقل النشطة أو ألغها قبل الإرسال',
  ],
  QUOTA: ['Resolve the project storage limit', 'عالج حد تخزين المشروع'],
};
export function FinalReadiness({
  locale,
  actor,
  data,
}: {
  locale: Locale;
  actor: string;
  data: AcademicReadiness;
}) {
  const s = data.studio,
    p = s.project,
    copy = (en: string, ar: string) => t(locale, en, ar),
    memory = useSemesterMemory(actor, p.id),
    cmd = useAcademicCommand(memory, 'final.' + p.version, actor),
    router = useRouter(),
    [confirm, setConfirm] = useState(false);
  const scope = s.files.reduce(
      (n, f) => ({
        files: n.files + 1,
        bytes: n.bytes + f.size,
        public: n.public + (f.visibility === 'public' ? 1 : 0),
      }),
      { files: 0, bytes: 0, public: 0 },
    ),
    latest = data.final.latest,
    recordOnly = Boolean(latest && !s.editable);
  async function submit() {
    const value = await cmd.send({
      operation: 'final.submit',
      project: p.id,
      version: p.version,
      revision: data.final.revision,
      assignmentRevision: data.final.assignmentRevision,
      manifestDigest: data.manifestDigest,
    });
    setConfirm(false);
    if (value?.id) {
      setConfirm(false);
      router.push('/' + locale + '/submissions/' + value.id);
    }
  }
  async function recheck() {
    const value = await cmd.recheck();
    if (value?.id) router.push('/' + locale + '/submissions/' + value.id);
  }
  return (
    <section
      className="ss-page ac-page"
      data-locale={locale}
      data-template="final-readiness"
    >
      <AcademicCommandProtection locale={locale} command={cmd} />
      <Link className="ss-back" href={'/' + locale + '/projects/' + p.id}>
        <ArrowLeft />
        {copy('Back to project', 'العودة إلى المشروع')}
      </Link>
      <header className="ss-heading">
        <div>
          <p dir="auto" className="ac-eyebrow">
            {copy('Final submission', 'الإرسال النهائي')}
          </p>
          <h1 dir="auto">
            {recordOnly
              ? copy('Final submission record', 'سجل الإرسال النهائي')
              : data.flow.revision
                ? copy('Resubmit final work', 'أعد إرسال العمل النهائي')
                : copy('Prepare final submission', 'جهّز الإرسال النهائي')}
          </h1>
          <p dir="auto">
            <bdi dir="auto">{p.metadata.title}</bdi> ·{' '}
            {copy('Final submission', 'الإرسال النهائي')}
          </p>
        </div>
      </header>
      <p dir="auto" className="ss-muted">
        {recordOnly
          ? copy(
              'Read the saved project details, team and files. Open the final round for its review status.',
              'اقرأ تفاصيل المشروع والفريق والملفات المحفوظة. افتح الإرسال النهائي للاطلاع على حالة مراجعته.',
            )
          : copy(
              'Submit the project for your supervisor to review. Your work stays private and becomes read only until the response.',
              'أرسل المشروع لمراجعة المشرف. يبقى العمل خاصًا وللقراءة فقط حتى الرد.',
            )}
      </p>
      <div className="ac-readiness-status" role="status">
        <FileCheck2 />
        <div>
          <h2 dir="auto">
            {data.final.issues.length
              ? copy('Items need attention', 'عناصر تحتاج معالجة') +
                ': ' +
                data.final.issues.length
              : s.editable
                ? copy('Ready to submit', 'جاهز للإرسال')
                : copy('Final evidence is locked', 'الأدلة النهائية مقفلة')}
          </h2>
          <p dir="auto">
            {recordOnly
              ? copy(
                  'These details belong to the recorded final submission.',
                  'تخص هذه التفاصيل الإرسال النهائي المحفوظ.',
                )
              : s.role === 'lead'
                ? copy(
                    'Review your project details, team and files before confirming.',
                    'راجع تفاصيل المشروع والفريق والملفات قبل التأكيد.',
                  )
                : copy(
                    'Only the current lead can submit.',
                    'القائد الحالي وحده يستطيع الإرسال.',
                  )}
          </p>
        </div>
      </div>
      <section className="af-request-status">
        <h2 dir="auto">{copy('Supervisor request', 'طلب المشرف')}</h2>
        <p dir="auto">
          {recordOnly
            ? copy(
                'Final submission is already recorded. Its current status is available in the saved round.',
                'حُفظ الإرسال النهائي بالفعل. تتوفر حالته الحالية في سجل الإرسال.',
              )
            : data.flow.requestValid
              ? copy('Final submission requested', 'طُلب الإرسال النهائي')
              : copy(
                  'Your supervisor must request final submission before you can submit.',
                  'يجب أن يطلب المشرف الإرسال النهائي قبل أن تتمكن من الإرسال.',
                )}
        </p>
        {data.flow.request?.note && <p dir="auto">{data.flow.request.note}</p>}
      </section>
      <section className="ac-task-checklist">
        <h2 dir="auto">
          {recordOnly
            ? copy('Recorded project information', 'معلومات المشروع المحفوظة')
            : copy('Check before submitting', 'تحقق قبل الإرسال')}
        </h2>
        {[
          {
            title: copy('Project details', 'تفاصيل المشروع'),
            codes: ['TITLE', 'ABSTRACT', 'METADATA', 'YEAR', 'DOMAIN'],
            path: 'edit',
          },
          {
            title: copy('Academic team', 'الفريق الأكاديمي'),
            codes: ['AUTHORS', 'SUPERVISOR'],
            path: 'team',
          },
          {
            title: copy('Validated files', 'الملفات المقبولة'),
            codes: [
              'FILES_REQUIRED',
              'FILES_NOT_READY',
              'ACTIVE_UPLOAD',
              'QUOTA',
            ],
            path: 'files',
          },
          {
            title: copy(
              'File visibility at publication',
              'إتاحة الملفات عند النشر',
            ),
            codes: [],
            path: 'files',
          },
        ].map((item) => {
          const found = data.final.issues.filter((x) => item.codes.includes(x));
          return (
            <article key={item.path + item.title}>
              <div>
                <h3 dir="auto">{item.title}</h3>
                <p dir="auto">
                  {found.length
                    ? found
                        .map((x) =>
                          t(
                            locale,
                            ...(issues[x] ?? [
                              'Recheck requirements',
                              'أعد التحقق من المتطلبات',
                            ]),
                          ),
                        )
                        .join(' · ')
                    : item.codes.length
                      ? copy(
                          'Required details are ready.',
                          'التفاصيل المطلوبة جاهزة.',
                        )
                      : scope.public +
                        ' ' +
                        copy('Public after publication', 'عام بعد النشر') +
                        ' / ' +
                        (scope.files - scope.public) +
                        ' ' +
                        copy('Restricted', 'مقيّد')}
                </p>
              </div>
              <strong>
                {found.length
                  ? copy('Needs attention', 'يحتاج معالجة')
                  : copy('Ready', 'جاهز')}
              </strong>
              <Button variant="ghost" asChild>
                <Link
                  href={'/' + locale + '/projects/' + p.id + '/' + item.path}
                >
                  {copy(
                    item.path === 'edit' && s.editable ? 'Edit' : 'Open',
                    item.path === 'edit' && s.editable ? 'تحرير' : 'فتح',
                  )}
                </Link>
              </Button>
            </article>
          );
        })}
      </section>
      <section className="ac-final-snapshot">
        <h2 dir="auto">{copy('Final snapshot', 'اللقطة النهائية')}</h2>
        <p dir="auto">
          <bdi dir="auto">{p.metadata.title}</bdi>
        </p>
        <p dir="auto">
          {scope.files}{' '}
          {copy(
            scope.files === 1 ? 'validated original' : 'validated originals',
            'أصلًا مقبولًا',
          )}{' '}
          · <bdi dir="ltr">{size(scope.bytes)}</bdi> · {scope.public}{' '}
          {copy('Public after publication', 'عام بعد النشر')} /{' '}
          {scope.files - scope.public} {copy('Restricted', 'مقيّد')}
        </p>
        <p dir="auto">
          <bdi dir="auto">
            {p.authors
              .map(
                (a) => a.name + (a.lead ? ' · ' + copy('Lead', 'القائد') : ''),
              )
              .join(' / ')}
          </bdi>{' '}
          · {copy('Supervisor', 'المشرف')}:{' '}
          <bdi dir="auto">{p.supervisor.name}</bdi>
        </p>
        <details>
          <summary>
            {copy(
              'Review saved metadata and team',
              'راجع البيانات والفريق المحفوظين',
            )}
          </summary>{' '}
          <div className="ac-readiness-grid">
            <StudioCard title={copy('Project details', 'تفاصيل المشروع')}>
              <BidiFacts className="ac-metadata">
                <BidiLabel dir="auto">{copy('Title', 'العنوان')}</BidiLabel>
                <BidiData dir="auto">
                  <bdi dir="auto">{p.metadata.title}</bdi>
                </BidiData>
                <BidiLabel dir="auto">{copy('Abstract', 'الملخص')}</BidiLabel>
                <BidiData dir="auto">
                  {p.metadata.abstract || copy('Not completed', 'غير مكتمل')}
                </BidiData>
                <BidiLabel dir="auto">
                  {copy(
                    'Year · domain · keywords',
                    'العام · المجال · الكلمات المفتاحية',
                  )}
                </BidiLabel>
                <BidiData dir="auto">
                  {p.metadata.academic_year} ·{' '}
                  {computingDomains.find((x) => x.code === p.metadata.domain)?.[
                    locale
                  ] || copy('Not chosen', 'غير محدد')}{' '}
                  ·{' '}
                  {p.metadata.keywords.join(' · ') ||
                    copy('Not completed', 'غير مكتمل')}
                </BidiData>
              </BidiFacts>
              {s.editable && (
                <Button variant="outline" asChild>
                  <Link href={'/' + locale + '/projects/' + p.id + '/edit'}>
                    {copy('Edit project details', 'تحرير تفاصيل المشروع')}
                  </Link>
                </Button>
              )}
            </StudioCard>
            <StudioCard title={copy('Assigned team', 'الفريق المعيّن')}>
              <p dir="auto">
                {copy('Supervisor', 'المشرف')}:{' '}
                <bdi dir="auto">{p.supervisor.name}</bdi>
              </p>
              <ol className="ac-author-roster">
                {p.authors.map((a) => (
                  <li key={a.id}>
                    <bdi dir="auto">{a.name}</bdi>
                    {a.lead ? ' · ' + copy('Lead', 'القائد') : ''}
                  </li>
                ))}
              </ol>
              <Button variant="outline" asChild>
                <Link href={'/' + locale + '/projects/' + p.id + '/team'}>
                  {copy(
                    'View university-managed team',
                    'عرض الفريق الذي تديره الجامعة',
                  )}
                </Link>
              </Button>
            </StudioCard>
          </div>
        </details>
        <p dir="auto" className="ss-muted">
          {recordOnly
            ? copy(
                'Access follows the publication decision and current file permissions. Public file choices do not transfer licensing rights.',
                'يتبع الوصول قرار النشر وأذونات الملفات الحالية. لا تنقل خيارات الملفات العامة حقوق الترخيص.',
              )
            : copy(
                'The project stays private until faculty publication. Public file choices do not transfer licensing rights.',
                'يبقى المشروع خاصًا حتى قرار النشر من المشرف. لا تنقل خيارات الملفات العامة حقوق الترخيص.',
              )}
        </p>
      </section>
      <div className="ac-task-actions">
        {data.final.issues.length > 0 && s.editable && (
          <div role="alert">
            <h2 dir="auto">
              {copy(
                'Complete before final submission',
                'أكمل قبل الإرسال النهائي',
              )}
            </h2>
            <ul>
              {data.final.issues.map((x) => (
                <li key={x}>
                  {t(
                    locale,
                    ...(issues[x] ?? [
                      'Recheck the current project requirements',
                      'أعد التحقق من متطلبات المشروع',
                    ]),
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {cmd.error && (
          <p dir="auto" role="alert">
            {cmd.error.code === 'CONFLICT'
              ? copy(
                  'Current work changed. Refresh and review it before submitting.',
                  'تغير العمل الحالي. حدّث الصفحة وراجعه قبل الإرسال.',
                )
              : copy(
                  'The final command was rejected. Recheck readiness and your current role.',
                  'رُفض الأمر النهائي. أعد التحقق من الجاهزية ودورك الحالي.',
                )}
          </p>
        )}
        {cmd.error?.code === 'CONFLICT' && (
          <Button variant="outline" onClick={() => router.refresh()}>
            {copy('Refresh exact snapshot', 'حدّث اللقطة الدقيقة')}
          </Button>
        )}
        {cmd.state === 'unknown' ? (
          <>
            <p dir="auto" role="status">
              {copy(
                'Outcome unknown. Check the original request before trying again.',
                'النتيجة غير معروفة. تحقق من الطلب الأصلي قبل المحاولة مجددًا.',
              )}
            </p>
            <Button onClick={() => void recheck()}>
              {copy('Recheck original request', 'تحقق من الطلب الأصلي')}
            </Button>
          </>
        ) : data.final.canSubmit ? (
          <Button onClick={() => setConfirm(true)}>
            <FileCheck2 />
            {data.flow.revision
              ? copy('Resubmit final work', 'أعد إرسال العمل النهائي')
              : copy('Submit final', 'أرسل العمل النهائي')}
          </Button>
        ) : latest && !s.editable ? (
          <Button asChild>
            <Link href={'/' + locale + '/submissions/' + latest}>
              {copy(
                'View persisted final round',
                'عرض الإرسال النهائي المحفوظ',
              )}
            </Link>
          </Button>
        ) : (
          <div>
            <Button disabled>
              {data.flow.revision
                ? copy('Resubmit final work', 'أعد إرسال العمل النهائي')
                : copy('Submit final', 'أرسل العمل النهائي')}
            </Button>
            <p dir="auto" className="ss-muted">
              {s.role === 'author'
                ? copy(
                    'Only the current lead submits the final work. You can help prepare the project.',
                    'القائد الحالي وحده يرسل العمل النهائي. يمكنك المساعدة في إعداد المشروع.',
                  )
                : copy(
                    'Refresh after completing the authoritative readiness requirements.',
                    'حدّث الصفحة بعد إكمال متطلبات الجاهزية الرسمية.',
                  )}
            </p>
          </div>
        )}
      </div>
      <details className="ac-readiness-files">
        <summary>{copy('Review exact files', 'راجع الملفات الدقيقة')}</summary>
        <AcademicEvidence
          locale={locale}
          actor={actor}
          project={p.id}
          version={p.version}
          files={s.files}
        />
      </details>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="wsv2 ac-confirm">
          <DialogHeader>
            <DialogTitle>
              {copy('Confirm final submission', 'أكد الإرسال النهائي')}
            </DialogTitle>
            <DialogDescription>
              <bdi dir="auto">{p.metadata.title}</bdi> ·{' '}
              {copy('Final submission', 'الإرسال النهائي')}.{' '}
              {copy(
                'Freeze the reviewed details, team and exact accepted originals. Working uploads and edits lock until a faculty decision. Nothing publishes now.',
                'احفظ التفاصيل والفريق والأصول المقبولة التي راجعتها. تُقفل عمليات الرفع والتعديل حتى قرار المشرف. لا يُنشر شيء الآن.',
              )}
            </DialogDescription>
          </DialogHeader>
          <p dir="auto">
            {scope.public} {copy('Public after approval', 'عام بعد الموافقة')} /{' '}
            {scope.files - scope.public} {copy('Restricted', 'مقيّد')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {copy('Cancel', 'إلغاء')}
            </Button>
            <Button
              disabled={cmd.state === 'saving'}
              onClick={() => void submit()}
            >
              {copy('Confirm final submission', 'أكد الإرسال النهائي')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
