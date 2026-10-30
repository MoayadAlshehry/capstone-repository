import 'server-only';
import { z } from 'zod';
import type { AccountView } from '@capstone/db/auth';
import type { PublicScope } from './sources';
import {
  recheck,
  readScopedFile,
  metadataSource,
  supportedFile,
} from './sources';
import { AIError, type AISource, type AIIndex, type Emit } from './types';
import { inspectJSON, jsonPointer } from './typed-file';
import { digest } from './core';
import { nativeReader } from '../native-files/server';
const schemas = {
  get_project_context: z.object({}).strict(),
  list_project_files: z
    .object({
      cursor: z
        .string()
        .regex(/^\d{1,3}$/)
        .optional(),
    })
    .strict(),
  read_project_file: z
    .object({
      file_id: z.uuid(),
      start_line: z.number().int().min(1).max(100000).optional(),
      max_lines: z.number().int().min(1).max(200).optional(),
      json_pointer: z.string().max(512).optional(),
    })
    .strict(),
  search_project_evidence: z
    .object({
      query: z.string().min(1).max(1000),
      file_id: z.uuid().optional(),
      limit: z.number().int().min(1).max(8).optional(),
    })
    .strict(),
};
export type ReadToolName = keyof typeof schemas;
export type ToolDependencies = {
  index: () => Promise<AIIndex>;
  search: (
    query: string,
    limit: number,
    fileId?: string,
  ) => Promise<{ sources: AISource[] }>;
};
export function createProjectTools(
  s: PublicScope,
  account: AccountView | null,
  signal: AbortSignal,
  emit: Emit,
  deps: ToolDependencies,
) {
  const registry: AISource[] = [metadataSource(s.project)],
    cache = new Map<string, unknown>();
  let calls = 0;
  const trace: {
    name: string;
    cached: boolean;
    ms: number;
    complete: boolean;
  }[] = [];
  const register = (source: AISource) => {
    const same = registry.find(
      (old) =>
        old.file === source.file &&
        old.hash === source.hash &&
        old.text === source.text &&
        old.page === source.page &&
        old.lineStart === source.lineStart,
    );
    if (same) return same.id;
    if (registry.length >= 96) throw new AIError('TOOL_LIMIT', 422);
    const value = { ...source, id: 'S' + (registry.length + 1) };
    registry.push(value);
    return value.id;
  };
  const definitions = Object.entries(schemas).map(([name, schema]) => ({
    type: 'function',
    function: {
      name,
      description: (
        {
          get_project_context:
            'Read the server-bound current public project context.',
          list_project_files:
            'Read the current authorized public manifest; IDs and project-relative names only.',
          read_project_file:
            'Read one authorized file by manifest ID, optionally lines or JSON Pointer. No execution.',
          search_project_evidence:
            'Search public evidence in this same current project/edition.',
        } as Record<string, string>
      )[name],
      parameters: z.toJSONSchema(schema),
    },
  }));
  const call = async (name: string, args: unknown): Promise<unknown> => {
    if (!Object.hasOwn(schemas, name)) throw new AIError('UNKNOWN_TOOL', 400);
    const parsed = schemas[name as ReadToolName].safeParse(args);
    if (!parsed.success) throw new AIError('INVALID_TOOL_INPUT', 400);
    const input = parsed.data,
      key = digest([name, input]);
    await recheck(s, account);
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    if (cache.has(key)) {
      trace.push({ name, cached: true, ms: 0, complete: true });
      return cache.get(key);
    }
    const start = performance.now();
    let value: unknown,
      complete = true;
    const file =
      'file_id' in input
        ? s.files.find((file) => file.id === input.file_id)
        : undefined;
    if ('file_id' in input && !file) throw new AIError('NOT_FOUND', 404);
    if (calls >= 6) throw new AIError('TOOL_LIMIT', 422);
    calls++;
    const label =
      name === 'read_project_file'
        ? 'Reading ' + file!.path
        : name === 'search_project_evidence'
          ? 'Searching project evidence'
          : name === 'list_project_files'
            ? 'Checking public files'
            : 'Checking project context';
    await emit({ type: 'tool', name, phase: 'start', label });
    if (name === 'get_project_context')
      value = {
        project: s.project,
        edition: s.project.version,
        publicFiles: s.files.length,
        sourceIds: ['S1'],
      };
    else if (name === 'list_project_files') {
      const offset = 'cursor' in input ? Number(input.cursor) : 0;
      if (offset > s.files.length) throw new AIError('INVALID_TOOL_INPUT', 400);
      value = {
        files: s.files.slice(offset, offset + 50).map((file) => ({
          id: file.id,
          name: file.path,
          mime: file.mime,
          size: file.size,
          formatSupported: supportedFile(file),
          extractionStatus: 'not-inspected',
        })),
        next: offset + 50 < s.files.length ? String(offset + 50) : null,
        complete: offset + 50 >= s.files.length,
      };
    } else if (name === 'search_project_evidence') {
      if (!('query' in input)) throw new AIError('INVALID_TOOL_INPUT', 400);
      const result = await deps.search(input.query, input.limit ?? 6, file?.id),
        rows = result.sources
          .filter((source) => !file || source.file === file.id)
          .slice(0, input.limit ?? 6);
      value = {
        matches: rows.map((source) => ({ ...source, id: register(source) })),
        complete: false,
        coverage: 'Retrieved passages, not a whole-file claim',
      };
      complete = false;
    } else {
      if (!file || !('file_id' in input)) throw new AIError('NOT_FOUND', 404);
      if (file.extension === 'pdf') {
        const index = await deps.index(),
          sources = index.sources
            .filter((source) => source.file === file.id)
            .slice(0, 8);
        value = {
          format: 'pdf-text',
          complete: false,
          truncated: true,
          passages: sources.map((source) => ({
            ...source,
            id: register(source),
          })),
        };
        complete = false;
      } else {
        if (!supportedFile(file)) throw new AIError('UNSUPPORTED_FORMAT', 422);
        const { raw } = await readScopedFile(s, file.id, account, signal),
          text = new TextDecoder('utf-8', { fatal: true })
            .decode(raw)
            .replace(/\r\n?/g, '\n');
        if (text.includes('\0')) throw new AIError('UNSUPPORTED_ENCODING', 422);
        const base = {
          project: s.project.project,
          version: s.project.version,
          file: file.id,
          name: file.path,
          hash: file.sha256,
          page: null,
        };
        const ids: string[] = [];
        if (file.extension === 'json') {
          const parsed = inspectJSON(text),
            pointer = 'json_pointer' in input ? (input.json_pointer ?? '') : '',
            node = jsonPointer(parsed.nodes, pointer),
            take = text.slice(node.start, node.end);
          if (take.length > 14500) {
            value = {
              format: 'json',
              keys:
                node.value && typeof node.value === 'object'
                  ? Object.keys(node.value)
                  : [],
              complete: false,
              truncated: true,
              cursor: pointer,
            };
            complete = false;
          } else {
            const add = (n: typeof node) => {
              const before = text.slice(0, n.start),
                body = text.slice(n.start, n.end);
              return register({
                ...base,
                id: '',
                text: body,
                jsonPointer: n.pointer,
                lineStart: before.split('\n').length,
                lineEnd:
                  before.split('\n').length + body.split('\n').length - 1,
              });
            };
            ids.push(add(node));
            for (const child of parsed.nodes
              .filter(
                (n) =>
                  n.pointer.startsWith(pointer + '/') &&
                  n.value !== null &&
                  typeof n.value === 'object' &&
                  !Array.isArray(n.value) &&
                  text.slice(n.start, n.end).length < 2500,
              )
              .slice(-12))
              ids.push(add(child));
            value = {
              format: 'json',
              data: node.value,
              pointer,
              sourceIds: ids,
              complete: true,
              truncated: false,
            };
          }
        } else {
          const lines = text.split('\n'),
            startLine = 'start_line' in input ? (input.start_line ?? 1) : 1,
            maxLines = 'max_lines' in input ? (input.max_lines ?? 200) : 200,
            selected = lines
              .slice(startLine - 1, startLine - 1 + maxLines)
              .join('\n');
          if (startLine > lines.length)
            throw new AIError('INVALID_TOOL_INPUT', 400);
          const body = selected.slice(0, 14500);
          complete =
            startLine === 1 && maxLines >= lines.length && body === selected;
          ids.push(
            register({
              ...base,
              id: '',
              text: body,
              lineStart: startLine,
              lineEnd: startLine + body.split('\n').length - 1,
            }),
          );
          if (file.extension === 'csv') {
            const preview = await (
              await nativeReader()
            ).preview(
              { kind: 'public' },
              s.project.project,
              s.project.version,
              file.id,
            );
            value = {
              format: 'csv',
              rows: preview.rows,
              sourceIds: ids,
              complete: complete && !preview.truncated,
              truncated: !complete || preview.truncated,
            };
          } else
            value = {
              format: 'text',
              text: body,
              sourceIds: ids,
              complete,
              truncated: !complete,
              nextLine: complete ? null : startLine + body.split('\n').length,
            };
        }
      }
    }
    await recheck(s, account);
    if (signal.aborted) throw new AIError('CANCELLED', 499);
    cache.set(key, value);
    trace.push({
      name,
      cached: false,
      ms: performance.now() - start,
      complete,
    });
    await emit({ type: 'tool', name, phase: 'complete', label, cached: false });
    return value;
  };
  return {
    definitions,
    call,
    registry,
    trace,
    get calls() {
      return calls;
    },
    register,
  };
}
