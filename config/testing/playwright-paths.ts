import {
  defineConfig as playwrightConfig,
  type PlaywrightTestConfig,
} from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

// Playwright resolves these paths against the config directory. Keep the original
// repository-root resolution, including relative environment overrides.
export function defineConfig(config: PlaywrightTestConfig) {
  return playwrightConfig({
    ...config,
    ...(config.testDir !== undefined
      ? { testDir: resolve(repositoryRoot, config.testDir) }
      : {}),
    ...(config.outputDir !== undefined
      ? {
          outputDir: resolve(
            repositoryRoot,
            config.outputDir || 'test-results',
          ),
        }
      : {}),
  });
}
