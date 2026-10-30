import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(app, '../..');
const require = createRequire(root + '/package.json');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const from = resolve(app, 'ai/official.css');
const to = resolve(app, 'public/assistant-ui-default.css');
const originalCSS = await readFile(from, 'utf8');
const aliases = [];
postcss.parse(originalCSS).walkAtRules('theme', (rule) => {
  rule.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) aliases.push(declaration.toString());
  });
});
// Unchanged official theme aliases must resolve in the isolated theme rather
// than inherit similarly named variables from the surrounding application.
const isolatedCSS = originalCSS + '\n:host, .dark {' + aliases.join(';') + ';}';
const result = await postcss([tailwind()]).process(isolatedCSS, { from, to });
const dot = await readFile(
  require.resolve('@assistant-ui/react-markdown/styles/dot.css', {
    paths: [app],
  }),
  'utf8',
);
await writeFile(to, result.css + '\n' + dot);
const properties = [];
result.root.walkAtRules('property', (rule) => properties.push(rule.toString()));
await writeFile(
  resolve(app, 'public/assistant-ui-properties.css'),
  properties.join('\n'),
);
console.log(
  'Compiled official assistant-ui styles:',
  Buffer.byteLength(result.css),
);
