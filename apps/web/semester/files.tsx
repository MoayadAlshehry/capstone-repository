'use client';
import { BidiValue } from '@capstone/ui/bidi';
import { BidiData, BidiLabel } from '@capstone/ui/bidi';
import { BidiFacts } from '@capstone/ui/bidi';
import { useEffect, useState, useRef } from 'react';
import { AcademicExplorer } from './explorer';
import { Upload } from 'tus-js-client';
import type {
  SemesterFile,
  EditionHistory,
  EditionFile,
} from '@capstone/domain';
import { admittedPath, admittedSize } from '@capstone/domain';
import {
  Button,
  Badge,
  Progress,
  Field,
  FieldLabel,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@capstone/ui/workspace-v2';
import { Notice, t, size, date, type Locale } from './common';
import { useSemesterMemory } from './memory';
import { deniedRead } from './read-status';
import { UploadPlanner, type PlannedUpload } from './upload-planner';
import {
  workspaceHistoryEvent,
  type WorkspaceHistoryIntent,
} from '../assessment-studio/history-guard';

export async function completeTransferLeave<T extends { state: string }>(
  jobs: T[],
  mode: 'pause' | 'cancel',
  settle: (job: T) => Promise<void>,
  commit: () => void | Promise<void>,
) {
  for (const job of jobs) {
    await settle(job);
    if (
      job.state !== 'ready' &&
      job.state !== (mode === 'pause' ? 'paused' : 'cancelled')
    )
      return false;
  }
  await commit();
  return true;
}
export function transferNeedsSettlement(state: string) {
  return [
    'queued',
    'checking',
    'uploading',
    'confirming',
    'paused',
    'unknown',
  ].includes(state);
}
interface Transfer {
  id: string;
  path: string;
  size: number;
  offset: number;
  status: string;
  fingerprint: string;
  fileId: string | null;
  expiresAt: string;
}
interface Job {
  id: string;
  path: string;
  file?: File | undefined;
  fingerprint: string;
  correlation: string;
  bytes: number;
  size: number;
  state: string;
  url?: string | undefined;
  upload?: Upload;
  error?: string | undefined;
  intended?: 'public' | 'restricted';
  fileId?: string;
  batch?: string;
  policyState?: 'applying' | 'attention' | 'applied';
  applied?: string;
}
const fingerprint = async (file: File) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
export function FileWorkspace({
  locale,
  actor,
  project,
  version,
  initialFiles,
  initialFile,
  editable: initialEditable,
  lead: initialLead,
  uploadBase = '/files',
  submission,
  quota,
  purpose = 'CHECKPOINT',
  archived = false,
  readerOnly = false,
  versionNumber,
  projectTitle,
}: {
  locale: Locale;
  actor: string;
  project: string;
  version: string;
  initialFiles: SemesterFile[];
  initialFile?: string | undefined;
  editable: boolean;
  lead: boolean;
  uploadBase?: string | undefined;
  submission?: string | undefined;
  purpose?: 'CHECKPOINT' | 'FINAL' | undefined;
  archived?: boolean | undefined;
  readerOnly?: boolean | undefined;
  versionNumber?: number | undefined;
  projectTitle?: string | undefined;
  quota?:
    | { used: number; reserved: number; available: number; limit: number }
    | undefined;
}) {
  const memory = useSemesterMemory(actor, project),
    selectionKey = 'file.' + version + '.' + (submission ?? 'working'),
    [files, setFiles] = useState(initialFiles),
    [selected, setSelected] = useState(
      initialFile ?? memory[selectionKey] ?? initialFiles[0]?.id ?? '',
    ),
    [editable, setEditable] = useState(initialEditable),
    [lead, setLead] = useState(initialLead),
    [plannerOpen, setPlannerOpen] = useState(false),
    [browseFolder, setBrowseFolder] = useState(''),
    [reveal, setReveal] = useState<
      { file: string; nonce: string; reading?: boolean } | undefined
    >(
      initialFile
        ? { file: initialFile, nonce: 'initial.' + initialFile, reading: true }
        : undefined,
    ),
    [leave, setLeave] = useState<string | null>(null),
    [leaveBusy, setLeaveBusy] = useState(false),
    [leaveError, setLeaveError] = useState(false),
    [queueOpen, setQueueOpen] = useState(false),
    [policyChoice, setPolicyChoice] = useState<string | null>(null),
    [unavailable, setUnavailable] = useState(false),
    [error, setError] = useState(false),
    [jobs, setJobs] = useState<Job[]>([]),
    [transfers, setTransfers] = useState<Transfer[]>([]),
    [resumeErrors, setResumeErrors] = useState<Record<string, string>>({}),
    [storage, setStorage] = useState(quota),
    [policyBusy, setPolicyBusy] = useState(false),
    [policyError, setPolicyError] = useState(false);
  const [archivedPolicies, setArchivedPolicies] = useState<EditionFile[]>([]);
  const resumeInput = useRef<HTMLInputElement>(null),
    resumeTarget = useRef<Transfer | null>(null),
    jobRef = useRef<Job[]>([]),
    readEpoch = useRef(0),
    policyPayloads = useRef(new Map<string, unknown>()),
    policyBusyRef = useRef(false),
    leaving = useRef(false),
    leaveCommit = useRef<(() => void | Promise<void>) | null>(null),
    mounted = useRef(true),
    copy = (en: string, ar: string) => t(locale, en, ar);
  const nativeQuery = (mode: string, file?: string) =>
    '/api/native-files?' +
    new URLSearchParams({
      project,
      version,
      mode,
      ...(file ? { file } : {}),
      ...(submission ? { submission } : {}),
      ...(mode === 'preview' ? { syntax: 'studio' } : {}),
    }).toString();
  const uploadUrl = (path: string) => uploadBase + path;
  function deny() {
    readEpoch.current++;
    setFiles([]);
    setSelected('');
    setUnavailable(true);
    setError(true);
    setTransfers([]);
    setResumeErrors({});
    setStorage(undefined);
    setQueueOpen(false);
    setPlannerOpen(false);
    setEditable(false);
    setLead(false);
    setPolicyChoice(null);
    setArchivedPolicies([]);
    resumeTarget.current = null;
    if (resumeInput.current) resumeInput.current.value = '';
    jobRef.current.forEach((job) => {
      void job.upload?.abort(false);
      job.file = undefined;
    });
    jobRef.current = [];
    setJobs([]);
    window.dispatchEvent(
      new CustomEvent('semester-file-denied', {
        detail: { project, submission },
      }),
    );
  }
  function update(job: Job) {
    jobRef.current = jobRef.current.map((x) => (x.id === job.id ? job : x));
    if (mounted.current) setJobs([...jobRef.current]);
  }
  async function transferState() {
    const response = await fetch(
      uploadUrl('/state') + '?' + new URLSearchParams({ project, version }),
      { credentials: 'include', cache: 'no-store' },
    );
    if (!response.ok) throw Error('STATE_UNAVAILABLE');
    return (await response.json()) as {
      transfers: Transfer[];
      canUpload: boolean;
      quota: NonNullable<typeof quota>;
    };
  }
  async function refresh() {
    const epoch = ++readEpoch.current;
    setError(false);
    try {
      const response = await fetch(
        submission ? nativeQuery('tree') : '/api/semester?project=' + project,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        if (
          deniedRead(response.status) &&
          mounted.current &&
          epoch === readEpoch.current
        )
          deny();
        throw Error();
      }
      const value = (await response.json()) as {
        files: SemesterFile[];
        role?: string;
        project?: { version: string };
      };
      if (!mounted.current || epoch !== readEpoch.current) return;
      setUnavailable(false);
      setFiles(value.files);
      if (!submission)
        setLead(value.role === 'lead' && value.project?.version === version);
      if (!submission && archived && value.role === 'lead') {
        const policyReply = await fetch('/api/editions?project=' + project, {
          cache: 'no-store',
          headers: { 'X-Workspace-Actor': actor },
        });
        if (deniedRead(policyReply.status)) {
          if (mounted.current && epoch === readEpoch.current) deny();
          return;
        }
        if (!policyReply.ok) throw Error('POLICY_UNAVAILABLE');
        const history = (await policyReply.json()) as EditionHistory;
        const actual = history.items.find(
          (item) => item.id === version && item.status === 'archived',
        );
        if (mounted.current && epoch === readEpoch.current) {
          setArchivedPolicies(history.lead && actual ? actual.files : []);
          setFiles(
            value.files.map((file) => {
              const policy = actual?.files.find((item) => item.id === file.id);
              return policy
                ? {
                    ...file,
                    visibility: policy.visibility,
                    policyRevision: policy.revision,
                  }
                : file;
            }),
          );
        }
      } else setArchivedPolicies([]);
      setSelected((current) =>
        value.files.some((f) => f.id === current)
          ? current
          : (value.files[0]?.id ?? ''),
      );
      if (!submission && !archived) {
        const state = await transferState();
        if (mounted.current && epoch === readEpoch.current) {
          setEditable(state.canUpload);
          setTransfers(state.transfers);
          setStorage(state.quota);
        }
      } else if (archived && mounted.current && epoch === readEpoch.current) {
        // Frozen originals cannot have active uploads. Their authorized reads
        // and protective privacy changes must not depend on upload availability.
        setEditable(false);
        setTransfers([]);
      }
    } catch {
      if (mounted.current && epoch === readEpoch.current) setError(true);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const validate = () => {
      void refresh();
    };
    window.addEventListener('focus', validate);
    const interval = window.setInterval(validate, 30000);
    const clear = () => {
      jobRef.current.forEach((j) => {
        void j.upload?.abort(false);
        j.file = undefined;
      });
      jobRef.current = [];
      setJobs([]);

      setFiles([]);
      setSelected('');
    };
    window.addEventListener('semester-memory-cleared', clear);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', validate);
      window.clearInterval(interval);
      jobRef.current.forEach((j) => {
        void j.upload?.abort(false);
        j.file = undefined;
      });
      window.removeEventListener('semester-memory-cleared', clear);
    };
  }, [project, version, submission]);
  useEffect(() => {
    setFiles(initialFiles);
  }, [initialFiles]);
  useEffect(() => {
    if (initialFile)
      setReveal({
        file: initialFile,
        nonce: 'initial.' + initialFile,
        reading: true,
      });
  }, [initialFile]);
  useEffect(() => {
    memory[selectionKey] = selected;
  }, [selected, memory, selectionKey]);
  async function confirmedJob(job: Job) {
    try {
      const state = await transferState(),
        id = job.url?.split('/').at(-1),
        actual = state.transfers.find((x) =>
          id
            ? x.id === id
            : x.fingerprint === job.fingerprint && x.path === job.path,
        );
      if (actual?.status === 'completed' && actual.fileId) {
        job.state = 'ready';
        job.fileId = actual.fileId;
        job.applied = 'restricted';
        job.bytes = actual.offset;
        job.file = undefined;
        update(job);
        setSelected(actual.fileId);
      } else {
        job.state =
          actual?.status === 'failed'
            ? 'failed'
            : actual?.status === 'active'
              ? 'paused'
              : 'unknown';
        if (actual) job.bytes = actual.offset;
        update(job);
      }
      await refresh();
      pump();
      void applyPolicies();
    } catch {
      job.state = 'unknown';
      update(job);
      pump();
    }
  }
  async function start(job: Job, existing?: Transfer) {
    if (!job.file || !editable) return;
    job.state = 'checking';
    update(job);
    try {
      admittedPath(job.path);
      admittedSize(job.file.size);
      const hash = await fingerprint(job.file);
      if (existing && hash !== existing.fingerprint.split(':')[0]) {
        // A rejected local selection is not a failed server transfer. Keep its
        // validation message on the unfinished upload, without a stale retry job.
        setResumeErrors((errors) => ({
          ...errors,
          [existing.id]: copy(
            'Reselect the same original file; its content does not match.',
            'أعد اختيار الملف الأصلي نفسه؛ محتواه غير مطابق.',
          ),
        }));
        job.file = undefined;
        jobRef.current = jobRef.current.filter((item) => item.id !== job.id);
        setJobs([...jobRef.current]);
        pump();
        return;
      }
      if (!job.file || job.state === 'cancelled' || !mounted.current) return;
      if (
        job.state !== 'checking' ||
        !jobRef.current.some((j) => j.id === job.id)
      )
        return;
      job.fingerprint =
        existing?.fingerprint ??
        (job.url ? job.fingerprint : hash + ':' + job.correlation);
      const upload = new Upload(job.file, {
        endpoint: uploadUrl('/tus'),
        uploadUrl: existing
          ? uploadUrl('/tus/' + existing.id)
          : (job.url ?? null),
        chunkSize: 1024 * 1024,
        retryDelays: null,
        storeFingerprintForResuming: false,
        removeFingerprintOnSuccess: true,
        onBeforeRequest: (request) => {
          (request.getUnderlyingObject() as XMLHttpRequest).withCredentials =
            true;
        },
        metadata: {
          project,
          version,
          path: job.path,
          correlation: job.correlation,
          fingerprint: job.fingerprint,
        },
        onAfterResponse: async (request, response) => {
          const offset = Number(response.getHeader('Upload-Offset'));
          if (
            ['HEAD', 'PATCH'].includes(request.getMethod()) &&
            Number.isFinite(offset) &&
            offset >= 0 &&
            offset <= job.size
          ) {
            job.bytes = offset;
            job.url = upload.url ?? job.url;
            update(job);
          }
        },
        onChunkComplete: (_chunk, accepted) => {
          job.bytes = accepted;
          job.state = accepted === job.size ? 'confirming' : 'uploading';
          job.url = upload.url ?? job.url;
          update(job);
        },
        onSuccess: () => {
          job.url = upload.url ?? job.url;
          void confirmedJob(job);
        },
        onError: async () => {
          job.url = upload.url ?? job.url;
          job.state = 'unknown';
          job.error = copy(
            'Transfer interrupted. Check its server status before retrying.',
            'انقطع النقل. تحقق من حالته على الخادم قبل إعادة المحاولة.',
          );
          update(job);
          try {
            const s = await transferState(),
              actual = s.transfers.find((x) =>
                job.url
                  ? x.id === job.url.split('/').at(-1)
                  : x.fingerprint === job.fingerprint && x.path === job.path,
              );
            if (actual?.status === 'completed') {
              await confirmedJob(job);
              return;
            }
            if (actual) {
              job.bytes = actual.offset;
              job.state = actual.status === 'active' ? 'paused' : 'failed';
              job.error =
                actual.status === 'active'
                  ? undefined
                  : copy(
                      'The server did not admit this file. Review its type, path and storage limit.',
                      'لم يقبل الخادم هذا الملف. راجع نوعه ومساره وحد التخزين.',
                    );
              update(job);
            } else {
              job.state = 'failed';
              job.error = copy(
                'File admission failed. Review its type, path and project storage.',
                'فشل قبول الملف. راجع نوعه ومساره وتخزين المشروع.',
              );
              update(job);
            }
            await refresh();
            pump();
            void applyPolicies();
          } catch {}
        },
      });
      job.upload = upload;
      job.state = 'uploading';
      update(job);
      upload.start();
    } catch {
      job.state = 'failed';
      job.error = copy(
        'Use a supported original file within the 250 MB per-file limit and a safe relative path.',
        'استخدم ملفًا أصليًا مدعومًا ضمن حد 250 ميجابايت ومسارًا نسبيًا آمنًا.',
      );
      update(job);
      pump();
      void applyPolicies();
    }
  }
  function pump() {
    if (leaving.current || !mounted.current) return;
    const active = jobRef.current.filter((j) =>
      ['checking', 'uploading', 'confirming'].includes(j.state),
    ).length;
    for (const job of jobRef.current
      .filter((j) => j.state === 'queued' && j.file)
      .slice(0, Math.max(0, 2 - active)))
      void start(job);
  }
  async function admit(rows: PlannedUpload[]) {
    const [scope, up] = await Promise.all([
      fetch('/api/semester?project=' + project, { cache: 'no-store' }).then(
        async (r) => {
          if (!r.ok) throw Error();
          return r.json();
        },
      ),
      transferState(),
    ]);
    if (
      !up.canUpload ||
      scope.project.version !== version ||
      (rows.some((r) => r.intended === 'public') && scope.role !== 'lead')
    )
      throw Error('AUTHORITY_CHANGED');
    const batch = crypto.randomUUID();
    for (const row of rows) {
      const job: Job = {
        id: crypto.randomUUID(),
        batch,
        path: row.path,
        file: row.skip ? undefined : row.file,
        intended: row.intended,
        fingerprint: '',
        correlation: crypto.randomUUID(),
        bytes: 0,
        size: row.file.size,
        state: row.skip ? 'skipped' : 'queued',
      };
      jobRef.current.push(job);
    }
    setJobs([...jobRef.current]);
    setQueueOpen(true);
    pump();
  }
  async function applyPolicies(batch?: string) {
    if (policyBusyRef.current || !mounted.current) return;
    policyBusyRef.current = true;
    try {
      for (const id of batch
        ? [batch]
        : [
            ...new Set(
              jobRef.current
                .map((j) => j.batch)
                .filter((v): v is string => !!v),
            ),
          ]) {
        const cohort = jobRef.current.filter((j) => j.batch === id);
        if (
          cohort.some((j) =>
            [
              'queued',
              'checking',
              'uploading',
              'confirming',
              'paused',
              'unknown',
            ].includes(j.state),
          )
        )
          continue;
        const publicJobs = cohort.filter(
          (j) =>
            j.state === 'ready' &&
            j.intended === 'public' &&
            j.policyState !== 'applied',
        );
        if (!publicJobs.length) continue;
        publicJobs.forEach((j) => {
          j.policyState = 'applying';
          update(j);
        });
        try {
          let payloads = policyPayloads.current.get(id) as
            | {
                operation: string;
                project: string;
                version: string;
                files: {
                  file: string;
                  revision: number;
                  visibility: string;
                  command: string;
                }[];
              }[]
            | undefined;
          if (!payloads) {
            const response = await fetch('/api/semester?project=' + project, {
              cache: 'no-store',
            });
            if (!response.ok) throw Error();
            const scope = await response.json();
            if (
              scope.project.version !== version ||
              scope.role !== 'lead' ||
              !scope.editable
            )
              throw Error();
            const commands = publicJobs.map((j) => {
              const f = scope.files.find(
                (x: SemesterFile) => x.id === j.fileId,
              );
              if (!f || !Number.isInteger(f.policyRevision)) throw Error();
              return {
                file: f.id,
                revision: f.policyRevision,
                visibility: 'public',
                command: crypto.randomUUID(),
              };
            });
            payloads = [];
            for (let i = 0; i < commands.length; i += 100)
              payloads.push({
                operation: 'visibility.batch',
                project,
                version,
                files: commands.slice(i, i + 100),
              });
            policyPayloads.current.set(id, payloads);
          }
          for (const payload of payloads) {
            const response = await fetch('/api/editions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Workspace-Actor': actor,
              },
              body: JSON.stringify(payload),
            });
            if (!response.ok) throw Error();
            const result = await response.json();
            if (result.project !== project || result.version !== version)
              throw Error();
            for (const item of result.files) {
              const job = cohort.find(
                (j) =>
                  j.fileId === item.file &&
                  payload.files.some(
                    (f) => f.file === item.file && f.command === item.command,
                  ),
              );
              if (!job || item.visibility !== 'public') throw Error();
              job.policyState = 'applied';
              job.applied = item.visibility;
              update(job);
            }
          }
        } catch {
          publicJobs.forEach((j) => {
            if (j.policyState !== 'applied') {
              j.policyState = 'attention';
              update(j);
            }
          });
        }
        await refresh();
      }
    } finally {
      policyBusyRef.current = false;
    }
  }
  async function pause(job: Job) {
    await job.upload?.abort(false);
    job.url = job.upload?.url ?? job.url;
    if (job.url)
      try {
        const response = await fetch(job.url, {
          method: 'HEAD',
          headers: { 'Tus-Resumable': '1.0.0' },
          credentials: 'include',
          cache: 'no-store',
        });
        if (response.ok)
          job.bytes = Number(response.headers.get('Upload-Offset'));
      } catch {}
    if (job.state === 'ready') return;
    job.state = 'paused';
    update(job);
    await refresh();
  }
  async function cancel(job: Job) {
    try {
      const state = await transferState(),
        actual = state.transfers.find(
          (x) => x.id === job.url?.split('/').at(-1),
        );
      if (actual?.status === 'completed') {
        await confirmedJob(job);
        return;
      }
      await job.upload?.abort(true);
      job.state = 'cancelled';
      job.file = undefined;
      update(job);
      await refresh();
      pump();
    } catch {
      job.state = 'unknown';
      update(job);
      pump();
    }
  }
  async function retryFailed(job: Job) {
    if (!job.file) {
      setPlannerOpen(true);
      return;
    }
    job.correlation = crypto.randomUUID();
    job.url = undefined;
    job.fingerprint = '';
    job.state = 'queued';
    job.error = undefined;
    update(job);
    pump();
  }
  function reselect(transfer: Transfer) {
    resumeTarget.current = transfer;
    resumeInput.current?.click();
  }
  async function selectedOriginal(list: FileList | null) {
    const transfer = resumeTarget.current,
      file = list?.[0];
    if (!transfer || !file) return;
    setResumeErrors((errors) => {
      const next = { ...errors };
      delete next[transfer.id];
      return next;
    });
    const job: Job = {
      id: crypto.randomUUID(),
      path: transfer.path,
      file,
      fingerprint: transfer.fingerprint,
      correlation: crypto.randomUUID(),
      bytes: transfer.offset,
      size: transfer.size,
      state: 'paused',
      intended: 'restricted',
      url: uploadUrl('/tus/' + transfer.id),
    };
    jobRef.current.push(job);
    setJobs([...jobRef.current]);
    await start(job, transfer);
    if (resumeInput.current) resumeInput.current.value = '';
  }
  useEffect(() => {
    const active = () =>
      jobRef.current.some((j) =>
        ['queued', 'checking', 'uploading', 'confirming'].includes(j.state),
      );
    const unload = (event: BeforeUnloadEvent) => {
      if (active()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const request = (
      destination: string,
      commit: () => void | Promise<void>,
    ) => {
      leaveCommit.current = commit;
      setLeaveError(false);
      setLeave(destination);
    };
    const click = (event: MouseEvent) => {
      if (
        !active() ||
        leaving.current ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href]',
      );
      if (!anchor) {
        const toggle = (event.target as Element).closest<HTMLButtonElement>(
          'button[aria-label]',
        );
        if (
          !['Switch to Arabic', 'التبديل إلى الإنجليزية'].includes(
            toggle?.getAttribute('aria-label') ?? '',
          )
        )
          return;
        event.preventDefault();
        const next = new URL(location.href);
        next.pathname = next.pathname.replace(
          /^\/(en|ar)(?=\/)/,
          location.pathname.startsWith('/en/') ? '/ar' : '/en',
        );
        request(next.href, () => location.assign(next.href));
        return;
      }
      const next = new URL(anchor.href, location.href);
      if (
        anchor.hasAttribute('download') ||
        anchor.target === '_blank' ||
        next.pathname.startsWith('/api/') ||
        next.pathname === location.pathname
      )
        return;
      event.preventDefault();
      request(anchor.href, () => location.assign(anchor.href));
    };
    const intent = (event: Event) => {
      if (!active() || leaving.current || event.defaultPrevented) return;
      const navigation = event as CustomEvent<{
        destination: string;
        commit: () => void | Promise<void>;
      }>;
      event.preventDefault();
      request(navigation.detail.destination, navigation.detail.commit);
    };
    const back = (event: Event) => {
      if (!active() || leaving.current || event.defaultPrevented) return;
      const navigation = event as CustomEvent<WorkspaceHistoryIntent>;
      event.preventDefault();
      request(navigation.detail.destination, navigation.detail.resume);
    };
    window.addEventListener('workspace-navigation-intent', intent);
    window.addEventListener(workspaceHistoryEvent, back);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('workspace-navigation-intent', intent);
      window.removeEventListener(workspaceHistoryEvent, back);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, []);
  async function finishLeave(mode: 'pause' | 'cancel') {
    const commit = leaveCommit.current;
    if (!commit || leaving.current) return;
    leaving.current = true;
    setLeaveBusy(true);
    setLeaveError(false);
    try {
      const settled = await completeTransferLeave(
        jobRef.current.filter((job) => transferNeedsSettlement(job.state)),
        mode,
        mode === 'pause' ? pause : cancel,
        commit,
      );
      if (!settled) {
        setLeaveError(true);
      } else {
        leaveCommit.current = null;
        setLeave(null);
      }
    } catch {
      setLeaveError(true);
    } finally {
      leaving.current = false;
      setLeaveBusy(false);
    }
  }
  const current = files.find((x) => x.id === selected);
  async function policy(value: string) {
    if (
      !current ||
      !lead ||
      submission ||
      (!editable &&
        !(
          archived &&
          value === 'restricted' &&
          current.visibility === 'public' &&
          archivedPolicies.some(
            (file) => file.id === current.id && file.canChange,
          )
        ))
    )
      return;
    setPolicyChoice(null);
    setPolicyBusy(true);
    setPolicyError(false);
    try {
      const r = await fetch('/api/editions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Actor': actor,
        },
        body: JSON.stringify({
          operation: 'visibility',
          project,
          version,
          file: current.id,
          revision: current.policyRevision,
          visibility: value,
          command: crypto.randomUUID(),
        }),
      });
      if (!r.ok) throw Error();
      await refresh();
    } catch {
      setPolicyError(true);
    } finally {
      setPolicyBusy(false);
    }
  }
  return (
    <section className="ss-files" data-template="files">
      <header className="ss-files-toolbar">
        {submission && (
          <p dir="auto" className="ss-frozen-label">
            {purpose === 'FINAL'
              ? copy(
                  'Retained final record · read-only',
                  'سجل نهائي محفوظ · للقراءة فقط',
                )
              : copy(
                  'Frozen checkpoint · read-only',
                  'نقطة مراجعة محفوظة · للقراءة فقط',
                )}
          </p>
        )}
        <div className="ui-action-row">
          {(submission || archived) && (
            <Button asChild variant="outline">
              <a href={nativeQuery('zip')} download>
                {copy('Download saved files ZIP', 'تنزيل الملفات المحفوظة ZIP')}
              </a>
            </Button>
          )}
          {editable && !submission && (
            <Button
              data-upload-entry
              type="button"
              disabled={unavailable || error}
              onClick={() => setPlannerOpen(true)}
            >
              {copy('Upload', 'رفع')}
            </Button>
          )}
          {editable && !submission && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setQueueOpen(true)}
            >
              {copy('Upload queue', 'قائمة الرفع')} ·{' '}
              {error || unavailable
                ? copy('Unknown', 'غير متاح')
                : jobs.filter(
                    (j) =>
                      !['ready', 'cancelled', 'skipped', 'failed'].includes(
                        j.state,
                      ),
                  ).length +
                  transfers.filter(
                    (x) =>
                      x.status === 'active' &&
                      !jobs.some((j) => j.url?.endsWith(x.id)),
                  ).length}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void refresh()}>
            {copy('Refresh files', 'تحديث الملفات')}
          </Button>
        </div>
        {storage && !error && (
          <p dir="auto" className="ss-muted">
            {copy('Project storage', 'تخزين المشروع')}:{' '}
            <span dir="ltr">
              {size(storage.used)} / {size(storage.limit)}
            </span>
            {' · '}
            {copy('Reserved', 'محجوز')}:{' '}
            <span dir="ltr">{size(storage.reserved)}</span>
          </p>
        )}
        <input
          ref={resumeInput}
          type="file"
          hidden
          onChange={(e) => void selectedOriginal(e.target.files)}
          aria-label={copy(
            'Reselect original file',
            'إعادة اختيار الملف الأصلي',
          )}
        />
      </header>
      {error && (
        <Notice
          locale={locale}
          error
          title={copy('Files could not be refreshed', 'تعذر تحديث الملفات')}
        >
          <p dir="auto">
            {copy(
              'Current counts and transfer status are unavailable. Retry the authorized read.',
              'لا تتوفر الأعداد الحالية وحالة النقل. أعد محاولة القراءة المصرح بها.',
            )}
          </p>
        </Notice>
      )}
      {!submission && editable && (
        <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
          <SheetContent
            className="wsv2 ss-explorer-sheet ss-transfer-sheet"
            side="right"
            closeLabel={copy('Close upload queue', 'إغلاق قائمة الرفع')}
          >
            <SheetHeader>
              <SheetTitle>{copy('Upload outcomes', 'نتائج الرفع')}</SheetTitle>
              <SheetDescription>
                {copy(
                  'Progress uses the server offset. After refresh, reselect the same original to resume.',
                  'يعتمد التقدم على موضع الخادم. بعد التحديث، أعد اختيار الأصل نفسه للاستئناف.',
                )}
              </SheetDescription>
            </SheetHeader>
            {jobs.length > 0 && (
              <p dir="auto" className="ss-transfer-summary" role="status">
                {jobs.filter((j) => j.state === 'ready').length}{' '}
                {copy('ready', 'مقبول')} ·{' '}
                {jobs.filter((j) => j.state === 'skipped').length}{' '}
                {copy('skipped', 'تم تجاوزه')} ·{' '}
                {jobs.filter((j) => j.state === 'failed').length}{' '}
                {copy('failed', 'فشل')} ·{' '}
                {jobs.filter((j) => j.applied === 'public').length}{' '}
                {copy('Public policies confirmed', 'سياسات عام مؤكدة')}.{' '}
                {copy(
                  'Transfers and visibility application are separate results.',
                  'النقل وتطبيق الإتاحة نتيجتان منفصلتان.',
                )}
              </p>
            )}
            {!jobs.length && !transfers.some((x) => x.status === 'active') && (
              <p dir="auto" className="ss-muted">
                {copy('No active transfers.', 'لا توجد عمليات نقل نشطة.')}
              </p>
            )}{' '}
            {jobs.length > 0 && (
              <div className="ss-upload-queue" aria-live="polite">
                {jobs.map((j) => (
                  <article key={j.id}>
                    <div>
                      <strong>
                        <BidiValue kind="path">
                          <bdi dir="auto">{j.path}</bdi>
                        </BidiValue>
                      </strong>
                      <Badge className="ss-small-badge" variant="outline">
                        {
                          (
                            {
                              queued: copy('Queued', 'في الانتظار'),
                              checking: copy(
                                'Checking original file',
                                'التحقق من الملف الأصلي',
                              ),
                              uploading: copy('Uploading', 'جارٍ الرفع'),
                              confirming: copy(
                                'Confirming server validation',
                                'التحقق من قبول الخادم',
                              ),
                              paused: copy('Paused', 'متوقف مؤقتًا'),
                              ready: copy('Ready', 'جاهز'),
                              failed: copy('Failed', 'فشل'),
                              unknown: copy(
                                'Outcome needs checking',
                                'يلزم التحقق من النتيجة',
                              ),
                              skipped: copy('Skipped', 'تم تجاوزه'),
                              cancelled: copy('Cancelled', 'أُلغي'),
                            } as Record<string, string>
                          )[j.state]
                        }
                      </Badge>
                    </div>
                    <Progress
                      value={
                        j.size
                          ? (100 * j.bytes) / j.size
                          : j.state === 'ready'
                            ? 100
                            : 0
                      }
                      aria-label={copy(
                        'Server-confirmed uploaded bytes',
                        'البايتات المؤكدة على الخادم',
                      )}
                    />
                    <p dir="ltr">
                      {size(j.bytes)} / {size(j.size)}
                    </p>
                    {j.error && (
                      <p dir="auto" className="ss-validation">
                        {j.error}
                      </p>
                    )}
                    <div className="ss-upload-actions">
                      {j.state === 'ready' && (
                        <>
                          <p dir="auto">
                            {j.intended === 'public'
                              ? j.policyState === 'applied'
                                ? copy(
                                    'Uploaded: Public policy applied; project stays private.',
                                    'رُفع الملف: طُبقت سياسة العام؛ تبقى النسخة خاصة.',
                                  )
                                : j.policyState === 'applying'
                                  ? copy('Applying visibility', 'تطبيق الإتاحة')
                                  : copy(
                                      'Uploaded: Restricted on admission; requested visibility needs checking.',
                                      'رُفع الملف: قُبل مقيّدًا؛ يلزم التحقق من الإتاحة المطلوبة.',
                                    )
                              : copy(
                                  'Uploaded: Restricted',
                                  'رُفع الملف: مقيّد',
                                )}
                          </p>
                          {j.policyState === 'attention' && (
                            <Button
                              variant="outline"
                              onClick={() => void applyPolicies(j.batch)}
                            >
                              {copy(
                                'Retry original visibility request',
                                'إعادة طلب الإتاحة الأصلي',
                              )}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (j.fileId) {
                                setSelected(j.fileId);
                                setReveal({
                                  file: j.fileId,
                                  nonce: crypto.randomUUID(),
                                });
                                setQueueOpen(false);
                              }
                            }}
                          >
                            {copy('View in folder', 'عرض في المجلد')}
                          </Button>
                        </>
                      )}

                      {editable && j.state === 'uploading' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void pause(j)}
                          aria-label={copy(
                            'Pause ' + j.path,
                            'إيقاف ' + j.path,
                          )}
                        >
                          {copy('Pause', 'إيقاف مؤقت')}
                        </Button>
                      )}
                      {editable && j.state === 'paused' && j.file && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void start(j)}
                        >
                          {copy('Resume', 'استئناف')}
                        </Button>
                      )}
                      {editable &&
                        ['uploading', 'paused', 'queued', 'checking'].includes(
                          j.state,
                        ) && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void cancel(j)}
                          >
                            {copy('Cancel upload', 'إلغاء الرفع')}
                          </Button>
                        )}
                      {j.state === 'failed' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void retryFailed(j)}
                        >
                          {copy('Retry failed file', 'إعادة محاولة الملف')}
                        </Button>
                      )}
                      {j.state === 'unknown' && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void confirmedJob(j)}
                        >
                          {copy(
                            'Check transfer status',
                            'التحقق من حالة النقل',
                          )}
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!submission &&
              editable &&
              transfers
                .filter(
                  (x) =>
                    x.status === 'active' &&
                    !jobs.some(
                      (j) =>
                        j.url?.endsWith(x.id) &&
                        [
                          'uploading',
                          'checking',
                          'paused',
                          'confirming',
                        ].includes(j.state),
                    ),
                )
                .map((x) => (
                  <Notice
                    key={x.id}
                    locale={locale}
                    title={copy('Unfinished upload', 'رفع غير مكتمل')}
                  >
                    <p dir="auto">
                      <BidiValue kind="path">
                        <bdi dir="auto">{x.path}</bdi> ·{' '}
                        <span dir="ltr">
                          {size(x.offset)} / {size(x.size)}
                        </span>
                      </BidiValue>
                    </p>
                    <p dir="auto">
                      {copy(
                        'Reselect the same original file to verify its content and resume from the server offset.',
                        'أعد اختيار الملف الأصلي نفسه للتحقق من محتواه والاستئناف من موضع الخادم.',
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      aria-describedby={
                        resumeErrors[x.id] ? 'resume-error-' + x.id : undefined
                      }
                      onClick={() => reselect(x)}
                    >
                      {copy('Reselect and resume', 'إعادة الاختيار والاستئناف')}
                    </Button>
                    {resumeErrors[x.id] && (
                      <p dir="auto" id={'resume-error-' + x.id} role="alert">
                        {resumeErrors[x.id]}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            uploadUrl('/tus/' + x.id),
                            {
                              method: 'DELETE',
                              headers: { 'Tus-Resumable': '1.0.0' },
                              credentials: 'include',
                            },
                          );
                          if (!response.ok) throw Error();
                          await refresh();
                        } catch {
                          setError(true);
                        }
                      }}
                    >
                      {copy(
                        'Cancel unfinished upload',
                        'إلغاء الرفع غير المكتمل',
                      )}
                    </Button>
                  </Notice>
                ))}
          </SheetContent>
        </Sheet>
      )}
      {!submission && editable && (
        <UploadPlanner
          open={plannerOpen}
          onOpenChange={setPlannerOpen}
          locale={locale}
          folder={browseFolder}
          files={files}
          lead={lead}
          versionNumber={versionNumber}
          projectTitle={projectTitle}
          available={error ? undefined : storage?.available}
          onStart={admit}
        />
      )}
      <AcademicExplorer
        key={
          actor +
          ':' +
          project +
          ':' +
          version +
          ':' +
          (submission ?? 'working')
        }
        locale={locale}
        actor={actor}
        project={project}
        version={version}
        submission={submission}
        files={files}
        selected={selected}
        onSelect={setSelected}
        queryUrl={nativeQuery}
        readerOnly={readerOnly}
        unavailable={unavailable}
        onDenied={deny}
        onFolderChange={setBrowseFolder}
        reveal={reveal}
        details={(preview) => (
          <>
            {' '}
            <section
              className="ss-file-details"
              aria-label={copy('Selected file details', 'تفاصيل الملف المختار')}
            >
              <h2 dir="auto">{copy('File details', 'تفاصيل الملف')}</h2>
              {current && (
                <>
                  <BidiFacts>
                    <BidiLabel dir="auto">{copy('Path', 'المسار')}</BidiLabel>
                    <BidiData dir="auto">
                      <code dir="ltr">
                        <BidiValue kind="path">{current.path}</BidiValue>
                      </code>
                    </BidiData>
                    <BidiLabel dir="auto">
                      {copy('Size / type', 'الحجم / النوع')}
                    </BidiLabel>
                    <BidiData dir="ltr">
                      {size(current.size)} · {current.mime}
                    </BidiData>
                    <BidiLabel dir="auto">
                      {submission
                        ? purpose === 'FINAL'
                          ? copy(
                              'Saved final access',
                              'وصول السجل النهائي المحفوظ',
                            )
                          : copy(
                              'Saved checkpoint access',
                              'وصول نقطة المراجعة المحفوظة',
                            )
                        : copy('Draft access', 'وصول المسودة')}
                    </BidiLabel>
                    <BidiData dir="auto">
                      {current.visibility === 'restricted'
                        ? copy('Restricted', 'مقيّد')
                        : copy('Public after publication', 'عام بعد النشر')}
                    </BidiData>
                    {preview?.meta.uploader && (
                      <>
                        <BidiLabel dir="auto">
                          {copy('Uploaded by', 'رفعه')}
                        </BidiLabel>
                        <BidiData dir="auto">
                          <bdi dir="auto">{preview.meta.uploader}</bdi>
                        </BidiData>
                      </>
                    )}
                    {preview?.meta.uploadedAt && (
                      <>
                        <BidiLabel dir="auto">
                          {copy('Uploaded', 'وقت الرفع')}
                        </BidiLabel>
                        <BidiData dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                          {date(locale, preview.meta.uploadedAt)}
                        </BidiData>
                      </>
                    )}
                  </BidiFacts>
                  {lead && editable && !submission && (
                    <Field>
                      <FieldLabel htmlFor="ss-file-policy">
                        {copy(
                          'Visibility after approved publication',
                          'الإتاحة بعد الموافقة والنشر',
                        )}
                      </FieldLabel>
                      <Select
                        value={current.visibility}
                        disabled={
                          policyBusy ||
                          !Number.isInteger(current.policyRevision)
                        }
                        onValueChange={(v) => {
                          window.dispatchEvent(
                            new Event('semester-policy-confirm'),
                          );
                          setPolicyChoice(v);
                        }}
                      >
                        <SelectTrigger id="ss-file-policy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="wsv2">
                          <SelectItem value="restricted">
                            {copy('Restricted', 'مقيّد')}
                          </SelectItem>
                          <SelectItem value="public">
                            {copy('Public after publication', 'عام بعد النشر')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p dir="auto" className="ss-muted">
                        {copy(
                          'Current project work stays private.',
                          'يبقى العمل الحالي للمشروع خاصًا.',
                        )}
                      </p>
                    </Field>
                  )}
                  {lead &&
                    archived &&
                    !submission &&
                    current.visibility === 'public' &&
                    archivedPolicies.some(
                      (file) => file.id === current.id && file.canChange,
                    ) && (
                      <div className="ss-fields">
                        <p dir="auto">
                          {copy(
                            'Archived originals stay unchanged. You can stop future public reads of this file; widening access is unavailable.',
                            'تبقى الأصول المؤرشفة دون تغيير. يمكنك إيقاف القراءات العامة المستقبلية لهذا الملف؛ ولا تتوفر توسعة الوصول.',
                          )}
                        </p>
                        <Button
                          variant="outline"
                          disabled={policyBusy || error}
                          onClick={() => {
                            window.dispatchEvent(
                              new Event('semester-policy-confirm'),
                            );
                            setPolicyChoice('restricted');
                          }}
                        >
                          {copy('Restrict public access', 'تقييد الوصول العام')}
                        </Button>
                      </div>
                    )}
                  {policyError && (
                    <Notice
                      locale={locale}
                      error
                      title={copy(
                        'Policy result needs checking',
                        'يلزم التحقق من نتيجة السياسة',
                      )}
                    >
                      <p dir="auto">
                        {copy(
                          'Refresh the file list before changing its policy again.',
                          'حدّث قائمة الملفات قبل تغيير السياسة مجددًا.',
                        )}
                      </p>
                    </Notice>
                  )}
                </>
              )}
            </section>
          </>
        )}
      />
      <Dialog
        open={policyChoice !== null}
        onOpenChange={(open) => {
          if (!open) setPolicyChoice(null);
        }}
      >
        <DialogContent
          className="wsv2 ss-dialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {archived
                ? copy(
                    'Restrict public access to this archived file?',
                    'تقييد الوصول العام إلى هذا الملف المؤرشف؟',
                  )
                : copy(
                    'Change draft access policy?',
                    'تغيير سياسة وصول المسودة؟',
                  )}
            </DialogTitle>
            <DialogDescription>
              <BidiValue kind="path">{current?.path}</BidiValue> ·{' '}
              {policyChoice === 'public'
                ? copy('Public after publication', 'عام بعد النشر')
                : copy('Restricted', 'مقيّد')}
              .{' '}
              {copy(
                archived
                  ? 'This stops future anonymous previews, originals, ranges and ZIP inclusion. Saved submission metadata and original bytes stay unchanged; existing project-specific grants remain governed separately.'
                  : 'Current work stays private. File access will be checked before changing it.',
                archived
                  ? 'يوقف هذا المعاينات والأصول والنطاقات المستقبلية دون تسجيل دخول وإدراج الملف في ZIP العام. تبقى بيانات الإرسال المحفوظة والمحتويات الأصلية دون تغيير؛ وتظل أذونات المشاريع خاضعة لضوابطها بصورة منفصلة.'
                  : 'يبقى العمل الحالي خاصًا. تُراجع إتاحة الملف قبل تغييرها.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyChoice(null)}>
              {copy('Keep policy', 'إبقاء السياسة')}
            </Button>
            <Button onClick={() => void policy(policyChoice!)}>
              {copy('Confirm policy change', 'تأكيد تغيير السياسة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={leave !== null}
        onOpenChange={(v) => {
          if (!v && !leaving.current) {
            leaveCommit.current = null;
            setLeave(null);
          }
        }}
      >
        <DialogContent
          className="wsv2 ss-dialog"
          closeLabel={copy('Close', 'إغلاق')}
        >
          <DialogHeader>
            <DialogTitle>
              {copy('Uploads are in progress', 'الرفع جارٍ')}
            </DialogTitle>
            <DialogDescription>
              {copy(
                'Keep transferring here, or pause/cancel before leaving. Tab close cannot keep browser File objects alive; refresh requires original reselection.',
                'تابع النقل هنا، أو أوقفه مؤقتًا/ألغِه قبل المغادرة. لا يحتفظ إغلاق التبويب بملفات المتصفح؛ يتطلب التحديث إعادة اختيار الأصل.',
              )}
            </DialogDescription>
          </DialogHeader>
          {leaveError && (
            <p dir="auto" role="alert">
              {copy(
                'The transfers could not be confirmed paused or cancelled. Stay here and check the upload queue before trying again.',
                'تعذر تأكيد إيقاف عمليات النقل أو إلغائها. ابقَ هنا وتحقق من قائمة الرفع قبل المحاولة مجددًا.',
              )}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={leaveBusy}
              onClick={() => {
                leaveCommit.current = null;
                setLeave(null);
              }}
            >
              {copy('Keep transferring here', 'متابعة النقل هنا')}
            </Button>
            <Button
              disabled={leaveBusy}
              variant="outline"
              onClick={() => void finishLeave('pause')}
            >
              {copy('Pause and leave', 'إيقاف مؤقت ومغادرة')}
            </Button>
            <Button
              disabled={leaveBusy}
              onClick={() => void finishLeave('cancel')}
            >
              {copy('Cancel and leave', 'إلغاء ومغادرة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
