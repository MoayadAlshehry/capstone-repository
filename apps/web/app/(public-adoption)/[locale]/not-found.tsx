'use client';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
export default function Missing() {
  const ar = useLocale() === 'ar';
  return (
    <main id="main" className="wrap p3-error">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>
            <h1 dir="auto">{ar ? 'السجل غير متاح' : 'Record unavailable'}</h1>
          </EmptyTitle>
          <EmptyDescription dir="auto">
            {ar
              ? 'هذا السجل غير منشور أو غير متاح للجمهور.'
              : 'This record is not published or available to the public.'}
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <a href={`/${ar ? 'ar' : 'en'}/catalogue`}>
            {ar ? 'المشاريع المنشورة' : 'Published projects'}
          </a>
        </Button>
      </Empty>
    </main>
  );
}
