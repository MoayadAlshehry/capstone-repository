'use client';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFact, BidiFacts } from '@capstone/ui/bidi';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SemesterState,
  GuidedProjectRecord,
  CheckpointRound,
} from '@capstone/domain';
import {
  Button,
  ArrowLeft,
  ArrowUpRight,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@capstone/ui/workspace-v2';
import { CompletionRequest } from '../academic/flow';
import { guardedNavigation } from '../assessment-studio/exit-guard';
import { StudioCard, StateBadge, date, t, type Locale } from './common';
import { MetadataEditor } from './metadata';
import { FileWorkspace } from './files';
import { SemesterReviews, CheckpointSend } from './reviews';
import { StudioTeam } from './team';
import { MediaEditor } from '../visual-media/editor';
import { FinalPacketConsent } from '../packets/final-consent';
export function SemesterStudio({
  locale,
  actor,
  state,
  team,
  rootPath,
  section,
  parent,
  selectedRound,
  uploadBase,
  locked,
  task,
  initialFile,
}: {
  locale: Locale;
  actor: string;
  state: SemesterState;
  team: GuidedProjectRecord;
  rootPath: string;
  section: string;
  parent: string;
  selectedRound: CheckpointRound | null;
  uploadBase: string;
  locked?: string | undefined;
  task?: string | undefined;
  initialFile?: string | undefined;
}) {
  const [dirty, setDirty] = useState(false),
    router = useRouter(),
    copy = (en: string, ar: string) => t(locale, en, ar),
    tabs = ['overview', 'files', 'reviews', 'team'],
    active = section === 'edit' ? 'overview' : section;
  const route = (view: string) =>
    '/' +
    locale +
    rootPath +
    (view === 'overview' ? '' : '/' + view) +
    '?from=' +
    encodeURIComponent(parent);
  return (
    <section
      className="ss-page"
      data-locale={locale}
      data-template="student-overview"
    >
      <Link href={parent} className="ss-back">
        <ArrowLeft />
        {state.role === 'supervisor'
          ? copy('Back to Projects', 'العودة إلى المشاريع')
          : copy('Back to My projects', 'العودة إلى مشاريعي')}
      </Link>
      <header className="ss-heading ss-studio-heading">
        <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <h1 dir="auto">
            {state.project.metadata.title ||
              copy('Untitled project', 'مشروع دون عنوان')}
          </h1>
          <p dir="auto">
            <bdi dir="auto">
              {locale === 'ar'
                ? state.project.universityAr
                : state.project.university}
            </bdi>
            {' · '}
            <span dir="ltr">
              {state.project.department} ·{' '}
              {state.project.metadata.academic_year}
            </span>
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={() => router.refresh()}>
          {copy('Refresh project', 'تحديث المشروع')}
        </Button>
      </header>
      <div className="ss-context">
        <StateBadge locale={locale} state={state.lifecycle} />
        <Badge className="ss-role">
          {state.role === 'lead'
            ? copy('Your role: Lead', 'دورك: القائد')
            : state.role === 'author'
              ? copy('Your role: Author', 'دورك: مؤلف')
              : copy('Your role: Assigned supervisor', 'دورك: المشرف المعيّن')}
        </Badge>

        <span>
          {copy('Supervisor', 'المشرف')}:{' '}
          <bdi dir="auto">{state.project.supervisor.name}</bdi>
        </span>
      </div>
      {(state.role === 'lead' || state.role === 'supervisor') && (
        <div className="ss-context">
          <Button asChild variant="outline">
            <Link
              href={
                '/' +
                locale +
                (state.role === 'lead'
                  ? '/access/lead?project=' + state.project.id
                  : '/audit?project=' + state.project.id) +
                '&from=' +
                encodeURIComponent('/' + locale + rootPath)
              }
            >
              {state.role === 'lead'
                ? copy('Partner requests', 'طلبات الشركاء')
                : copy('Project audit', 'تدقيق المشروع')}
            </Link>
          </Button>
        </div>
      )}
      <Tabs
        value={active}
        onValueChange={(view) =>
          guardedNavigation(route(view), () => router.push(route(view)))
        }
      >
        <TabsList
          variant="line"
          className="ss-studio-tabs"
          aria-label={copy('Project studio tasks', 'مهام استوديو المشروع')}
        >
          {tabs.map((view) => (
            <TabsTrigger key={view} value={view}>
              {view === 'overview'
                ? copy('Overview', 'نظرة عامة')
                : view === 'files'
                  ? copy('Files', 'الملفات')
                  : view === 'reviews'
                    ? copy('Reviews', 'المراجعات')
                    : copy('Team', 'الفريق')}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          className="ss-tab-panel"
          forceMount
          value="overview"
          hidden={active !== 'overview'}
        >
          <section hidden={section !== 'overview'}>
            {state.role === 'lead' &&
              [
                'published',
                'final_screening',
                'supervisor_assessment',
                'committee_consensus',
                'faculty_decision',
              ].includes(state.workflow?.stage ?? '') && (
                <FinalPacketConsent
                  project={state.project.id}
                  version={state.project.version}
                  actor={actor}
                  locale={locale}
                />
              )}
            <MediaEditor
              locale={locale}
              readOnly={!state.editable}
              target={{
                kind: 'cover',
                project: state.project.id,
                version: state.project.version,
              }}
            />
            <div className="ss-overview-refined">
              <StudioCard
                title={copy('Next step', 'الخطوة التالية')}
                className="ss-next-step af-next-step"
              >
                <h3 dir="auto">
                  {state.workflow?.stage === 'published'
                    ? copy(
                        'Read the published final record',
                        'اقرأ السجل النهائي المنشور',
                      )
                    : state.workflow?.stage === 'retained'
                      ? copy(
                          'Read the internal final record',
                          'اقرأ السجل النهائي الداخلي',
                        )
                      : state.workflow?.stage === 'returned'
                        ? state.role === 'supervisor'
                          ? copy(
                              'Awaiting revised final',
                              'بانتظار الإرسال النهائي المعدّل',
                            )
                          : copy(
                              'Make final changes',
                              'أجرِ التعديلات النهائية',
                            )
                        : state.workflow?.stage === 'final_requested'
                          ? state.role === 'lead'
                            ? copy(
                                'Final submission requested',
                                'طُلب الإرسال النهائي',
                              )
                            : copy(
                                'Help finish the project',
                                'ساعد في إكمال المشروع',
                              )
                          : state.workflow?.stage === 'final_screening'
                            ? copy(
                                'Awaiting supervisor review',
                                'بانتظار مراجعة المشرف',
                              )
                            : [
                                  'supervisor_assessment',
                                  'committee_consensus',
                                  'faculty_decision',
                                ].includes(state.workflow?.stage ?? '')
                              ? copy(
                                  'Academic assessment in progress',
                                  'التقييم الأكاديمي جارٍ',
                                )
                              : state.lifecycle === 'awaiting_review'
                                ? copy(
                                    'Awaiting checkpoint feedback',
                                    'بانتظار ملاحظات نقطة المراجعة',
                                  )
                                : state.lifecycle === 'changes_requested'
                                  ? copy(
                                      'Follow supervisor feedback',
                                      'تابع ملاحظات المشرف',
                                    )
                                  : state.role === 'supervisor'
                                    ? copy('Team preparation', 'إعداد الفريق')
                                    : copy(
                                        'Prepare the project',
                                        'جهّز المشروع',
                                      )}
                </h3>
                {state.workflow?.screening?.outcome === 'returned' &&
                  !(
                    state.workflow.stage === 'returned' &&
                    state.workflow.revision
                  ) && (
                    <blockquote className="af-return-feedback">
                      <p dir="auto">{state.workflow.screening.reason}</p>
                      <footer>
                        <bdi dir="auto">{state.workflow.screening.actor}</bdi> ·{' '}
                        {date(locale, state.workflow.screening.recordedAt)}
                      </footer>
                    </blockquote>
                  )}
                {state.workflow?.stage === 'returned' &&
                  state.workflow.revision && (
                    <blockquote className="af-return-feedback">
                      <p dir="auto">{state.workflow.revision.reason}</p>
                      <footer>
                        <bdi dir="auto">{state.workflow.revision.actor}</bdi> ·{' '}
                        {date(locale, state.workflow.revision.requestedAt)}
                      </footer>
                    </blockquote>
                  )}
                {state.canResubmit && (
                  <Button asChild variant="outline">
                    <Link
                      href={
                        '/' +
                        locale +
                        '/projects/' +
                        state.project.id +
                        '/final'
                      }
                    >
                      {copy('Resubmit final work', 'أعد إرسال العمل النهائي')}
                    </Link>
                  </Button>
                )}
                {state.role === 'supervisor' ? (
                  <>
                    {(state.workflow?.stage !== 'returned' ||
                      state.workflow.canRequest) && (
                      <CompletionRequest
                        locale={locale}
                        actor={actor}
                        state={state}
                      />
                    )}
                    {state.workflow?.submission &&
                      [
                        'final_screening',
                        'supervisor_assessment',
                        'committee_consensus',
                        'faculty_decision',
                      ].includes(state.workflow.stage) && (
                        <Button asChild>
                          <Link
                            href={
                              '/' +
                              locale +
                              '/supervision/finals/' +
                              state.workflow.submission +
                              '/' +
                              {
                                final_screening: 'screening',
                                supervisor_assessment: 'assessment',
                                committee_consensus: 'committee',
                                faculty_decision: 'decision',
                              }[state.workflow.stage as 'final_screening'] +
                              '?from=' +
                              encodeURIComponent(parent)
                            }
                          >
                            {state.workflow.stage === 'final_screening'
                              ? copy('Review final', 'راجع الإرسال النهائي')
                              : copy('Continue assessment', 'تابع التقييم')}
                          </Link>
                        </Button>
                      )}
                    {state.lifecycle === 'awaiting_review' && state.latest && (
                      <Button asChild variant="outline">
                        <Link
                          href={
                            '/' +
                            locale +
                            '/supervision/rounds/' +
                            state.latest.id +
                            '?from=' +
                            encodeURIComponent(parent)
                          }
                        >
                          {copy('Review checkpoint', 'راجع نقطة المراجعة')}
                        </Link>
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p dir="auto" className="ss-muted">
                      {state.workflow?.stage === 'returned'
                        ? copy(
                            'Make the requested changes in the working files and details. The recorded revision request authorizes the current lead to resubmit; no extra supervisor request is needed.',
                            'أجرِ التعديلات المطلوبة في ملفات العمل والتفاصيل. يتيح طلب التعديل المسجل للقائد الحالي إعادة الإرسال؛ لا يلزم طلب إضافي من المشرف.',
                          )
                        : state.workflow?.stage === 'final_requested'
                          ? copy(
                              'Your supervisor has requested final work. Review the project details, team and files before submitting.',
                              'طلب المشرف العمل النهائي. راجع تفاصيل المشروع والفريق والملفات قبل الإرسال.',
                            )
                          : state.editable
                            ? copy(
                                'Save the project details and add your original files. A final request from your supervisor starts the submission step.',
                                'احفظ تفاصيل المشروع وأضف ملفاتك الأصلية. يبدأ طلب المشرف للإرسال النهائي خطوة التسليم.',
                              )
                            : copy(
                                'Submitted work is read only. Follow its review status and the supervisor response.',
                                'العمل المرسل للقراءة فقط. تابع حالة المراجعة ورد المشرف.',
                              )}
                    </p>
                    {state.workflow?.request?.note &&
                      state.workflow.stage === 'final_requested' && (
                        <p className="af-return-feedback" dir="auto">
                          {state.workflow.request.note}
                        </p>
                      )}
                    <Button asChild>
                      <Link
                        href={
                          state.workflow?.stage === 'returned'
                            ? route('files')
                            : state.workflow?.stage === 'final_requested' &&
                                state.role === 'lead'
                              ? '/' +
                                locale +
                                '/projects/' +
                                state.project.id +
                                '/final'
                              : !state.editable && state.final
                                ? '/' +
                                  locale +
                                  '/submissions/' +
                                  state.final.id +
                                  '?from=' +
                                  encodeURIComponent(parent)
                                : state.lifecycle === 'awaiting_review' ||
                                    state.lifecycle === 'changes_requested'
                                  ? route('reviews')
                                  : route(state.files.length ? 'edit' : 'files')
                        }
                      >
                        {state.workflow?.stage === 'returned'
                          ? copy(
                              'Make final changes',
                              'أجرِ التعديلات النهائية',
                            )
                          : state.workflow?.stage === 'final_requested' &&
                              state.role === 'lead'
                            ? copy(
                                'Prepare final submission',
                                'جهّز الإرسال النهائي',
                              )
                            : !state.editable && state.final
                              ? copy('Read final record', 'اقرأ السجل النهائي')
                              : state.lifecycle === 'awaiting_review' ||
                                  state.lifecycle === 'changes_requested'
                                ? copy(
                                    'Read checkpoint feedback',
                                    'اقرأ ملاحظات نقطة المراجعة',
                                  )
                                : state.files.length
                                  ? copy(
                                      'Complete project details',
                                      'أكمل تفاصيل المشروع',
                                    )
                                  : copy(
                                      'Add project files',
                                      'أضف ملفات المشروع',
                                    )}
                        <ArrowUpRight />
                      </Link>
                    </Button>
                    {state.role === 'lead' &&
                      state.editable &&
                      !state.workflow?.requestValid && (
                        <details className="af-optional-progress">
                          <summary>
                            {copy(
                              'Ask for progress feedback (optional)',
                              'اطلب ملاحظات التقدم (اختياري)',
                            )}
                          </summary>
                          <p dir="auto">
                            {copy(
                              'A checkpoint is a progress review, separate from final submission.',
                              'نقطة المراجعة مراجعة للتقدم، منفصلة عن الإرسال النهائي.',
                            )}
                          </p>
                          <CheckpointSend
                            locale={locale}
                            actor={actor}
                            state={state}
                            blocked={dirty}
                            variant="outline"
                          />
                        </details>
                      )}
                  </>
                )}
              </StudioCard>
              <BidiFacts className="ss-progress-strip">
                <BidiFact>
                  <BidiLabel dir="auto">
                    {copy('Project updated', 'آخر تحديث للمشروع')}
                  </BidiLabel>
                  <BidiData dir="auto">
                    {date(locale, state.project.updatedAt)}
                  </BidiData>
                  {state.editable && state.role !== 'supervisor' && (
                    <BidiData dir="auto">
                      <Button asChild variant="ghost">
                        <Link href={route('edit')}>
                          {copy('Edit project details', 'تحرير تفاصيل المشروع')}
                        </Link>
                      </Button>
                    </BidiData>
                  )}
                </BidiFact>
                <BidiFact>
                  <BidiLabel dir="auto">
                    {copy('Ready files', 'الملفات المقبولة')}
                  </BidiLabel>
                  <BidiData dir="auto">{state.files.length}</BidiData>
                </BidiFact>
                <BidiFact>
                  <BidiLabel dir="auto">
                    {copy('Latest checkpoint', 'آخر نقطة مراجعة')}
                  </BidiLabel>
                  <BidiData dir="auto">
                    {state.latest
                      ? state.latest.number
                      : copy('Not sent', 'لم تُرسل')}
                  </BidiData>
                </BidiFact>
              </BidiFacts>
              {state.latest?.decision && (
                <StudioCard
                  title={copy('Latest supervisor response', 'أحدث رد للمشرف')}
                  className="ss-feedback-panel"
                >
                  <blockquote>
                    <p dir="auto">
                      <bdi dir="auto">
                        {state.latest.decision.comment ||
                          copy(
                            'Accepted for continued work.',
                            'قُبلت لمتابعة العمل.',
                          )}
                      </bdi>
                    </p>
                    <footer>
                      <bdi dir="auto">{state.latest.decision.actor}</bdi> ·{' '}
                      {copy('Checkpoint', 'نقطة المراجعة')}{' '}
                      {state.latest.number} ·{' '}
                      {date(locale, state.latest.decision.decidedAt)}
                    </footer>
                  </blockquote>
                  <Button asChild variant="ghost">
                    <Link href={route('reviews')}>
                      {copy('Open review history', 'فتح سجل المراجعات')}
                    </Link>
                  </Button>
                </StudioCard>
              )}
            </div>
          </section>
          {state.role !== 'supervisor' && (
            <MetadataEditor
              locale={locale}
              actor={actor}
              state={state}
              rootPath={rootPath}
              active={section === 'edit'}
              locked={task === 'metadata' ? locked : undefined}
              onDirty={setDirty}
            />
          )}
        </TabsContent>
        <TabsContent
          className="ss-tab-panel"
          forceMount
          value="files"
          hidden={active !== 'files'}
        >
          <section hidden={section !== 'files'}>
            <FileWorkspace
              key={actor + ':' + state.project.version}
              locale={locale}
              actor={actor}
              project={state.project.id}
              version={state.project.version}
              initialFiles={state.files}
              initialFile={initialFile}
              editable={state.editable}
              lead={state.role === 'lead'}
              uploadBase={uploadBase}
              quota={state.quota}
              versionNumber={state.versionNumber}
              projectTitle={state.project.metadata.title}
              archived={state.project.status === 'archived'}
            />
          </section>
        </TabsContent>
        <TabsContent
          className="ss-tab-panel"
          forceMount
          value="reviews"
          hidden={active !== 'reviews'}
        >
          <section hidden={section !== 'reviews'}>
            <SemesterReviews
              locale={locale}
              actor={actor}
              state={state}
              rootPath={rootPath}
              selected={selectedRound}
              blocked={dirty}
              locked={task === 'checkpoint' ? locked : undefined}
            />
            {selectedRound && (
              <FileWorkspace
                key={actor + ':' + selectedRound.id}
                locale={locale}
                actor={actor}
                project={state.project.id}
                version={selectedRound.version}
                initialFiles={selectedRound.files}
                editable={false}
                lead={false}
                submission={selectedRound.id}
              />
            )}
          </section>
        </TabsContent>
        <TabsContent
          className="ss-tab-panel"
          forceMount
          value="team"
          hidden={active !== 'team'}
        >
          <section hidden={section !== 'team'}>
            <StudioTeam locale={locale} record={team} />
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
