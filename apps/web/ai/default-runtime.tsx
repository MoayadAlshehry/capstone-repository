'use client';
import { useRouter } from 'next/navigation';
import { FileText, FileCode2, FileSpreadsheet, FileImage } from 'lucide-react';
import { useContext, useId, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAssistantDataUI,
  useAui,
  type ChatModelAdapter,
  type SuggestionAdapter,
  type ChatModelRunResult,
  type DataMessagePartComponent,
  useAuiState,
} from '@assistant-ui/react';
import { AssistantModal } from '@/components/assistant-ui/elements/assistant-modal.aui';
import { Sources } from '@/components/assistant-ui/elements/sources';
import { ThinkingIndicator } from '@/components/assistant-ui/elements/thinking-indicator';
import { ConnectionState } from '@/components/assistant-ui/elements/connection-state';
import { TypingIndicator } from '@/components/assistant-ui/elements/typing-indicator';
import { RequestLoader } from './loader';
import { DocumentReference } from '@/components/assistant-ui/elements/document-reference';
import { RichAnswer } from './rich-view';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { RichBlock } from './types';
import { ErrorState } from '@/components/assistant-ui/elements/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldContent,
} from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AssistantPortal,
  AssistantOverlayPortal,
} from '@/lib/assistant-portal';
import { aiStream } from './transport';
import type { AILocale, AIEffort, AICitation } from './types';
import type { Selection } from './context';
import { OfficialContext } from './official-locale';
import { useAISystem } from './context';
const textOf = (m: { content: readonly { type: string; text?: string }[] }) =>
  m.content
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n');
const safeText = (text: string) =>
  text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s<>]+/g, '');
