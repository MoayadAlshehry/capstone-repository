import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssessmentSummary } from './assessment.js';
import { R3Environment, Tools } from '../r3/shared.js';

const criteria = [
  {
    key: 'demo',
    title: 'Criterion',
    intent: 'Review the work.',
    weight: 100,
    anchors: [0, 1, 2, 3, 4].map((level) => ({
      level: level as 0 | 1 | 2 | 3 | 4,
      label: 'Level ' + level,
      detail: 'Anchor',
    })),
  },
];
const summary = (
  locale: 'en' | 'ar',
  total: string | null,
  level: number | null,
  title = 'Assessment',
) =>
  renderToStaticMarkup(
    <AssessmentSummary
      locale={locale}
      title={title}
      total={total}
      rubric="DEMO"
      criteria={criteria}
      values={[{ level, note: '' }]}
    />,
  );

describe('professional interface punctuation', () => {
  it('excludes literal and encoded em dashes from platform-owned interface source', async () => {
    const violations: string[] = [];
    const forbidden = new RegExp(
      String.fromCharCode(0x2014) +
        '|\\\\u(?:2014|\\{2014\\})|&(?:mdash|#8212|#x2014);',
      'i',
    );
    async function scan(directory: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (['node_modules', '.next', 'dist', 'public'].includes(entry.name))
          continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await scan(path);
        else if (
          /\.(tsx?|json|css|html|mjs)$/.test(path) &&
          !/\.(test|spec)\.tsx?$/.test(path)
        ) {
          const lines = (await readFile(path, 'utf8')).split('\n');
          lines.forEach((line, index) => {
            if (forbidden.test(line)) violations.push(path + ':' + (index + 1));
          });
        }
      }
    }
    await scan('apps/web');
    await scan('packages/ui/src');
    expect(violations).toEqual([]);
  });

  it.each(['en', 'ar'] as const)(
    'distinguishes absent scores from zero in %s without orphan denominators',
    (locale) => {
      const empty = summary(locale, null, null);
      expect(empty).toContain(locale === 'ar' ? 'غير متاح' : 'Not available');
      expect(empty).toContain(locale === 'ar' ? 'غير محدد' : 'Unselected');
      expect(empty).not.toContain('/100');
      expect(empty).not.toContain('/4');
      expect(empty).toContain('dir="auto"');
      const zero = summary(locale, '0', 0);
      expect(zero).toContain('<strong dir="ltr">0.0</strong>');
      expect(zero).toContain('/100');
      expect(zero).toContain('0<small>/4</small>');
      expect(zero).not.toContain(
        locale === 'ar' ? 'غير متاح' : 'Not available',
      );
    },
  );

  it.each(['en', 'ar'] as const)(
    'keeps unavailable Inbox counts accessible and preserves zero in %s',
    (locale) => {
      const render = (unread: number | null) =>
        renderToStaticMarkup(
          <R3Environment
            locale={locale}
            inbox={{ href: '/' + locale + '/inbox', unread }}
          >
            <Tools />
          </R3Environment>,
        );
      const empty = render(null);
      expect(empty).toContain(
        locale === 'ar' ? 'العدد غير متاح' : 'Count unavailable',
      );
      expect(empty).not.toContain('<bdi');
      expect(render(0)).toContain('<bdi dir="ltr">0</bdi>');
      expect(render(1000)).toContain('999+');
    },
  );

  it('formats the visible total while preserving supplied author content and integer rubric inputs', () => {
    const title = 'Owner content ' + String.fromCharCode(0x2014) + ' unchanged';
    const html = summary('en', '51.25', 2, title);
    expect(html).toContain(title);
    expect(html).toContain('51.3');
    expect(html).toContain('2<small>/4</small>');
  });
});
