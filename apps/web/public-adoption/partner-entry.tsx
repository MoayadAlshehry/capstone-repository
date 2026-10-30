'use client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartnerRegistrationForm } from '../auth/public-partner-form';
import { PublicShell } from './shell';
export function PublicPartnerEntry({
  locale,
  authenticated,
  returnTo,
}: {
  locale: 'en' | 'ar';
  authenticated: boolean;
  returnTo: string;
}) {
  const l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <PublicShell
      locale={locale}
      authenticated={authenticated}
      entryReturnTo={returnTo}
    >
      <main id="main" tabIndex={-1} className="wrap ps-partner">
        <aside>
          <h2 dir="auto">
            {l(
              'Request access as an individual partner',
              'الوصول بصفتك شريكًا فرديًا',
            )}
          </h2>
          <p dir="auto">
            {l(
              'Explore public projects without an account. Partner eligibility is reviewed separately from permission to read restricted files.',
              'يمكنك استكشاف المشاريع العامة دون حساب. تُراجع أهلية الشريك بصورة مستقلة عن الإذن بقراءة الملفات المقيّدة.',
            )}
          </p>
          <Button asChild variant="outline" className="w-fit">
            <a href={`/${locale}/catalogue`}>
              {l('Explore projects', 'استكشف المشاريع')} ↗
            </a>
          </Button>
        </aside>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 dir="auto">
                {l('Create a partner account', 'إنشاء حساب شريك')}
              </h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PartnerRegistrationForm returnTo={returnTo} />
          </CardContent>
        </Card>
      </main>
    </PublicShell>
  );
}
