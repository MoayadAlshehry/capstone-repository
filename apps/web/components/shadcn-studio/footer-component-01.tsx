import type { ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
// Adapted from the publicly accessible Shadcn Studio new-york-v4
// footer-component-01 registry source (retrieved 2026-10-24).
// Product slots preserve existing branding, navigation and truthful lower notes.
// Unused template social links, example branding and copyright are omitted.
export function StudioFooter({
  identity,
  navigation,
  notes,
}: {
  identity: ReactNode;
  navigation: ReactNode;
  notes: ReactNode;
}) {
  return (
    <footer className="ps-footer-band" dir="ltr">
      <div className="mx-auto max-w-7xl ps-footer wrap">
        <div className="flex items-start justify-between gap-6 max-md:flex-col ps-footer-main">
          {identity}
          {navigation}
        </div>
        <Separator className="mt-8" />
        <div className="ps-footer-notes">{notes}</div>
      </div>
    </footer>
  );
}
