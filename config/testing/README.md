# Test runner configurations

All Playwright and Vitest configurations live here. Run commands from the repository root inside WSL; existing `pnpm` test/browser scripts select their configurations explicitly.

```sh
corepack pnpm test:unit
corepack pnpm exec vitest run --config config/testing/vitest.config.ts
corepack pnpm exec vitest run --config config/testing/vitest.auth.config.ts
corepack pnpm exec playwright test --config config/testing/playwright.config.ts
```

Vitest source aliases and local imports resolve from this directory; test include patterns and report paths remain relative to the repository working directory. `playwright-paths.ts` preserves the former repository-root resolution of Playwright test and artifact directories, including relative environment overrides. Reporter paths, URLs, workers, retries and test selections are unchanged.

Historical evidence and phase records retain the commands used at the time. When replaying them, replace a former root configuration filename with `config/testing/<filename>`. Direct runner invocations now require `--config`; the named package scripts already provide it.
