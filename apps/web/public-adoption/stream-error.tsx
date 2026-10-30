'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
export function StreamError({
  part,
  locale,
}: {
  part: string;
  locale: 'en' | 'ar';
}) {
  const router = useRouter(),
    ar = locale === 'ar';
  if (part === 'pagination' || part === 'projectActions') return null;
  if (part === 'resultCount')
    return <span>{ar ? 'النتائج غير متاحة' : 'Results unavailable'}</span>;
  const main = ['featured', 'results', 'reader'].includes(part);
  return (
    <Alert variant="destructive" role={main ? 'alert' : 'status'}>
      <AlertDescription>
        <p dir="auto">
          {ar
            ? 'تعذر تحميل هذا الجزء من الأرشيف العام.'
            : 'This part of the public archive could not be loaded.'}
        </p>
        {main && (
          <Button variant="outline" onClick={() => router.refresh()}>
            {ar ? 'إعادة المحاولة' : 'Retry'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
