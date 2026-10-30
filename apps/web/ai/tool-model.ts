import 'server-only';
import { endpoint, inferenceLease, owner } from './runtime';
import { GENERATION_MODEL, contextCost } from './core';
import { AIError } from './types';
import { randomUUID } from 'node:crypto';
export type LocalToolCall = {
  id: string;
  function: { name: string; arguments: string };
};
/** Compatibility endpoint supports string auto/required, not object tool_choice. */
export async function requestReadTools(
  messages: Record<string, unknown>[],
  definitions: unknown[],
  signal: AbortSignal,
) {
  if (
    contextCost(JSON.stringify({ messages, tools: definitions })) + 700 >
    16000
  )
    throw new AIError('PROMPT_LIMIT', 400);
  return owner.queue.run(
    'project-tools:' + randomUUID(),
    (sig) =>
      inferenceLease(sig, async () => {
        const response = await endpoint(
          '/v1/chat/completions',
          {
            model: GENERATION_MODEL,
            temperature: 0,
            reasoning_effort: 'none',
            max_tokens: 500,
            messages,
            tools: definitions,
            tool_choice: 'auto',
            parallel_tool_calls: false,
            stream: false,
          },
          sig,
        );
        const value = (await response.json()) as {
          choices?: {
            finish_reason?: string;
            message?: { tool_calls?: LocalToolCall[] };
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const choice = value.choices?.[0],
          calls = choice?.message?.tool_calls ?? [];
        if (
          calls.length > 6 ||
          calls.some(
            (call) =>
              call.id.length > 128 || call.function.arguments.length > 2000,
          )
        )
          throw new AIError('INVALID_OUTPUT', 422);
        if (choice?.finish_reason === 'length')
          throw new AIError('OUTPUT_TRUNCATED', 422, {
            stage: 'tool-selection',
          });
        return {
          calls,
          finishReason: choice?.finish_reason ?? 'unknown',
          inputTokens: value.usage?.prompt_tokens ?? 0,
          outputTokens: value.usage?.completion_tokens ?? 0,
        };
      }),
    { signal },
  );
}
