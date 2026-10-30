export type AIEffort = 'quick' | 'balanced' | 'deep';
export type BriefSize = 'compact' | 'standard' | 'hero';
export type AILocale = 'en' | 'ar';
export type AIProjectRef = { id: string; title: string; version?: string };
export type AIPanelKind = 'summary' | 'ask' | 'discover';
export type AIState =
  | 'queued'
  | 'retrieving'
  | 'generating'
  | 'reasoning'
  | 'verifying'
  | 'completed'
  | 'insufficient'
  | 'cancelled'
  | 'timed-out'
  | 'offline'
  | 'busy'
  | 'indexing'
  | 'invalid-output';
export type AISource = {
  id: string;
  project: string;
  version: string;
  file: string | null;
  name: string;
  hash: string;
  text: string;
  page: number | null;
  lineStart: number | null;
  lineEnd: number | null;
  section?: string | undefined;
  jsonPointer?: string | undefined;
};
export type AICitation = Omit<AISource, 'text'> & {
  href: string;
  quote: string;
  label: string;
};
export type AICoverage = {
  supported: number;
  indexed: number;
  chunks: number;
  skipped: { name: string; reason: string }[];
  limits: string[];
};
export type AISnapshot = {
  summary: string;
  source: 'public-metadata';
  locale: AILocale;
  createdAt: string;
};
export type AIProject = {
  project: string;
  version: string;
  title: string;
  abstract: string;
  keywords: string[];
  university: { nameEn: string; nameAr: string };
  department: { code: string; nameEn: string; nameAr: string };
  academicYear: string;
  domain: string;
  publishedAt: string;
};
export type AIIndex = {
  fingerprint: string;
  sources: AISource[];
  coverage: AICoverage;
};
export type AIEvent =
  | {
      type: 'tool';
      name: string;
      phase: 'start' | 'complete';
      label: string;
      cached?: boolean;
    }
  | { type: 'brief'; text: string }
  | { type: 'block'; block: RichBlock; sources: AICitation[] }
  | { type: 'status'; state: AIState; position?: number }
  | {
      type: 'activity';
      stage:
        | 'retrieving'
        | 'prompt-processing'
        | 'reasoning'
        | 'composing'
        | 'verifying';
      at: string;
    }
  | { type: 'retrieval'; sources: AICitation[] }
  | { type: 'coverage'; coverage: AICoverage }
  | { type: 'answer'; text: string; sources: AICitation[]; locale?: AILocale }
  | { type: 'result'; value: unknown }
  | { type: 'metrics'; value: Record<string, string | number | boolean | null> }
  | { type: 'notice'; text: string }
  | { type: 'error'; code: string; state: AIState; requestId?: string }
  | { type: 'done' };
export class AIError extends Error {
  constructor(
    readonly code: string,
    readonly status = 503,
    readonly diagnostic?: Record<string, string | number | boolean | null>,
  ) {
    super(code);
  }
}
export type Emit = (event: AIEvent) => Promise<void>;
export type RichBlock =
  | {
      type: 'specSheet';
      locale?: AILocale;
      title: string;
      rows: { label: string; value: string; sourceIds: string[] }[];
    }
  | {
      type: 'evidenceTable' | 'fileTable';
      locale?: AILocale;
      title: string;
      columns: string[];
      rows: { cells: (string | null)[]; sourceIds: string[] }[];
    };
