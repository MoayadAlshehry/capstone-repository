'use client';
// Approved R3 customized shadcn/ui presentation (MIT); behavior uses pinned workspace Radix.
import { createContext, useContext } from 'react';
export const UiLocale = createContext<'en' | 'ar'>('en');
export function UiCloseText() {
  const lang = useContext(UiLocale);
  return <span lang={lang}>{lang === 'ar' ? 'إغلاق' : 'Close'}</span>;
}
