import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../..', import.meta.url));
const selected = new Set([
  'tools/release/ai-runtime.test.ts',
  'tools/release/demo-marker.test.tsx',
  'tools/allocation/policy.test.ts',
  'tools/testing/public-policy.test.ts',
  'tools/testing/installed-account-setup.test.ts',
]);
const ignored = new Set([
  '.git',
  '.local',
  'node_modules',
  '.next',
  'dist',
  'coverage',
]);
const rows = [],
  configs = [];
async function walk(dir = '') {
  for (const e of await readdir(root + '/' + dir, { withFileTypes: true })) {
    if (ignored.has(e.name)) continue;
    const path = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) await walk(path);
    else if (e.isFile()) {
      if (path.startsWith('config/testing/') && path.endsWith('.ts')) {
        const text = await readFile(root + '/' + path, 'utf8');
        if (text.includes('engineeringTestNames')) configs.push(path);
      }
      if (!/(?:\.test\.[cm]?[jt]sx?|\.spec\.tsx?|_test\.py)$/.test(path))
        continue;
      const text = await readFile(root + '/' + path, 'utf8');
      const names = [];
      let dynamic = 0;
      if (path.endsWith('.py')) {
        for (const m of text.matchAll(/^\s*def (test_[\w]+)\(/gm))
          names.push(m[1]);
      } else {
        const source = ts.createSourceFile(
          path,
          text,
          ts.ScriptTarget.Latest,
          true,
        );
        const visit = (node) => {
          if (
            ts.isCallExpression(node) &&
            /^(?:it|test)(?:\.|\(|$)/.test(node.expression.getText(source))
          ) {
            const first = node.arguments[0];
            if (
              first &&
              (ts.isStringLiteral(first) ||
                ts.isNoSubstitutionTemplateLiteral(first))
            )
              names.push(first.text);
            else dynamic++;
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
      rows.push({
        path,
        safe_unit_ci: selected.has(path)
          ? 'SELECTED'
          : 'NOT_SELECTED_BY_SAFE_UNIT_CI',
        literal_declarations: names,
        tc_literal_declarations: names.filter((n) =>
          /\bTC[-_ ]?\d+\b/i.test(n),
        ),
        dynamic_declarations_or_builders: dynamic,
        declaration_count_is_runtime_case_count: false,
      });
    }
  }
}
await walk();
const result = {
  policy: 'TESTING.md',
  selected_safe_unit_files: [...selected],
  selected_file_count: selected.size,
  discovered_test_source_files: rows.length,
  legacy_configs_with_explicit_historical_TC_filter: configs.sort(),
  legacy_TC_scenarios:
    'NOT_RUN by deferred engineering profiles; not counted as PASS',
  declaration_count_warning:
    'Parameterized tests and runtime conditionals require actual runner results. This inventory never claims a total runtime PASS count.',
  files: rows.sort((a, b) => a.path.localeCompare(b.path)),
};
await mkdir(root + '/.local/public-checks', { recursive: true, mode: 0o700 });
await writeFile(
  root + '/.local/public-checks/test-inventory.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      discovered_test_source_files: rows.length,
      selected_safe_unit_files: [...selected],
      nonselected_files: rows.length - selected.size,
      historical_TC_filter_configs: configs.length,
      historical_scenario_outcome: 'NOT_RUN',
      full_inventory: '.local/public-checks/test-inventory.json',
    },
    null,
    2,
  ),
);
