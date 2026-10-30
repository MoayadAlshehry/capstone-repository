import { describe, expect, it } from 'vitest';
import { publicConfig } from './index.js';
import {
  ConfigurationError,
  parseServerConfig,
  parseInfrastructureConfig,
} from './server.js';

const valid = {
  APP_ENV: 'test',
  SERVICE_PORT: 3101,
  WORKSPACE_ROOT: 'D:\\A workspace with spaces',
};
describe('runtime configuration', () => {
  it('validates server-only infrastructure without exposing credentials to public config', () => {
    const root = process.cwd();
    const privateRoot = `${root}/.local/storage`;
    const config = parseInfrastructureConfig(
      {
        DATABASE_URL:
          'postgresql://capstone_runtime:synthetic-only@127.0.0.1:5432/capstone_local',
        PRIVATE_STORAGE_ROOT: privateRoot,
      },
      root,
      'test',
    );
    expect(config.databaseUrl.includes('capstone_runtime')).toBe(true);
    expect(Object.keys(publicConfig())).not.toContain('databaseUrl');
    expect(() =>
      parseInfrastructureConfig(
        {
          DATABASE_URL:
            'postgresql://capstone_bootstrap:synthetic-only@127.0.0.1/db',
          PRIVATE_STORAGE_ROOT: privateRoot,
        },
        root,
        'test',
      ),
    ).toThrow(ConfigurationError);
    expect(() =>
      parseInfrastructureConfig(
        {
          DATABASE_URL: 'synthetic-invalid-private-value',
          PRIVATE_STORAGE_ROOT: privateRoot,
        },
        root,
        'test',
      ),
    ).toThrow(/DATABASE_URL/);
  });
  it('validates server settings, preserves spaced paths and freezes the result', () => {
    const result = parseServerConfig(valid);
    expect(result.WORKSPACE_ROOT).toBe(valid.WORKSPACE_ROOT);
    expect(result.BIND_HOST).toBe('127.0.0.1');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('rejects a missing required non-secret setting', () => {
    expect(() =>
      parseServerConfig({ SERVICE_PORT: 3101, WORKSPACE_ROOT: 'workspace' }),
    ).toThrow(/APP_ENV/);
  });
  it.each([
    { APP_ENV: 'invalid' },
    { SERVICE_PORT: 70000 },
    { BIND_HOST: '0.0.0.0' },
  ])('rejects invalid values: %j', (change) => {
    expect(() => parseServerConfig({ ...valid, ...change })).toThrow(
      ConfigurationError,
    );
  });
  it('does not echo invalid input or unexpected synthetic secrets', () => {
    const synthetic = 'synthetic-private-input-do-not-log';
    try {
      parseServerConfig({
        ...valid,
        APP_ENV: synthetic,
        BETTER_AUTH_SECRET: synthetic,
      });
      expect.fail('must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(String(error)).not.toContain(synthetic);
      expect(String(error)).toContain('APP_ENV');
    }
  });
  it('drops unknown server inputs and exposes only an explicit safe public projection', () => {
    expect(
      parseServerConfig({ ...valid, BETTER_AUTH_SECRET: 'synthetic-only' }),
    ).not.toHaveProperty('BETTER_AUTH_SECRET');
    expect(publicConfig()).toEqual({
      productName: 'CAPSTONE REPOSITORY',
      foundationPhase: 'PHASE_02',
    });
  });
});
