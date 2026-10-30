'use client';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  chooseAppearance,
  useAppearancePreference,
} from '../shared-appearance';
import { usePublicPortal } from './scope';
export function PublicAppearance({ locale }: { locale: 'en' | 'ar' }) {
  const preference = useAppearancePreference(),
    portal = usePublicPortal(),
    ar = locale === 'ar';
  const Icon =
    preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu dir={ar ? 'rtl' : 'ltr'}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-lg"
          aria-label={ar ? 'المظهر' : 'Appearance'}
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent {...portal} align="end" sideOffset={8}>
        <DropdownMenuLabel>{ar ? 'المظهر' : 'Appearance'}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => {
            if (value === 'light' || value === 'dark' || value === 'system')
              chooseAppearance(value);
          }}
        >
          {(['light', 'dark', 'system'] as const).map((value, i) => (
            <DropdownMenuRadioItem value={value} key={value}>
              {
                (ar ? ['فاتح', 'داكن', 'النظام'] : ['Light', 'Dark', 'System'])[
                  i
                ]
              }
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
