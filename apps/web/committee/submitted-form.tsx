import { formatScore } from '@capstone/ui/score-format';
import Link from 'next/link';
export interface SubmittedPayload {
  criteria: {
    code: string;
    level: number;
    comment: string;
    locators: { file: string; kind: string; reference: string }[];
  }[];
  overall: string;
}
export function SubmittedMemberForm({
  locale,
  submission,
  payload,
  total,
  from,
}: {
  locale: 'en' | 'ar';
  submission: string;
  payload: SubmittedPayload;
  total: number;
  from: string;
}) {
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  return (
    <details
      className="committee-submitted-form"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <summary>
        {t(
          'Read finalized individual assessment',
          'قراءة التقييم الفردي المكتمل',
        )}{' '}
        · <bdi dir="ltr">{formatScore(total, locale)} / 100</bdi>
      </summary>
      <p dir="auto">
        {t(
          'Finalized member evidence and comments. Drafts and verification secrets are never shared.',
          'أدلة العضو وتعليقاته النهائية. لا تُشارك المسودات أو أسرار التوثيق.',
        )}
      </p>
      <ol>
        {payload.criteria.map((c) => (
          <li key={c.code}>
            <h3 dir="auto">
              {c.code} · {c.level} / 4
            </h3>
            <p dir="auto">{c.comment}</p>
            <ul>
              {c.locators.map((l, i) => (
                <li key={i}>
                  <Link
                    href={`/${locale}/submissions/${submission}?file=${encodeURIComponent(l.file)}&from=${encodeURIComponent(from)}`}
                  >
                    <bdi dir="auto">{l.reference}</bdi>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <h3 dir="auto">{t('Overall assessment', 'التقييم العام')}</h3>
      <p dir="auto">{payload.overall}</p>
    </details>
  );
}
