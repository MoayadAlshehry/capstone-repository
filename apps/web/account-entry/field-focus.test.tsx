import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountEntry, type EntryMode } from './forms';
import { firstInvalidEntryField } from './field-focus';
import { AccountDrafts } from './drafts';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/en/activate',
}));

it.each([
  ['activate', 'token'],
  ['login', 'email'],
  ['forgot-password', 'email'],
  ['request-setup', 'email'],
] as const)(
  '%s focuses its first rendered invalid input when validators report errors in another order',
  (mode: EntryMode, expected) => {
    const markup = renderToStaticMarkup(
      <AccountDrafts>
        <AccountEntry
          locale="en"
          mode={mode}
          policy={{ minimum: 15, maximum: 128 }}
        />
      </AccountDrafts>,
    );
    const controls = [...markup.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(
      (match) => ({ id: match[1]! }),
    );
    const errors = {
      confirm: 'match',
      password: 'required',
      token: 'required',
      email: 'email',
    };
    expect(firstInvalidEntryField(controls, errors)).toBe(expected);
    expect(firstInvalidEntryField(controls, {})).toBeUndefined();
  },
);
