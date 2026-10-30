'use client';
import { createContext, useContext } from 'react';
import type { AILocale, AIPanelKind } from './types';
export const OfficialContext = createContext<{
  locale: AILocale;
  kind: AIPanelKind;
}>({ locale: 'en', kind: 'ask' });
const ar: Record<string, string> = {
  'Search threads': 'البحث في المحادثات',
  'No threads found': 'لم يُعثر على محادثات',
  'Loading threads': 'جارٍ تحميل المحادثات',
  'Rename thread': 'إعادة تسمية المحادثة',
  'More options': 'خيارات إضافية',
  Rename: 'إعادة التسمية',
  Archive: 'أرشفة',
  Delete: 'حذف',
  'New Thread': 'محادثة جديدة',
  'New Chat': 'محادثة جديدة',
  Today: 'اليوم',
  Yesterday: 'أمس',
  Earlier: 'سابقًا',
  Stopped: 'أُوقفت الإجابة',

  Source: 'المصدر',
  'Open source': 'فتح المصدر',
  'Export as Markdown': 'تصدير بصيغة Markdown',
  Send: 'إرسال',
  'Send message': 'إرسال الرسالة',
  'Stop generating': 'إيقاف الإجابة',
  'Cancel sending': 'إلغاء الإرسال',
  Copy: 'نسخ',
  Copied: 'نُسخ',
  Helpful: 'مفيدة',
  'Not helpful': 'غير مفيدة',
  Refresh: 'إعادة المحاولة',
  More: 'المزيد',
  Edit: 'تعديل',
  'Scroll to bottom': 'الانتقال إلى أحدث إجابة',
  Previous: 'السابق',
  Next: 'التالي',
  'Message input': 'اكتب رسالتك',
  'Send a message...': 'اكتب رسالة…',
  Retry: 'إعادة المحاولة',
  Retrying: 'جارٍ إعادة المحاولة',
  Sources: 'المصادر',
  'Loading conversation': 'جارٍ تحميل المحادثة',
  'Assistant is working': 'المساعد يعمل',
  'Resume generating': 'استئناف الإجابة',
};
export function useOfficialText() {
  const { locale } = useContext(OfficialContext);
  return (text: string) => (locale === 'ar' ? (ar[text] ?? text) : text);
}
