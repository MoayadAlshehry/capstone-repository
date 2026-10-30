import { getRequestConfig } from 'next-intl/server';
import { visitorLocale } from './routing';
import en from '../messages/en.json';
import ar from '../messages/ar.json';
import { headers } from 'next/headers';
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = visitorLocale(await requestLocale);
  const messages = locale === 'ar' ? ar : en;
  const publicDiscovery =
    (await headers()).get('x-capstone-public-discovery') === '1';
  return {
    locale,
    messages: publicDiscovery
      ? {
          Shell: messages.Shell,
          Archive: messages.Archive,
          NativeFiles: Object.fromEntries(
            Object.entries(messages.NativeFiles).filter(
              ([key]) =>
                ![
                  'private',
                  'uploader',
                  'uploadedAt',
                  'faculty',
                  'author',
                  'frozen',
                ].includes(key),
            ),
          ),
        }
      : messages,
    timeZone: 'Asia/Riyadh',
  };
});
