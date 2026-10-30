import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssessmentCriterionPanel } from './assessment.js';

const properties = {
  locale: 'en' as const,
  criteria: [
    {
      key: 'C1',
      title: 'Criterion one',
      weight: 100,
      intent: 'Read and assess the evidence.',
      anchors: [0, 1, 2, 3, 4].map((level) => ({
        level: level as 0 | 1 | 2 | 3 | 4,
        label: 'Level ' + level,
        detail: 'Evidence guidance ' + level,
      })),
    },
  ],
  values: [{ level: null, note: '' }],
  index: 0,
  onCriterionChange: () => {},
  onChoose: () => {},
  onNote: () => {},
  disabled: false,
  onReview: () => {},
  reviewDisabled: false,
  readiness: 'Review the entered scores.',
};
it('keeps supported private-draft saving available for the current assessment adapters', () => {
  const html = renderToStaticMarkup(
    <AssessmentCriterionPanel {...properties} onSave={() => {}} saveDisabled />,
  );
  expect(html).toContain('Save draft');
  expect(html).toContain('disabled=""');
  expect(html).toContain('Brief note (optional)');
});
it('omits unsupported draft saving in an append-only correction and names its actual justification field', () => {
  const html = renderToStaticMarkup(
    <AssessmentCriterionPanel
      {...properties}
      noteLabel="Criterion justification"
    />,
  );
  expect(html).not.toContain('Save draft');
  expect(html).toContain('Review assessment');
  expect(html).toContain('Criterion justification');
  expect(html).toContain('>Unselected<');
});
