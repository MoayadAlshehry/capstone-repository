'use client';
import { useId } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { usePublicPortal } from '../public-ui/scope';
export function CatalogueSort({
  locale,
  value,
  busy,
  relevanceAvailable = false,
  onChange,
}: {
  locale: 'en' | 'ar';
  value: string;
  busy: boolean;
  relevanceAvailable?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    portal = usePublicPortal(),
    l = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <div className="public-sort-control" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <span className="public-sort-label" id={id + '-label'}>
        {l('Sort by', 'الترتيب حسب')}
      </span>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={busy}
        dir={locale === 'ar' ? 'rtl' : 'ltr'}
      >
        <SelectTrigger
          className="w-48"
          aria-busy={busy}
          aria-labelledby={id + '-label'}
        >
          <SelectValue />
          {busy && <Spinner />}
        </SelectTrigger>
        <SelectContent
          {...portal}
          aria-label={l('Sort options', 'خيارات الترتيب')}
          position="popper"
          align={locale === 'ar' ? 'start' : 'end'}
          sideOffset={8}
          collisionPadding={12}
        >
          {relevanceAvailable && (
            <SelectItem value="relevance">{l('Relevance', 'الصلة')}</SelectItem>
          )}
          <SelectItem value="newest">
            {l('Newest first', 'الأحدث أولًا')}
          </SelectItem>
          <SelectItem value="highest">
            {l('Highest rated', 'الأعلى تقييمًا')}
          </SelectItem>
          <SelectItem value="popular">
            {l('Most popular', 'الأكثر رواجًا')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