export function DefaultConversation({
  selection,
  locale,
  open,
  mode,
  theme,
  portal,
  onClose,
}: {
  selection: Selection;
  locale: AILocale;
  open: boolean;
  mode: AIEffort;
  theme: string;
  portal: ShadowRoot;
  onClose: () => void;
}) {
  const router = useRouter(),
    system = useAISystem();
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);
  const current = useRef({ selection, mode });
  current.current = { selection, mode };
  const actionByMessage = useRef(
    new Map<string, 'ask' | 'snapshot' | 'discover'>(),
  );
  const handled = useRef(0),
    nextAction = useRef<'ask' | 'snapshot' | 'discover'>(
      selection.kind === 'summary'
        ? 'snapshot'
        : selection.kind === 'discover'
          ? 'discover'
          : 'ask',
    );
  const adapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ messages, abortSignal }) {
        const last = messages.filter((m) => m.role === 'user').at(-1);
        if (!last) return;
        const question = textOf(last).slice(0, 600),
          { selection: context, mode: effort } = current.current;
        const action =
          actionByMessage.current.get(last.id) ?? nextAction.current;
        actionByMessage.current.set(last.id, action);
        if (actionByMessage.current.size > 32)
          actionByMessage.current.delete(
            actionByMessage.current.keys().next().value!,
          );
        nextAction.current = context.kind === 'discover' ? 'discover' : 'ask';
        const history: { question: string; answer: string }[] = [];
        for (let i = 0; i < messages.length - 2; i++)
          if (
            messages[i]?.role === 'user' &&
            messages[i + 1]?.role === 'assistant'
          )
            history.push({
              question: textOf(messages[i]!).slice(0, 600),
              answer: textOf(messages[i + 1]!)
                .replace(/\[[^\]]+\]\([^)]+\)/g, '')
                .slice(0, 2500),
            });
        const sources: AICitation[] = [];
        const notices: string[] = [];
        let retrieved: AICitation[] = [],
          rich: { block: RichBlock; sources: AICitation[] } | null = null;
        let text = '',
          answerLocale = locale,
          readLabel = '',
          state = 'retrieving',
          error = '',
          discovery: unknown = null,
          metrics: Record<string, unknown> = {};
        const update = (): ChatModelRunResult => {
          const content: Array<
            NonNullable<ChatModelRunResult['content']>[number]
          > = [];
          if (text) content.push({ type: 'text', text });
          if (rich && notices.length)
            content.push({
              type: 'data',
              name: 'capstone-notices',
              data: [...notices],
            });
          if (rich)
            content.push({ type: 'data', name: 'capstone-rich', data: rich });
          if (sources.length)
            content.push({
              type: 'data',
              name: 'capstone-sources',
              data: [...sources],
            });
          if (retrieved.length)
            content.push({
              type: 'data',
              name: 'capstone-retrieval',
              data: retrieved,
            });
          if (discovery)
            content.push({
              type: 'data',
              name: 'capstone-filters',
              data: discovery,
            });
          if (error)
            content.push({
              type: 'data',
              name: 'capstone-error',
              data: { code: error },
            });
          else if (!['completed', 'insufficient'].includes(state))
            content.push({
              type: 'data',
              name: 'capstone-status',
              data: { state, label: readLabel },
            });
          return {
            content,
            ...(error
              ? {
                  status: {
                    type: 'incomplete' as const,
                    reason: 'error' as const,
                    error,
                  },
                }
              : action === 'snapshot' && state === 'completed'
                ? {
                    status: {
                      type: 'complete' as const,
                      reason: 'stop' as const,
                    },
                  }
                : {}),
            metadata: {
              custom: {
                state,
                error,
                metrics,
                references: sources,
                responseLocale: answerLocale,
              },
            },
          };
        };
        yield update();
        const body =
          action === 'discover'
            ? { action, locale, query: question.slice(0, 300) }
            : action === 'snapshot'
              ? {
                  action,
                  locale,
                  project: context.project!.id,
                  ...(context.project?.version
                    ? { version: context.project.version }
                    : {}),
                }
              : {
                  action,
                  locale,
                  project: context.project!.id,
                  ...(context.project?.version
                    ? { version: context.project.version }
                    : {}),
                  question,
                  history: history.slice(-2),
                  effort,
                };
        try {
          for await (const event of aiStream(body, abortSignal)) {
            if (event.type === 'tool') {
              readLabel = event.phase === 'start' ? event.label : '';
              if (event.phase === 'start') state = 'retrieving';
            }
            if (event.type === 'status')
              state =
                event.state === 'verifying' && !text ? 'typing' : event.state;
            if (event.type === 'activity' && event.stage === 'composing')
              state = 'typing';
            if (event.type === 'retrieval') retrieved = event.sources;
            if (event.type === 'block') {
              rich = { block: event.block, sources: event.sources };
              sources.push(...event.sources);
              text =
                '## ' +
                event.block.title +
                '\n\n' +
                event.block.rows
                  .map(
                    (row) =>
                      ('label' in row
                        ? row.label + ': ' + row.value
                        : row.cells.join(' | ')) +
                      ' ' +
                      row.sourceIds
                        .map((id) => {
                          const source = event.sources.find((s) => s.id === id);
                          return source
                            ? '[' + source.label + '](' + source.href + ')'
                            : '';
                        })
                        .join(' '),
                  )
                  .join('\n\n');
            }
            if (event.type === 'answer') {
              answerLocale = event.locale ?? answerLocale;
              const citations: string[] = [];
              for (const source of event.sources) {
                const at = sources.findIndex((s) => s.id === source.id);
                const n = at < 0 ? sources.push(source) : at + 1;
                citations.push(
                  '[' +
                    new Intl.NumberFormat(locale).format(n) +
                    '](' +
                    source.href +
                    ')',
                );
              }
              text +=
                (text ? '\n\n' : '') +
                safeText(event.text) +
                (citations.length ? ' ' + citations.join(' ') : '');
            }
            if (event.type === 'result' && action === 'snapshot') {
              const result = event.value as { snapshot?: { summary: string } };
              if (result.snapshot) {
                text =
                  (locale === 'ar'
                    ? '**ملخص مولّد بالذكاء الاصطناعي**\n\n'
                    : '**AI-generated brief**\n\n') +
                  safeText(result.snapshot.summary) +
                  '\n\n[' +
                  (locale === 'ar'
                    ? 'قراءة الملخص الأصلي'
                    : 'Read original abstract') +
                  '](/' +
                  locale +
                  '/catalogue/' +
                  context.project!.id +
                  '#original-abstract)';
              }
            }
            if (event.type === 'result' && action === 'discover') {
              discovery = event.value;
              text =
                locale === 'ar'
                  ? 'راجع عوامل التصفية المقترحة قبل تطبيقها على الدليل.'
                  : 'Review these suggested filters before applying them to the catalogue.';
            }
            if (event.type === 'notice') {
              notices.push(event.text);
              text += (text ? '\n\n' : '') + '> ' + safeText(event.text);
            }
            if (event.type === 'metrics') metrics = event.value;
            if (event.type === 'error') {
              error = event.code;
              state = event.state;
            }
            if (action !== 'snapshot' || !text || error) yield update();
          }
        } catch (e) {
          if (abortSignal.aborted) return;
          error = e instanceof Error ? e.message : 'UNAVAILABLE';
        }
        if (!error && state !== 'insufficient') state = 'completed';
        yield update();
      },
    }),
    [
      locale,
      selection.project?.id,
      selection.project?.version,
      selection.kind === 'discover',
    ],
  );
  const suggestions = useMemo<SuggestionAdapter>(
    () => ({
      key: locale + ':' + (selection.project?.id ?? 'discovery'),
      async generate({ messages, signal }) {
        if (signal?.aborted || !selection.project) return [];
        const last = messages
          .filter((message) => message.role === 'assistant')
          .at(-1);
        if (
          !last ||
          last.status.type !== 'complete' ||
          last.metadata.custom?.['error'] ||
          last.metadata.custom?.['state'] === 'insufficient'
        )
          return [];
        const part = last.content.find(
          (part) => part.type === 'data' && part.name === 'capstone-sources',
        );
        const references =
          part && 'data' in part ? (part.data as AICitation[]) : [];
        const files = [
          ...new Map(
            references
              .filter((source) => source.file)
              .map((source) => [source.file, source]),
          ).values(),
        ];
        if (!files.length) return [];
        return [
          {
            title: locale === 'ar' ? 'استكشف المنهج' : 'Explore the method',
            prompt:
              locale === 'ar'
                ? 'ما المنهج وخطوات التحقق الموثقة في ' + files[0]!.name + '؟'
                : 'What method and validation steps are documented in ' +
                  files[0]!.name +
                  '?',
          },
          {
            title: locale === 'ar' ? 'افهم القيود' : 'Understand the limits',
            prompt:
              locale === 'ar'
                ? 'ما الافتراضات والقيود الموثقة في ' +
                  (files[1] ?? files[0])!.name +
                  '؟'
                : 'What assumptions and limitations are documented in ' +
                  (files[1] ?? files[0])!.name +
                  '?',
          },
        ];
      },
    }),
    [locale, selection.project?.id, selection.project?.version],
  );
  const runtime = useLocalRuntime(adapter, {
    adapters: { suggestion: suggestions },
  });
  useEffect(() => {
    if (!open) runtime.thread.cancelRun();
    return () => runtime.thread.cancelRun();
  }, [open, runtime]);
  useEffect(() => {
    if (!open || selection.serial === handled.current) return;
    handled.current = selection.serial;
    if (selection.kind === 'summary') {
      nextAction.current = 'snapshot';
      runtime.thread.append({
        role: 'user',
        content: [
          { type: 'text', text: locale === 'ar' ? 'ملخص ذكي' : 'AI Brief' },
        ],
      });
    } else if (selection.kind === 'discover' && selection.query)
      runtime.thread.composer.setText(selection.query.slice(0, 300));
  }, [
    selection.serial,
    open,
    runtime,
    locale,
    selection.kind,
    selection.query,
  ]);
  return (
    <AssistantPortal.Provider value={portalRoot ?? portal}>
      <AssistantOverlayPortal.Provider
        value={overlayRoot ?? portalRoot ?? portal}
      >
        <OfficialContext.Provider value={{ locale, kind: selection.kind }}>
          <AssistantRuntimeProvider runtime={runtime}>
            <TooltipProvider>
              <DataBindings onClose={onClose} />
              <div
                ref={setPortalRoot}
                data-capstone-ai
                data-theme={theme}
                data-language={locale}
                className={
                  'bg-background text-foreground font-sans antialiased' +
                  (theme === 'dark' ? ' dark' : '')
                }
                dir="ltr"
                onClickCapture={(event) => {
                  const link = (event.target as Element).closest('a');
                  if (
                    !link ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey ||
                    event.shiftKey
                  )
                    return;
                  const href = link.getAttribute('href');
                  if (
                    !href ||
                    !selection.project ||
                    !href.startsWith(
                      '/' + locale + '/catalogue/' + selection.project.id,
                    )
                  )
                    return;
                  event.preventDefault();
                  onClose();
                  const target = new URL(href, location.href);
                  if (target.hash === '#original-abstract') {
                    requestAnimationFrame(() => {
                      const element =
                        document.getElementById('original-abstract');
                      if (element) {
                        element.scrollIntoView({ block: 'center' });
                        element.setAttribute('tabindex', '-1');
                        element.focus({ preventScroll: true });
                      }
                    });
                  }
                  if (
                    target.pathname === location.pathname &&
                    target.search === location.search
                  ) {
                    if (target.hash !== location.hash)
                      history.pushState(null, '', target.href);
                    router.refresh();
                  } else router.push(href, { scroll: false });
                }}
              >
                <AssistantModal
                  open={open}
                  onOpenChange={(value) => {
                    if (!value) onClose();
                    else system.open('ask', selection.project);
                  }}
                  projectTitle={selection.project?.title ?? ''}
                />
                <div
                  ref={setOverlayRoot}
                  data-assistant-overlay-root
                  className="aui-overlay-root"
                />
              </div>
            </TooltipProvider>
          </AssistantRuntimeProvider>
        </OfficialContext.Provider>
      </AssistantOverlayPortal.Provider>
    </AssistantPortal.Provider>
  );
}
function DataBindings({ onClose }: { onClose: () => void }) {
  useAssistantDataUI({ name: 'capstone-notices', render: AnswerNotices });
  useAssistantDataUI({ name: 'capstone-status', render: Status });
  useAssistantDataUI({
    name: 'capstone-rich',
    render: ({ data }) => (
      <RichAnswer {...(data as { block: RichBlock; sources: AICitation[] })} />
    ),
  });
  useAssistantDataUI({ name: 'capstone-retrieval', render: Retrieval });
  useAssistantDataUI({ name: 'capstone-sources', render: Evidence });
  useAssistantDataUI({ name: 'capstone-error', render: Failure });
  useAssistantDataUI({
    name: 'capstone-filters',
    render: (props) => <FilterResult {...props} onClose={onClose} />,
  });
  return null;
}
const AnswerNotices: DataMessagePartComponent = ({ data }) => {
  const { locale } = useContext(OfficialContext);
  return (
    <Alert className="ai-answer-notice my-3">
      <AlertDescription dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {(data as string[]).map((text, index) => (
          <p key={index}>{text}</p>
        ))}
      </AlertDescription>
    </Alert>
  );
};
const Status: DataMessagePartComponent = ({ data }) => {
  const running = useAuiState((s) => s.message.status?.type === 'running');
  const hasAnswer = useAuiState((s) =>
    s.message.content.some(
      (part) =>
        (part.type === 'text' && part.text.length > 0) ||
        (part.type === 'data' && part.name === 'capstone-rich'),
    ),
  );
  const { locale } = useContext(OfficialContext),
    state = (data as { state: string }).state,
    detail = (data as { label?: string }).label;
  const labels: Record<string, [string, string]> = {
    queued: ['Waiting for inference', 'بانتظار الاستدلال'],
    retrieving: ['Checking project sources…', 'جارٍ مراجعة مصادر المشروع…'],
    generating: ['Preparing the answer', 'إعداد الإجابة'],
    reasoning: ['Reasoning over the sources', 'التفكير في المصادر'],
    verifying: ['Checking the answer', 'التحقق من الإجابة'],
    indexing: ['Reading public documents', 'قراءة المستندات العامة'],
  };
  const label = labels[state] ?? labels.generating!;
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [running]);
  if (!running || hasAnswer) return null;
  if (state === 'retrieving' || state === 'indexing' || state === 'queued')
    return (
      <span className="flex items-center gap-2 text-sm" role="status">
        <RequestLoader label={detail || label[locale === 'ar' ? 1 : 0]!} />
      </span>
    );
  if (state === 'typing')
    return (
      <TypingIndicator
        variant="bare"
        label={
          locale === 'ar' ? 'إعداد النص المتحقق منه' : 'Preparing verified text'
        }
      />
    );
  return (
    <ThinkingIndicator
      label={label[locale === 'ar' ? 1 : 0]}
      elapsed={elapsed + 's'}
      role="status"
      aria-live="polite"
    />
  );
};
function fileGroups(sources: AICitation[]) {
  const groups = new Map<string, AICitation[]>();
  for (const source of sources) {
    const key = [
      source.project,
      source.version,
      source.file ?? 'metadata',
    ].join(':');
    const group = groups.get(key) ?? [];
    if (!group.some((s) => s.href === source.href && s.quote === source.quote))
      group.push(source);
    groups.set(key, group);
  }
  return [...groups.values()];
}
function useSourceJump() {
  const router = useRouter(),
    system = useAISystem();
  return (source: AICitation) => {
    system.close();
    const target = new URL(source.href, location.href);
    if (
      target.pathname === location.pathname &&
      target.search === location.search
    ) {
      history.pushState(null, '', target.href);
      router.refresh();
    } else router.push(source.href, { scroll: false });
  };
}
function SourceDocument({
  sources,
  compact = false,
}: {
  sources: AICitation[];
  compact?: boolean;
}) {
  const { locale } = useContext(OfficialContext),
    jump = useSourceJump();
  return (
    <DocumentReference
      title={sources[0]!.name}
      icon={
        /\.(?:py|js|ts|json|sql)$/i.test(sources[0]!.name) ? (
          <FileCode2 size={16} />
        ) : /\.csv$/i.test(sources[0]!.name) ? (
          <FileSpreadsheet size={16} />
        ) : /\.(?:png|jpg|webp)$/i.test(sources[0]!.name) ? (
          <FileImage size={16} />
        ) : (
          <FileText size={16} />
        )
      }
      anchors={(compact ? sources.slice(0, 1) : sources).map((source, i) => ({
        page: i,
        label: source.label,
        quote: source.quote,
      }))}
      activePage={-1}
      compact={compact}
      countLabel={
        locale === 'ar'
          ? compact || sources.length === 1
            ? 'موضع موثق'
            : 'مواضع موثقة'
          : compact || sources.length === 1
            ? 'documented locator'
            : 'documented locators'
      }
      onJump={(i) => jump(sources[i]!)}
    />
  );
}
const Evidence: DataMessagePartComponent = ({ data }) => {
  const { locale } = useContext(OfficialContext),
    [open, setOpen] = useState(false),
    groups = fileGroups(data as AICitation[]),
    ar = locale === 'ar';
  return (
    <Sources
      sources={groups.map((group) => ({
        title: group[0]!.name,
        url: group[0]!.href,
      }))}
      triggerLabel={ar ? 'المصادر' : 'Sources'}
      open={open}
      onOpenChange={setOpen}
      layout="list"
      locale={locale}
      renderSource={(_source, i) => (
        <details className="ai-source-file">
          <summary>
            <FileText size={16} />
            <span>{groups[i]![0]!.name}</span>
            <small>
              {groups[i]!.length}{' '}
              {ar
                ? groups[i]!.length === 1
                  ? 'موضع'
                  : 'مواضع'
                : groups[i]!.length === 1
                  ? 'locator'
                  : 'locators'}
            </small>
          </summary>
          <SourceDocument sources={groups[i]!} />
        </details>
      )}
    />
  );
};
const Retrieval: DataMessagePartComponent = ({ data }) => {
  const running = useAuiState((s) => s.message.status?.type === 'running'),
    { locale } = useContext(OfficialContext),
    groups = fileGroups((data as AICitation[]).filter((s) => s.file));
  if (!running) return null;
  return (
    <div
      className="ai-source-preview"
      aria-label={
        locale === 'ar' ? 'مصادر قيد المراجعة' : 'Sources being checked'
      }
    >
      {groups.slice(0, 2).map((group) => (
        <SourceDocument key={group[0]!.file} sources={group} compact />
      ))}
      {groups.length > 2 && (
        <span className="text-xs text-muted-foreground">
          +{groups.length - 2} {locale === 'ar' ? 'ملفات أخرى' : 'more files'}
        </span>
      )}
    </div>
  );
};
const Failure: DataMessagePartComponent = ({ data }) => {
  const { locale } = useContext(OfficialContext),
    aui = useAui(),
    code = (data as { code: string }).code;
  const ar = locale === 'ar';
  const detail = ['OUTPUT_TRUNCATED', 'INVALID_OUTPUT'].includes(code)
    ? ar
      ? 'بلغ الاستدلال حد المخرجات قبل إجابة مكتملة. أعد المحاولة أو اختر الوضع السريع بنفسك.'
      : 'The inference output limit was reached before a complete answer. Retry, or explicitly select Quick in the composer.'
    : ['FORMAT_VALIDATION_FAILED', 'INCOMPLETE_ANSWER'].includes(code)
      ? ar
        ? 'تعذر اعتماد تنسيق الإجابة. يمكنك إعادة المحاولة مع بقاء الوضع المحدد.'
        : 'The answer format could not be validated. You can retry in the selected mode.'
      : [
            'UNSUPPORTED_CLAIM',
            'UNSUPPORTED_QUOTE',
            'UNSUPPORTED_CITATION',
          ].includes(code)
        ? ar
          ? 'تعذر مطابقة بعض الإجابة مع المصادر المسموحة. أعد صياغة السؤال أو أعد المحاولة.'
          : 'The answer could not be supported by the permitted sources. Rephrase or retry.'
        : ['TIMED_OUT', 'DEADLINE_BEFORE_REPAIR'].includes(code)
          ? ar
            ? 'انتهت مهلة الإجابة. يمكنك إعادة المحاولة.'
            : 'The answer reached its time limit. You can retry.'
          : code === 'SOURCE_CHANGED'
            ? ar
              ? 'تغيّر إصدار المشروع. أعد فتح المشروع.'
              : 'The project edition changed. Reopen the project.'
            : ar
              ? 'تعذر إكمال الإجابة. يبقى المشروع وملفاته متاحين.'
              : 'The answer could not finish. The project and its files remain available.';
  return (
    <>
      {['OFFLINE', 'UNAVAILABLE', 'STREAM_INTERRUPTED'].includes(code) ? (
        <ConnectionState
          phase="dropped"
          message={detail}
          retryLabel={ar ? 'إعادة المحاولة' : 'Retry'}
          onRetry={() => aui.message.reload()}
        />
      ) : (
        <ErrorState
          title={ar ? 'تعذر إكمال الطلب' : 'Unable to finish'}
          detail={detail}
          retrying={false}
          onRetry={() => aui.message.reload()}
        />
      )}
    </>
  );
};
type Filters = {
  filters: Record<string, string>;
  options: Record<string, { value: string; label: string }[]>;
  warnings?: string[];
  related?: {
    id: string;
    title: string;
    university: string;
    department: string;
  }[];
};
function FilterResult({
  data,
  onClose,
}: {
  data: unknown;
  onClose: () => void;
}) {
  const { locale } = useContext(OfficialContext),
    value = data as Filters,
    [filters, setFilters] = useState(value.filters),
    ar = locale === 'ar';
  useEffect(() => setFilters(value.filters), [value]);
  const names: Record<string, string> = {
    q: ar ? 'الموضوع' : 'Topic',
    university: ar ? 'الجامعة' : 'University',
    department: ar ? 'القسم' : 'Department',
    academicYear: ar ? 'العام' : 'Year',
    domain: ar ? 'المجال' : 'Domain',
    sort: ar ? 'الترتيب' : 'Sort',
  };
  const id = useId();
  const [relatedOpen, setRelatedOpen] = useState(false);
  return (
    <FieldSet>
      <FieldLegend>
        {ar ? 'عوامل التصفية المقترحة' : 'Suggested catalogue filters'}
      </FieldLegend>
      {value.warnings?.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      <FieldGroup>
        {Object.entries(filters).map(([key, selected]) => (
          <Field key={key}>
            <FieldLabel htmlFor={id + key}>{names[key] ?? key}</FieldLabel>
            <Field orientation="horizontal">
              <FieldContent>
                {key === 'q' ? (
                  <Input
                    id={id + key}
                    value={selected}
                    maxLength={100}
                    dir="auto"
                    onChange={(event) =>
                      setFilters((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Select
                    dir={ar ? 'rtl' : 'ltr'}
                    value={selected}
                    onValueChange={(next) =>
                      setFilters((previous) => ({ ...previous, [key]: next }))
                    }
                  >
                    <SelectTrigger id={id + key}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {value.options[key]?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FieldContent>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={(ar ? 'إزالة ' : 'Remove ') + (names[key] ?? key)}
                onClick={() =>
                  setFilters((previous) =>
                    Object.fromEntries(
                      Object.entries(previous).filter(([name]) => name !== key),
                    ),
                  )
                }
              >
                {ar ? 'إزالة' : 'Remove'}
              </Button>
            </Field>
          </Field>
        ))}
      </FieldGroup>
      <Button
        type="button"
        onClick={() => {
          const params = new URLSearchParams(
            Object.entries(filters).filter(([, value]) => value.trim()),
          );
          const existing = new URLSearchParams(location.search);
          for (const key of ['view', 'sort'])
            if (existing.has(key) && !params.has(key))
              params.set(key, existing.get(key)!);
          location.assign(
            '/' + locale + '/catalogue' + (params.size ? '?' + params : ''),
          );
          onClose();
        }}
      >
        {ar ? 'تطبيق عوامل التصفية' : 'Apply filters'}
      </Button>
      {value.related?.length &&
      JSON.stringify(filters) === JSON.stringify(value.filters) ? (
        <Sources
          triggerLabel={
            ar ? 'مشاريع منشورة ذات صلة' : 'Related published projects'
          }
          sources={value.related.map((project) => ({
            title: project.title,
            url: '/' + locale + '/catalogue/' + project.id,
            snippet: project.university + ' · ' + project.department,
          }))}
          open={relatedOpen}
          onOpenChange={setRelatedOpen}
          layout="list"
          locale={locale}
        />
      ) : null}
    </FieldSet>
  );
}
