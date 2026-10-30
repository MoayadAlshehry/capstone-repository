import { main, resolveTokens } from './generate.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
/** Reuse the typed, validated P2 token resolver; workspace opt-in only, including original portals. */
export async function workspaceTokens(check = false) {
  const source = await main(['--check']);
  const raw = await readFile(
    root + '/packages/ui/design-system/tokens/workspace-dark.tokens.json',
    'utf8',
  );
  const extension = resolveTokens([JSON.parse(raw)]);
  const workspaceFingerprint = createHash('sha256').update(raw).digest('hex');
  const appearanceRaw = await readFile(
    root + '/packages/ui/design-system/tokens/workspace-appearance.tokens.json',
    'utf8',
  );
  const appearanceResolved = resolveTokens([
    {
      reference: JSON.parse(
        await readFile(
          root + '/packages/ui/design-system/tokens/reference.tokens.json',
          'utf8',
        ),
      ).reference,
    },
    JSON.parse(appearanceRaw),
  ]);
  for (const [path, token] of Object.entries(appearanceResolved)) {
    if (
      !path.startsWith('reference.') &&
      !path.startsWith('component.workspace.')
    )
      throw Error('Unknown workspace appearance role: ' + path);
    if (
      path.startsWith('component.workspace.') &&
      !['dimension', 'number', 'duration'].includes(token.type)
    )
      throw Error(
        'Workspace appearance cannot override color or behavior: ' + path,
      );
  }
  const appearance = Object.entries(appearanceResolved)
    .filter(([path]) => path.startsWith('component.workspace.'))
    .map(([, token]) => token);
  const appearanceFingerprint = createHash('sha256')
    .update(appearanceRaw)
    .digest('hex');
  const dark = new Map(
    Object.entries(source.resolved.dark)
      .filter(([path]) =>
        /^(semantic\.|component\.loading\.|motion\.skeleton)/.test(path),
      )
      .map(([, token]) => [token.name, token]),
  );
  const extras = new Set([
    '--cr-semantic-surface-sidebar',
    '--cr-semantic-surface-topbar',
  ]);
  for (const token of Object.values(extension)) {
    if (!dark.has(token.name) && !extras.has(token.name))
      throw Error('Unknown workspace override: ' + token.name);
    if (token.type !== 'color')
      throw Error('Workspace extension must be color-only');
  }
  const overrideNames = new Set(
    Object.values(extension).map((token) => token.name),
  );
  for (const name of [...dark.keys()].filter((name) =>
    name.startsWith('--cr-semantic-'),
  ))
    if (!overrideNames.has(name))
      throw Error('Missing workspace dark semantic: ' + name);
  for (const name of extras)
    if (!overrideNames.has(name))
      throw Error('Missing workspace surface: ' + name);
  for (const token of Object.values(extension)) dark.set(token.name, token);
  let css = `/* Generated workspace-only bridge; P2 source ${source.inputFingerprint}; workspace dark ${workspaceFingerprint}; appearance ${appearanceFingerprint}. Public P2 output unchanged. */\n`;
  for (const theme of ['light', 'dark']) {
    css +=
      (theme === 'light' ? '.wsv2' : ':root[data-theme="dark"] .wsv2') + ' {\n';
    if (theme === 'light') {
      for (const [path, token] of Object.entries(source.resolved.light))
        if (/^(semantic\.|component\.loading\.|motion\.skeleton)/.test(path))
          css += `  ${token.name}: ${token.css};\n`;
    } else
      for (const token of [...dark.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'en'),
      ))
        css += `  ${token.name}: ${token.css};\n`;
    for (const token of appearance) css += `  ${token.name}: ${token.css};\n`;
    css += '}\n';
  }
  const output =
    root + '/packages/ui/design-system/generated/workspace-tokens.css';
  if (check) {
    if ((await readFile(output, 'utf8')) !== css)
      throw Error('Workspace tokens stale');
  } else await writeFile(output, css);
  console.log('WORKSPACE_TOKENS_' + (check ? 'FRESH' : 'GENERATED'));
  return {
    workspaceFingerprint,
    appearanceFingerprint,
    p2Fingerprint: source.inputFingerprint,
    extension,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await workspaceTokens(process.argv.includes('--check'));
