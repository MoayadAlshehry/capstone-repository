import 'server-only';
import { z } from 'zod';
import { ApplicationError } from '@capstone/domain';
import { resolve, relative, isAbsolute } from 'node:path';

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'production']),
  SERVICE_PORT: z.coerce.number().int().min(1024).max(65535),
  BIND_HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  WORKSPACE_ROOT: z.string().trim().min(1),
});
export type ServerConfig = Readonly<z.infer<typeof schema>>;
export class ConfigurationError extends ApplicationError {
  constructor(readonly settings: readonly string[]) {
    super('INVALID_CONFIGURATION');
    this.message = `Invalid configuration: ${settings.join(', ')}. Check .env.example and use the documented values.`;
  }
}
export function parseServerConfig(
  input: Record<string, unknown>,
): ServerConfig {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Known field names only; do not expose Zod issues, raw input, URLs or secret values.
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new ConfigurationError(fields);
  }
  if (
    result.data.APP_ENV !== 'production' &&
    result.data.BIND_HOST !== '127.0.0.1'
  )
    throw new ConfigurationError(['BIND_HOST']);
  return Object.freeze(result.data);
}
export function loadServerConfig(defaultPort: number): ServerConfig {
  return parseServerConfig({
    APP_ENV: process.env['APP_ENV'] ?? 'local',
    SERVICE_PORT: process.env['SERVICE_PORT'] ?? defaultPort,
    BIND_HOST: process.env['BIND_HOST'] ?? '127.0.0.1',
    WORKSPACE_ROOT: process.env['WORKSPACE_ROOT'] ?? process.cwd(),
  });
}
const infrastructureSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['postgres:', 'postgresql:'].includes(url.protocol) &&
          url.username === 'capstone_runtime' &&
          url.search === '' &&
          url.hash === '' &&
          Boolean(url.password) &&
          Boolean(url.hostname)
        );
      } catch {
        return false;
      }
    }),
  PRIVATE_STORAGE_ROOT: z.string().min(1),
});
export function parseInfrastructureConfig(
  input: Record<string, unknown>,
  workspaceRoot: string,
  environment: ServerConfig['APP_ENV'],
) {
  const result = infrastructureSchema.safeParse(input);
  if (!result.success)
    throw new ConfigurationError([
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ]);
  const root = resolve(result.data.PRIVATE_STORAGE_ROOT);
  const privateRelative = relative(resolve(workspaceRoot, '.local'), root);
  if (
    environment !== 'production' &&
    (privateRelative.startsWith('..') || isAbsolute(privateRelative))
  )
    throw new ConfigurationError(['PRIVATE_STORAGE_ROOT']);
  return Object.freeze({
    databaseUrl: result.data.DATABASE_URL,
    storageRoot: root,
    workspaceRoot: resolve(workspaceRoot),
    environment,
  });
}
export function loadInfrastructureConfig() {
  const workspaceRoot = process.env['WORKSPACE_ROOT'] ?? process.cwd();
  const environment = schema.shape.APP_ENV.safeParse(
    process.env['APP_ENV'] ?? 'local',
  );
  if (!environment.success) throw new ConfigurationError(['APP_ENV']);
  return parseInfrastructureConfig(
    {
      DATABASE_URL: process.env['DATABASE_URL'],
      PRIVATE_STORAGE_ROOT:
        process.env['PRIVATE_STORAGE_ROOT'] ??
        (environment.data === 'production'
          ? undefined
          : resolve(workspaceRoot, '.local/storage')),
    },
    workspaceRoot,
    environment.data,
  );
}
