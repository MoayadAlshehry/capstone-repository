import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
// Vitest's module runner needs the marker's official react-server entry explicitly.
// Real compiled default/client rejection is tested in separate Node subprocesses.
const marker = createRequire(
  new URL('../../packages/config/package.json', import.meta.url),
).resolve('server-only');
export default defineConfig({
  resolve: {
    conditions: ['node'],
    alias: {
      '@capstone/domain/discovery': source(
        '../../packages/domain/src/discovery.ts',
      ),
      '@capstone/domain/native-files': source(
        '../../packages/domain/src/native-files.ts',
      ),
      '@capstone/db/showcase': source('../../packages/db/src/showcase.ts'),
      '@capstone/domain/showcase-engine': source(
        '../../packages/domain/src/showcase-engine.ts',
      ),
      '@capstone/domain/showcase': source(
        '../../packages/domain/src/showcase.ts',
      ),
      '@capstone/db/corrections': source(
        '../../packages/db/src/corrections.ts',
      ),
      '@capstone/domain/corrections-engine': source(
        '../../packages/domain/src/corrections-engine.ts',
      ),
      '@capstone/db/allocation': source('../../packages/db/src/allocation.ts'),
      '@capstone/domain/event-allocation-policy': source('../../packages/domain/src/event-allocation-policy.ts'),
      '@capstone/domain/allocation-policy': source(
        '../../packages/domain/src/allocation-policy.ts',
      ),
      '@capstone/domain/allocation-engine': source(
        '../../packages/domain/src/allocation-engine.ts',
      ),
      '@capstone/db/external-reviews': source(
        '../../packages/db/src/external-reviews.ts',
      ),
      '@capstone/domain/external-reviews': source(
        '../../packages/domain/src/external-reviews.ts',
      ),
      '@capstone/domain/external-reviews-engine': source(
        '../../packages/domain/src/external-reviews-engine.ts',
      ),
      '@capstone/db/packets': source('../../packages/db/src/packets.ts'),
      '@capstone/domain/packets-engine': source(
        '../../packages/domain/src/packets-engine.ts',
      ),
      '@capstone/db/reviewers': source('../../packages/db/src/reviewers.ts'),
      '@capstone/db/reviewer-types': source(
        '../../packages/db/src/reviewer-types.ts',
      ),
      '@capstone/db/governance': source('../../packages/db/src/governance.ts'),
      '@capstone/domain/notification-types': source(
        '../../packages/domain/src/notification-types.ts',
      ),
      '@capstone/infrastructure/governance-worker': source(
        '../../packages/infrastructure/src/governance-worker.ts',
      ),
      '@capstone/infrastructure/file-export': source(
        '../../packages/infrastructure/src/file-export.ts',
      ),
      '@capstone/db/grants': source('../../packages/db/src/grants.ts'),
      '@capstone/db/partners': source('../../packages/db/src/partners.ts'),
      '@capstone/db/discovery': source('../../packages/db/src/discovery.ts'),
      '@capstone/domain/discovery-engine': source(
        '../../packages/domain/src/discovery-engine.ts',
      ),
      '@capstone/db/editions': source('../../packages/db/src/editions.ts'),
      '@capstone/domain/editions-engine': source(
        '../../packages/domain/src/editions-engine.ts',
      ),
      '@capstone/ui/theme': source('../../packages/ui/src/theme.ts'),
      '@capstone/ui': source('../../packages/ui/src/index.tsx'),
      '@capstone/testing/fixtures': source(
        '../../packages/testing/src/fixtures.ts',
      ),
      '@capstone/testing': source('../../packages/testing/src/index.ts'),
      'server-only': join(dirname(marker), 'empty.js'),
      '@capstone/config/server': source('../../packages/config/src/server.ts'),
      '@capstone/config': source('../../packages/config/src/index.ts'),
      '@capstone/db/submissions': source(
        '../../packages/db/src/submissions.ts',
      ),
      '@capstone/db/publications': source(
        '../../packages/db/src/publications.ts',
      ),
      '@capstone/domain/publications-engine': source(
        '../../packages/domain/src/publications-engine.ts',
      ),
      '@capstone/db/evaluations': source(
        '../../packages/db/src/evaluations.ts',
      ),
      '@capstone/domain/evaluations-engine': source(
        '../../packages/domain/src/evaluations-engine.ts',
      ),
      '@capstone/domain/submissions-engine': source(
        '../../packages/domain/src/submissions-engine.ts',
      ),
      '@capstone/domain/files-engine': source(
        '../../packages/domain/src/files-engine.ts',
      ),
      '@capstone/domain/server': source('../../packages/domain/src/server.ts'),
      '@capstone/domain': source('../../packages/domain/src/index.ts'),
      '@capstone/db/native-reads': source(
        '../../packages/db/src/native-reads.ts',
      ),
      '@capstone/infrastructure/native-files': source(
        '../../packages/infrastructure/src/native-files.ts',
      ),
      '@capstone/db/uploads': source('../../packages/db/src/uploads.ts'),
      '@capstone/infrastructure/uploads': source(
        '../../packages/infrastructure/src/uploads.ts',
      ),
      '@capstone/storage/transfers': source(
        '../../packages/storage/src/transfers.ts',
      ),
      '@capstone/db/files': source('../../packages/db/src/files.ts'),
      '@capstone/storage/native': source(
        '../../packages/storage/src/native.ts',
      ),
      '@capstone/storage/content': source(
        '../../packages/storage/src/content.ts',
      ),
      '@capstone/db/auth': source('../../packages/db/src/auth.ts'),
      '@capstone/db/drafts': source('../../packages/db/src/drafts.ts'),
      '@capstone/db/assignments': source(
        '../../packages/db/src/assignments.ts',
      ),
      '@capstone/db/administration': source(
        '../../packages/db/src/administration.ts',
      ),
      '@capstone/db/migration': source('../../packages/db/src/migration.ts'),
      '@capstone/db': source('../../packages/db/src/index.ts'),
      '@capstone/storage': source('../../packages/storage/src/index.ts'),
      '@capstone/infrastructure': source(
        '../../packages/infrastructure/src/index.ts',
      ),
    },
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      'tools/**/*.test.ts',
    ],
    exclude: [
      ...configDefaults.exclude,
      '**/*.integration.test.ts',
      'tools/browser/specs/**',
    ],
    passWithNoTests: false,
  },
});
