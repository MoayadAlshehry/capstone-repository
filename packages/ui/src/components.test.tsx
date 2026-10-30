import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, Field, Input, Text, BrandLogo } from './index.js';
import { resolveTheme, themeInitialization, themeStorageKey } from './theme.js';
import { runInNewContext } from 'node:vm';
it('renders genuine disabled/loading/busy semantics and localized loading text', () => {
  const html = renderToStaticMarkup(
    <Button loading loadingLabel="جاري التحميل">
      Submit
    </Button>,
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('role="status"');
  expect(html).toContain('جاري التحميل');
});
it('requires accessible icon-only names and localized loading labels', () => {
  expect(() =>
    renderToStaticMarkup(
      <Button size="icon" aria-label=" ">
        x
      </Button>,
    ),
  ).toThrow('accessible');
  expect(() => renderToStaticMarkup(<Button loading>Load</Button>)).toThrow(
    'localized',
  );
});
it('associates required/help/error field information with the real input', () => {
  const html = renderToStaticMarkup(
    <Field id="technical" label="Identifier" help="Help" error="Error" required>
      {(props) => <Input {...props} />}
    </Field>,
  );
  expect(html).toContain('for="technical"');
  expect(html).toContain('aria-describedby="technical-help technical-error"');
  expect(html).toContain('aria-invalid="true"');
  expect(html).toContain('aria-required="true"');
  expect(html).toContain('id="technical-error"');
});
it('scopes Arabic text direction while keeping supplied logo ratios and accessible names', () => {
  const text = renderToStaticMarkup(<Text language="ar">مرحبا</Text>);
  expect(text).toContain('lang="ar"');
  expect(text).toContain('dir="rtl"');
  const image = renderToStaticMarkup(<BrandLogo label="CAPSTONE REPOSITORY" />);
  expect(image).toContain('width="1400"');
  expect(image).toContain('height="520"');
  expect(image).toContain('aria-label="CAPSTONE REPOSITORY"');
  expect(image).toContain('data-brand-source="/brand/Primary_Logo.svg"');
  expect(
    renderToStaticMarkup(<BrandLogo decorative label="Identity" />),
  ).not.toContain('aria-label="Identity"');
});
it.each(['light', 'dark', 'invalid', null])(
  'resolves theme %s before paint with safe storage failure handling',
  (value) => {
    const document = {
      documentElement: {
        dataset: {} as Record<string, string>,
        style: {} as Record<string, string>,
      },
    };
    runInNewContext(themeInitialization, {
      document,
      localStorage: {
        getItem: (key: string) => {
          expect(key).toBe(themeStorageKey);
          return value;
        },
      },
    });
    expect(document.documentElement.dataset.theme).toBe(resolveTheme(value));
    expect(document.documentElement.style.colorScheme).toBe(
      resolveTheme(value),
    );
  },
);
it('defaults to light when storage is denied', () => {
  const document = {
    documentElement: {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
    },
  };
  runInNewContext(themeInitialization, {
    document,
    localStorage: {
      getItem: () => {
        throw Error('blocked');
      },
    },
  });
  expect(document.documentElement.dataset.theme).toBe('light');
});
