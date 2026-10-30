import { defineRouting } from 'next-intl/routing';
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'always',
  localeDetection: false,
  localeCookie: { name: 'capstone.locale', sameSite: 'lax', maxAge: 31536000 },
});
export type Locale = (typeof routing.locales)[number];
export function visitorLocale(value: string | undefined): Locale {
  return value === 'ar' ? 'ar' : 'en';
}
