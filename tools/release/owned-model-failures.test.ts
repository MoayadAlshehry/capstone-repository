import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  beforeAll,
  afterAll,
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import type { AddressInfo } from 'node:net';

const previous = { ...process.env };
const realFetch = globalThis.fetch;
let runtime: typeof import('../../apps/web/ai/runtime');
let directory: string;
let base: string;
let calls: Array<{ path: string; body: Record<string, unknown> }> = [];
let rejectedTargets: string[] = [];
let reply: (response: ServerResponse) => void;
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  calls.push({
    path: request.url!,
    body: JSON.parse(Buffer.concat(chunks).toString()),
  });
  reply(response);
});
function json(response: ServerResponse, value: unknown) {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}
function events(response: ServerResponse, values: unknown[]) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.end(
    values.map((value) => 'data: ' + JSON.stringify(value) + '\n\n').join(''),
  );
}
const signal = () => new AbortController().signal;
const native = (s = signal(), onText?: (text: string) => Promise<void>) =>
  runtime.generate(
    'Use the supplied synthetic public extract.',
    'Describe the recorded method.',
    s,
    { maxTokens: 64, reasoning: 'off', ...(onText ? { onText } : {}) },
  );

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'capstone-owned-model-failures-'));
  await writeFile(join(directory, 'token'), 'synthetic-local-test-token', {
    mode: 0o600,
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  expect(address.address).toBe('127.0.0.1');
  base = 'http://127.0.0.1:' + address.port;
  Object.assign(process.env, {
    CAPSTONE_AI_BASE_URL: base,
    CAPSTONE_AI_TOKEN_FILE: join(directory, 'token'),
    CAPSTONE_AI_DATA_DIR: directory,
    WORKSPACE_ROOT: process.cwd(),
  });
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin !== base ||
      !['/api/v1/chat', '/v1/embeddings', '/v1/chat/completions'].includes(
        url.pathname,
      )
    ) {
      rejectedTargets.push(url.origin);
      throw Error('NON_OWNED_TEST_TARGET_REFUSED');
    }
    return realFetch(input, init);
  });
  runtime = await import('../../apps/web/ai/runtime');
});
beforeEach(() => {
  calls = [];
  rejectedTargets = [];
});
afterEach(() => {
  expect(rejectedTargets).toEqual([]);
  expect(calls).toHaveLength(1);
  expect(server.listening).toBe(true);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.unstubAllGlobals();
  for (const key of Object.keys(process.env))
    if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
  await rm(directory, { recursive: true });
});

it('reports an owned model HTTP 503 without generating a replacement answer', async () => {
  reply = (response) => {
    response.writeHead(503);
    response.end('synthetic model unavailable');
  };
  await expect(native()).rejects.toThrow('OFFLINE');
});
it('reports an owned model connection reset', async () => {
  reply = (response) => response.destroy();
  await expect(native()).rejects.toThrow('OFFLINE');
});
it('rejects wrong embedding dimensions from the model transport', async () => {
  reply = (response) =>
    json(response, { data: [{ index: 0, embedding: Array(512).fill(1) }] });
  await expect(
    runtime.embed(['Synthetic public extract'], signal()),
  ).rejects.toThrow('INVALID_VECTOR');
});
it('rejects an embedding response with a missing input result', async () => {
  reply = (response) => json(response, { data: [] });
  await expect(
    runtime.embed(['Synthetic public extract'], signal()),
  ).rejects.toThrow('INVALID_VECTOR');
});
it('rejects zero vectors received from the model transport', async () => {
  reply = (response) =>
    json(response, { data: [{ index: 0, embedding: Array(1024).fill(0) }] });
  await expect(
    runtime.embed(['Synthetic public extract'], signal()),
  ).rejects.toThrow('INVALID_VECTOR');
});
it('rejects an explicit native model error event', async () => {
  reply = (response) => events(response, [{ type: 'error' }]);
  await expect(native()).rejects.toThrow('INVALID_OUTPUT');
});
it('rejects a native stream that ends before chat.end', async () => {
  reply = (response) =>
    events(response, [
      { type: 'message.delta', content: 'Incomplete synthetic answer' },
    ]);
  await expect(native()).rejects.toThrow('INVALID_OUTPUT');
});
it('rejects a native completion without completion statistics', async () => {
  reply = (response) =>
    events(response, [
      { type: 'message.delta', content: 'Synthetic answer' },
      { type: 'chat.end' },
    ]);
  await expect(native()).rejects.toThrow('INVALID_OUTPUT');
});
it('does not expose native reasoning text through the answer callback', async () => {
  reply = (response) =>
    events(response, [
      {
        type: 'reasoning.delta',
        content: 'SYNTHETIC_REASONING_MUST_NOT_APPEAR',
      },
      {
        type: 'message.delta',
        content: 'The public extract describes a bounded method.',
      },
      {
        type: 'chat.end',
        stats: {
          input_tokens: 20,
          total_output_tokens: 12,
          reasoning_output_tokens: 2,
        },
      },
    ]);
  const emitted: string[] = [];
  const answer = await native(signal(), async (text) => {
    emitted.push(text);
  });
  expect(answer.content).toBe('The public extract describes a bounded method.');
  expect(emitted.join('')).toBe(answer.content);
  expect(JSON.stringify(answer)).not.toContain(
    'SYNTHETIC_REASONING_MUST_NOT_APPEAR',
  );
  expect(calls[0]!.body.model).toBe('qwen/qwen3.5-9b');
  expect(calls[0]!.body.reasoning).toBe('off');
});
it('rejects reasoning content from the structured non-reasoning API', async () => {
  reply = (response) =>
    events(response, [
      {
        choices: [
          { delta: { reasoning_content: 'Synthetic disallowed reasoning' } },
        ],
      },
    ]);
  await expect(
    runtime.generate('Synthetic system', 'Synthetic input', signal(), {
      maxTokens: 64,
    }),
  ).rejects.toThrow('REASONING_NOT_DISABLED');
});
it('cancels an owned stalled stream without changing application time limits', async () => {
  const controller = new AbortController();
  let received!: () => void;
  const entered = new Promise<void>((resolve) => {
    received = resolve;
  });
  reply = (response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.flushHeaders();
    received();
  };
  const pending = native(controller.signal);
  const rejected = expect(pending).rejects.toThrow();
  await entered;
  controller.abort();
  await rejected;
});
