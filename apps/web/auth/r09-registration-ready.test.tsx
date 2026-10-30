import { it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { R3Environment } from '@capstone/ui/r3';
import { PartnerRegistrationForm } from './r3-forms';

it.each(['en', 'ar'] as const)(
  'public registration SSR %s cannot accept or submit input before the initial privacy/hydration preparation',
  (locale) => {
    const markup = renderToStaticMarkup(
        <R3Environment locale={locale}>
          <PartnerRegistrationForm />
        </R3Environment>,
      ),
      inputs = [...markup.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]),
      buttons = [...markup.matchAll(/<button\b[^>]*>/g)].map(
        (match) => match[0],
      );
    expect(inputs).toHaveLength(5);
    expect(inputs.every((input) => /\bdisabled=""/.test(input))).toBe(true);
    expect(buttons).toHaveLength(3);
    expect(buttons.every((button) => /\bdisabled=""/.test(button))).toBe(true);
    const passwords = inputs.filter((input) => /type="password"/.test(input));
    expect(passwords).toHaveLength(2);
    expect(
      passwords.every(
        (input) =>
          /minLength="12"/.test(input) && /maxLength="128"/.test(input),
      ),
    ).toBe(true);
    expect(markup).not.toContain('Registration was not completed');
  },
);
