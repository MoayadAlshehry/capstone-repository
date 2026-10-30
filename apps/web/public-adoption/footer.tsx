'use client';
import Link from 'next/link';
import { Home, Library, Info, LogIn, ArrowRight } from 'lucide-react';
import { BrandLogo } from '@capstone/ui/brand-logo';
import { DemoNotice } from '../demo-environment';
import { Button } from '@/components/ui/button';
import { StudioFooter } from '@/components/shadcn-studio/footer-component-01';
export function PublicFooter({
  locale,
  authenticated,
}: {
  locale: 'en' | 'ar';
  authenticated: boolean;
}) {
  const ar = locale === 'ar',
    dir = ar ? 'rtl' : 'ltr',
    l = (en: string, arText: string) => (ar ? arText : en),
    links = [
      ['', l('Home', 'الرئيسية')],
      ['/catalogue', l('Explore projects', 'استكشف المشاريع')],
      ['/about', l('About the platform', 'عن المنصة')],
      [
        authenticated ? '/workspace' : '/login',
        authenticated
          ? l('My workspace', 'مساحة عملي')
          : l('Sign in', 'تسجيل الدخول'),
      ],
    ];
  return (
    <StudioFooter
      identity={
        <div className="ps-footer-identity">
          <Link
            href={'/' + locale}
            className="ps-footer-brand"
            aria-label={l(
              'Capstone Repository - Home',
              'مستودع مشاريع التخرج - الرئيسية',
            )}
          >
            <BrandLogo decorative label="Capstone Repository" />
          </Link>
          <p dir={dir}>
            {l(
              'Discover published university projects, their authors and the original files they share.',
              'اكتشف مشاريع التخرج المنشورة، وتعرّف إلى مؤلفيها واطّلع على ملفاتهم الأصلية المتاحة للعامة.',
            )}
          </p>
        </div>
      }
      navigation={
        <nav
          className="ps-footer-navigation"
          aria-label={l('Footer navigation', 'التنقل في التذييل')}
        >
          <span className="ps-footer-nav-title" dir={dir}>
            {l('Explore the repository', 'استكشف المستودع')}
          </span>
          <ul>
            {links.map(([path, label], index) => {
              const Icon = [Home, Library, Info, LogIn][index]!;
              return (
                <li key={path}>
                  <Button asChild variant="ghost" className="ps-footer-link">
                    <Link href={'/' + locale + path} dir={dir}>
                      <Icon size={16} aria-hidden="true" />
                      <span>{label}</span>
                      <ArrowRight
                        className="ps-footer-arrow"
                        size={16}
                        aria-hidden="true"
                      />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </nav>
      }
      notes={
        <>
          <p className="ps-rights" dir={dir}>
            {l(
              'Public files are open to read. Reuse remains subject to the authors’ rights.',
              'الملفات العامة متاحة للاطلاع. وتبقى إعادة استخدامها خاضعة لحقوق المؤلفين.',
            )}
          </p>
          <DemoNotice locale={locale} />
        </>
      }
    />
  );
}
