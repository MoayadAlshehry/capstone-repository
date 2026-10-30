'use client';
import { BookOpen, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCopy, useR3 } from './shared.js';
import { PublicHeader, PublicFooter, PublicBack } from './public.js';
export interface IdentityContext {
  id: string;
  path: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
}
export function IdentityEntryView({
  purpose,
  children,
}: {
  purpose: 'login' | 'activation' | 'reset' | 'partner';
  children: ReactNode;
}) {
  const { locale } = useR3();
  const { t } = useCopy();
  const titles = {
    login: ['Sign in', 'تسجيل الدخول'],
    activation: ['Set up your account', 'إعداد حسابك'],
    reset: ['Reset your password', 'إعادة تعيين كلمة المرور'],
    partner: ['Become a partner', 'الانضمام كشريك'],
  } as const;
  return (
    <>
      <PublicHeader />
      <main id="r3-main" tabIndex={-1} className="identity-convention">
        <aside className="identity-art">
          <BookOpen size={54} aria-hidden="true" />
          <h2 dir="auto">
            {t('Academic work, connected.', 'عمل أكاديمي مترابط.')}
          </h2>
          <p dir="auto">
            {t(
              'One individual account. The workspace appropriate to your role.',
              'حساب فردي واحد ومساحة العمل المناسبة لدورك.',
            )}
          </p>
          <a href={`/${locale}/catalogue`}>
            {t('Explore published work', 'استكشف الأعمال المنشورة')}
            <ArrowUpRight size={18} />
          </a>
        </aside>
        <section className="identity-entry">
          <span className="section-kicker">
            {t('Account access', 'الوصول إلى الحساب')}
          </span>
          <h1 dir="auto" tabIndex={-1}>
            {t(titles[purpose][0], titles[purpose][1])}
          </h1>
          {children}
          <div className="identity-options">
            {purpose === 'login' ? (
              <>
                <a href={`/${locale}/activate`}>
                  {t('Activate a managed account', 'تفعيل حساب مُدار')}
                  <ArrowUpRight size={17} />
                </a>
                <a href={`/${locale}/reset-password`}>
                  {t(
                    'Use an institution-issued reset credential',
                    'استخدام بيانات إعادة تعيين صادرة عن المؤسسة',
                  )}
                  <ArrowUpRight size={17} />
                </a>
                <a href={`/${locale}/partner/register`}>
                  {t('Register a partner account', 'تسجيل حساب شريك')}
                  <ArrowUpRight size={17} />
                </a>
              </>
            ) : (
              <a href={`/${locale}/login`}>
                {t('Sign in', 'تسجيل الدخول')}
                <ArrowUpRight size={17} />
              </a>
            )}
          </div>
          <PublicBack
            href={'/' + locale}
            label={['Back to the library', 'العودة إلى المكتبة']}
          />
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
