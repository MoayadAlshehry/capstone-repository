'use client';
import { ArrowLeft } from 'lucide-react';
import { Brand, Tools, useCopy, useR3 } from './shared.js';
export function PublicHeader() {
  const { locale, workspaceHref, reference, localeError } = useR3();
  const { t } = useCopy();
  return (
    <>
      <header className="library-header">
        <Brand />
        <a className="library-nav" href={'/' + locale + '/catalogue'}>
          {t('Discover', 'استكشف')}
        </a>
        <div className="public-identity-entry">
          {!reference && (
            <a
              className="public-entry-action"
              href={workspaceHref || '/' + locale + '/login'}
            >
              {t(
                workspaceHref ? 'My workspace' : 'Sign in',
                workspaceHref ? 'مساحة عملي' : 'تسجيل الدخول',
              )}
            </a>
          )}
          <Tools />
        </div>
      </header>
      {localeError && (
        <p
          className="r3-locale-error"
          role="alert"
          lang={locale}
          dir={locale === 'ar' ? 'rtl' : 'ltr'}
        >
          {localeError}
        </p>
      )}
    </>
  );
}
export function PublicFooter() {
  const { t } = useCopy();
  return (
    <footer className="library-footer">
      <Brand compact />
      <span>
        {t(
          'Read the original work. Respect its authors and access conditions.',
          'اقرأ العمل الأصلي واحترم مؤلفيه وشروط الوصول إليه.',
        )}
      </span>
    </footer>
  );
}
export function PublicBack({
  href,
  label,
}: {
  href: string;
  label?: [string, string];
}) {
  const { t } = useCopy();
  return (
    <a className="public-back" href={href}>
      <ArrowLeft size={17} />
      {t(...(label || ['Back to discovery', 'العودة إلى الاستكشاف']))}
    </a>
  );
}
