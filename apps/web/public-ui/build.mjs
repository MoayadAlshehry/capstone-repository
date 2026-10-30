import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../../../package.json'));
const postcss = require('postcss'),
  tailwind = require('@tailwindcss/postcss');
const from = resolve(here, 'foundation.css');
const result = await postcss([tailwind()]).process(
  await readFile(from, 'utf8'),
  { from, to: resolve(here, '../public/public-ui.css') },
);
// Utilities and animation selectors must never reach a workspace or the paused AI.
result.root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name))
    return;
  if (
    !rule.selector ||
    rule.selector.startsWith('&') ||
    rule.selector.includes('data-public-ui')
  )
    return;
  rule.selectors = rule.selectors.map((s) =>
    s === ':root' || s === ':host'
      ? ':where([data-public-ui="shadcn"])'
      : ':is(' +
        s +
        '):where([data-public-ui="shadcn"], [data-public-ui="shadcn"] *)',
  );
});
await writeFile(resolve(here, '../public/public-ui.css'), result.css);
console.log(
  'Public-only shadcn stylesheet compiled:',
  Buffer.byteLength(result.css),
);
