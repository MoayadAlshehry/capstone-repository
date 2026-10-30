import { describe, expect, it } from 'vitest';
import {
  ApplicationError,
  foundationReadiness,
  serializeError,
} from './index.js';
import { createRequestId } from './server.js';

describe('safe foundation contracts', () => {
  it('conceals unexpected error details and stack', () => {
    const result = serializeError(
      new Error('synthetic-secret'),
      'request-reference',
    );
    expect(result.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
    expect(result.error.requestId).toBe('request-reference');
    expect(result).not.toHaveProperty('stack');
  });
  it('serializes known errors with a fixed safe message', () => {
    expect(
      serializeError(new ApplicationError('INVALID_REQUEST'), 'id').error.code,
    ).toBe('INVALID_REQUEST');
  });
  it('uses distinct UUIDs from the Node crypto runtime', () => {
    const first = createRequestId();
    const second = createRequestId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });
  it.each(['web', 'upload', 'worker'] as const)(
    'reports honest foundation-only readiness for %s',
    (service) => {
      expect(foundationReadiness(service)).toMatchObject({
        service,
        phase: 'PHASE_02',
        businessWorkflowsAvailable: false,
      });
    },
  );
});
