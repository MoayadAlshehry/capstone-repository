import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

if (
  process.env['APP_ENV'] === 'production' &&
  process.env['LOCAL_PROVISIONING'] === 'true'
)
  throw Error('Local provisioning is forbidden in server profile');

const config: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@capstone/config', '@capstone/domain', '@capstone/ui'],
  // Bound build workers on the shared release host; this does not change runtime request concurrency.
  experimental: {
    proxyClientMaxBodySize: 6_000_000,
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  async rewrites() {
    // Next's dev runner does not use server.mjs. Production uses the bounded
    // runtime proxy so the reviewed artifact can move between owned ports.
    return process.env.NODE_ENV === 'development'
      ? [
          {
            source: '/files/:path*',
            destination:
              (process.env.UPLOAD_INTERNAL_URL ?? 'http://127.0.0.1:3001') +
              '/files/:path*',
          },
        ]
      : [];
  },
  async headers() {
    return [
      {
        source:
          '/:locale(en|ar)/:entry(login|forgot-password|request-setup|setup-account|reset-password|activate)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/:locale(en|ar)/:identity(account|workspace)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};
export default createNextIntlPlugin('./i18n/request.ts')(config);
