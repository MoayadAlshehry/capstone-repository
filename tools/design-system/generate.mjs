import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const filenames = [
  'reference.tokens.json',
  'geometry.tokens.json',
  'motion.tokens.json',
];
const supported = new Set([
  'color',
  'dimension',
  'duration',
  'number',
  'fontFamily',
  'cubicBezier',
]);
const nameOf = (path) =>
  '--cr-' +
  path
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll('.', '-')
    .toLowerCase();
export function resolveTokens(documents) {
  const tokens = new Map(),
    names = new Map();
  function walk(value, path = '', inherited) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Invalid group: ' + path);
    const type = value.$type ?? inherited;
    if ('$value' in value) {
      if (!path || !supported.has(type))
        throw Error('Unsupported type: ' + path);
      const name = nameOf(path);
      if (tokens.has(path) || names.has(name))
        throw Error('Output-name collision: ' + path);
      tokens.set(path, { type, value: value.$value });
      names.set(name, path);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$')) continue;
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key))
        throw Error('Invalid token key: ' + key);
      walk(child, path ? path + '.' + key : key, type);
    }
  }
  for (const doc of documents) walk(doc);
  const done = new Map();
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  function visit(path, chain = []) {
    if (done.has(path)) return done.get(path);
    if (chain.includes(path))
      throw Error('Alias cycle: ' + [...chain, path].join(' -> '));
    const token = tokens.get(path);
    if (!token) throw Error('Unresolved alias: ' + path);
    let value = token.value;
    if (typeof value === 'string' && /^\{.+\}$/.test(value)) {
      const result = visit(value.slice(1, -1), [...chain, path]);
      if (result.type !== token.type)
        throw Error('Alias type mismatch: ' + path);
      value = result.value;
    }
    const fail = () => {
      throw Error('Invalid ' + token.type + ': ' + path);
    };
    let css;
    switch (token.type) {
      case 'color': {
        if (
          !value ||
          value.colorSpace !== 'srgb' ||
          !Array.isArray(value.components) ||
          value.components.length !== 3 ||
          value.components.some((n) => !finite(n) || n < 0 || n > 1) ||
          !finite(value.alpha ?? 1) ||
          (value.alpha ?? 1) < 0 ||
          (value.alpha ?? 1) > 1 ||
          !/^#[\da-f]{6}$/i.test(value.hex ?? '')
        )
          fail();
        const expected = value.components.map((n) => Math.round(n * 255));
        const hex = value.hex
          .slice(1)
          .match(/../g)
          .map((n) => parseInt(n, 16));
        if (expected.some((n, i) => n !== hex[i])) fail();
        css =
          (value.alpha ?? 1) === 1
            ? value.hex.toUpperCase()
            : `rgb(${expected.join(' ')} / ${value.alpha})`;
        break;
      }
      case 'dimension':
      case 'duration':
        if (
          !value ||
          !finite(value.value) ||
          !(token.type === 'dimension' ? ['px', 'rem'] : ['ms', 's']).includes(
            value.unit,
          ) ||
          value.value < 0
        )
          fail();
        css = value.value + value.unit;
        break;
      case 'number':
        if (!finite(value)) fail();
        css = String(value);
        break;
      case 'fontFamily':
        if (!(
          (typeof value === 'string' && value.length) ||
          (Array.isArray(value) &&
            value.length &&
            value.every((n) => typeof n === 'string' && n.length))
        ))
          fail();
        if (
          (Array.isArray(value) ? value : [value]).some((n) =>
            /[\u0000-\u001f]/.test(n),
          )
        )
          fail();
        css = (Array.isArray(value) ? value : [value])
          .map((n) => (/^[a-zA-Z_][\w-]*$/.test(n) ? n : JSON.stringify(n)))
          .join(', ');
        break;
      case 'cubicBezier':
        if (
          !Array.isArray(value) ||
          value.length !== 4 ||
          value.some((n) => !finite(n)) ||
          value[0] < 0 ||
          value[0] > 1 ||
          value[2] < 0 ||
          value[2] > 1
        )
          fail();
        css = 'cubic-bezier(' + value.join(',') + ')';
        break;
    }
    const result = { type: token.type, value, css, name: nameOf(path) };
    done.set(path, result);
    return result;
  }
  return Object.fromEntries(
    [...tokens.keys()].sort().map((path) => [path, visit(path)]),
  );
}
export function generate(documentsByTheme) {
  const inputFingerprint = createHash('sha256')
    .update(JSON.stringify(documentsByTheme))
    .digest('hex');
  let css = `/* Generated by tools/design-system/generate.mjs; source ${inputFingerprint}. Do not edit. */\n`;
  const resolved = {};
  for (const theme of ['light', 'dark']) {
    resolved[theme] = resolveTokens(documentsByTheme[theme]);
    css += `:where([data-cr-ds][data-theme="${theme}"]) {\n`;
    for (const token of Object.values(resolved[theme]))
      css += `  ${token.name}: ${token.css};\n`;
    css += '}\n';
  }
  return { css, resolved, inputFingerprint };
}
export async function main(args = process.argv.slice(2)) {
  const input = resolve(
    args.includes('--input')
      ? args[args.indexOf('--input') + 1]
      : root + '/packages/ui/design-system/tokens',
  );
  const output = resolve(
    args.includes('--output')
      ? args[args.indexOf('--output') + 1]
      : root + '/packages/ui/design-system/generated/tokens.css',
  );
  const common = await Promise.all(
    filenames.map(async (f) =>
      JSON.parse(await readFile(input + '/' + f, 'utf8')),
    ),
  );
  const data = {};
  for (const theme of ['light', 'dark'])
    data[theme] = [
      ...common,
      JSON.parse(
        await readFile(input + '/semantic.' + theme + '.tokens.json', 'utf8'),
      ),
    ];
  const result = generate(data);
  let current;
  try {
    current = await readFile(output, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (args.includes('--check')) {
    if (current !== result.css) throw Error('Generated tokens are stale');
  } else if (current !== result.css) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, result.css);
  }
  console.log(
    'TOKENS_' + (args.includes('--check') ? 'FRESH' : 'GENERATED'),
    result.inputFingerprint,
  );
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
