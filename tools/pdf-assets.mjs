import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  mkdir,
  copyFile,
  cp,
  readFile,
  readdir,
  unlink,
} from 'node:fs/promises';
const require = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const version = JSON.parse(
  await readFile(join(source, 'package.json'), 'utf8'),
).version;
if (version !== '6.3.289')
  throw Error('PDF asset version differs from pinned dependency');
const target = new URL(
  '../apps/web/public/pdfjs/' + version + '/',
  import.meta.url,
);
await mkdir(target, { recursive: true });
for (const folder of ['cmaps', 'standard_fonts'])
  await cp(join(source, folder), new URL(folder + '/', target), {
    recursive: true,
  });
await copyFile(join(source, 'LICENSE'), new URL('LICENSE', target));
const wasm = new URL('wasm/', target);
await mkdir(wasm, { recursive: true });
for (const name of await readdir(join(source, 'wasm'))) {
  if (name.startsWith('quickjs')) {
    await unlink(new URL(name, wasm)).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    continue;
  }
  await copyFile(join(source, 'wasm', name), new URL(name, wasm));
}
