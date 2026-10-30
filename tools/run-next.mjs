import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { assertWebOutputIdle } from './web-output-guard.mjs';
const command = process.argv[2];
if (!['dev', 'build', 'start', 'typegen'].includes(command))
  throw Error('Unsupported repository Next command');
if (['build', 'dev'].includes(command)) {
  await assertWebOutputIdle(new URL('../apps/web', import.meta.url).pathname);
  await import('./pdf-assets.mjs');
}
const env = { ...process.env };
if (process.platform === 'win32') {
  const cache = join(homedir(), '.capstone-swc-native-cache');
  if (!statSync(cache).isDirectory())
    throw Error('Owner-provisioned secure SWC cache missing');
  env.SWC_NATIVE_BINDING_CACHE = cache;
}
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const child = spawn(
  process.execPath,
  command === 'start'
    ? [
        new URL('../apps/web/server.mjs', import.meta.url).pathname,
        ...process.argv.slice(3),
      ]
    : [require.resolve('next/dist/bin/next'), ...process.argv.slice(2)],
  { stdio: 'inherit', env },
);
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
