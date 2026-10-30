import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PasswordControl, PasswordGuidance } from './fields';

it.each([
  [1, 'يلزم حرف إضافي واحد.'],
  [2, 'يلزم حرفان إضافيان.'],
  [3, 'يلزم 3 أحرف إضافية.'],
  [11, 'يلزم 11 حرفًا إضافيًا.'],
] as const)(
  'uses Arabic character-number grammar for %s remaining',
  (needed, expected) => {
    const html = renderToStaticMarkup(
      createElement(PasswordGuidance, {
        locale: 'ar',
        policy: { minimum: 15, maximum: 128 },
        value: '😀'.repeat(15 - needed),
      }),
    );
    expect(html).toContain(expected);
  },
);
it('uses singular English guidance when one character remains', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordGuidance, {
      locale: 'en',
      policy: { minimum: 15, maximum: 128 },
      value: '😀'.repeat(14),
    }),
  );
  expect(html).toContain('1 more character needed.');
});

it.each(['en', 'ar'] as const)(
  'keeps password entry and reveal unavailable before its first preparation effect in %s',
  (locale) => {
    const html = renderToStaticMarkup(
      createElement(PasswordControl, {
        id: 'initial-password',
        locale,
        label: 'Password',
        value: '',
        onChange: () => {},
      }),
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('type="password"');
  },
);

it.each(['en', 'ar'] as const)(
  'associates password invalid and guidance messages in %s',
  (locale) => {
    const html = renderToStaticMarkup(
      createElement(PasswordControl, {
        id: 'new-password',
        locale,
        label: 'Password',
        value: '',
        onChange: () => {},
        newPassword: true,
        error: 'Length needs correcting',
        disabled: true,
      }),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain(
      'aria-describedby="new-password-error password-guidance"',
    );
    expect(html).toContain('id="new-password-error"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('dir="ltr"');
  },
);

it.each(['en', 'ar'] as const)(
  'gives actionable upper-bound guidance in %s using Unicode code points',
  (locale) => {
    const render = (value: string) =>
      renderToStaticMarkup(
        createElement(PasswordGuidance, {
          locale,
          policy: { minimum: 15, maximum: 128 },
          value,
        }),
      );
    const over = render('😀'.repeat(129));
    expect(over).toContain(
      locale === 'en'
        ? 'Remove 1 character to meet the maximum length.'
        : 'احذف حرفًا واحدًا للالتزام بالحد الأقصى للطول.',
    );
    expect(over).not.toContain(
      locale === 'en' ? '0 more characters needed.' : 'يلزم 0 أحرف إضافية.',
    );
    expect(render('😀'.repeat(15))).toContain(
      locale === 'en' ? 'Minimum length met.' : 'تحقق الحد الأدنى للطول.',
    );
  },
);
