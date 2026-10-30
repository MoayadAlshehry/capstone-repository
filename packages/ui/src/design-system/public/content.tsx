'use client';
import { useSite } from './model.js';
import { Arrow, Logo, Browse, FictionalNotice } from './primitives.js';
export function Directory({
  topics = ['Accessibility', 'Research', 'Hardware', 'Software'],
}: {
  topics?: string[];
}) {
  const { t, href, ar, topicCounts, integration } = useSite();
  return (
    <div className="topic-directory">
      {topics
        .filter(
          (topic) =>
            !integration?.literalMetadata ||
            integration.busy ||
            (topicCounts[topic] ?? 0) > 0,
        )
        .map((topic) => (
          <a key={topic} href={href('catalogue', undefined, { topic })}>
            <strong>{t(topic)}</strong>
            <span>
              {integration?.busy
                ? '…'
                : new Intl.NumberFormat(ar ? 'ar-SA-u-nu-arab' : 'en').format(
                    topicCounts[topic] ?? 0,
                  )}{' '}
              <Arrow />
            </span>
          </a>
        ))}
    </div>
  );
}
export function Missing() {
  const { t, missingProjectMessage } = useSite();
  return (
    <main id="main" tabIndex={-1} className="wrap missing-record">
      <Logo />
      <h1 dir="auto">{t('Project not found')}</h1>
      <p dir="auto">{missingProjectMessage}</p>
      <Browse />
      <FictionalNotice />
    </main>
  );
}
