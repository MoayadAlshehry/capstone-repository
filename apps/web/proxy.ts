import createMiddleware from 'next-intl/middleware';
import { NextResponse, NextRequest } from 'next/server';
import { routing, visitorLocale } from './i18n/routing';
const localize = createMiddleware(routing);
export default async function proxy(request: NextRequest) {
  if (
    /^\/(en|ar)\/(?:admin\/university\/import|projects\/[a-f0-9-]{36}\/sharing\/license)(?:\/|$)/i.test(
      request.nextUrl.pathname,
    )
  )
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  if (request.nextUrl.pathname === '/') {
    const url = request.nextUrl.clone();
    let preferred = visitorLocale(
      request.cookies.get('capstone.locale')?.value,
    );
    if (request.headers.get('cookie'))
      try {
        const response = await fetch(
          new URL('/api/auth/get-session', request.url),
          {
            headers: { Cookie: request.headers.get('cookie')! },
            cache: 'no-store',
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            user?: { locale?: string };
          };
          preferred = visitorLocale(data.user?.locale);
        }
      } catch {
        /* visitor preference remains available while authentication is unavailable */
      }
    url.pathname = '/' + preferred;
    const response = NextResponse.redirect(url);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const forwarded = new Headers(request.headers);
  forwarded.set(
    'x-capstone-workspace-path',
    request.nextUrl.pathname + request.nextUrl.search,
  );
  forwarded.set(
    'x-capstone-public-discovery',
    /^\/(en|ar)(?:\/?$|\/catalogue(?:\/|$))/.test(request.nextUrl.pathname)
      ? '1'
      : '0',
  );
  const response = localize(new NextRequest(request, { headers: forwarded })),
    locale = request.nextUrl.pathname.split('/')[1];
  if (locale === 'en' || locale === 'ar')
    response.cookies.set('capstone.locale', locale, {
      sameSite: 'lax',
      path: '/',
      maxAge: 31536000,
      secure: request.nextUrl.protocol === 'https:',
    });
  return response;
}
export const config = { matcher: ['/', '/(en|ar)/:path*'] };
