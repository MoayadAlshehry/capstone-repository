'use client';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  const ar = useParams().locale === 'ar',
    router = useRouter();
  return (
    <main id="main" className="wrap p3-error">
      <Alert variant="destructive">
        <AlertTitle>
          <h1 dir="auto">
            {ar ? 'تعذر تحميل الصفحة' : 'This page could not be loaded'}
          </h1>
        </AlertTitle>
        <AlertDescription>
          <p dir="auto">
            {ar
              ? 'تحقق من الاتصال وحاول مجددًا.'
              : 'Check the connection and try again.'}
          </p>
        </AlertDescription>
      </Alert>
      <Button
        className="mt-6"
        onClick={() => {
          router.refresh();
          reset();
        }}
      >
        {ar ? 'إعادة المحاولة' : 'Retry'}
      </Button>
    </main>
  );
}
