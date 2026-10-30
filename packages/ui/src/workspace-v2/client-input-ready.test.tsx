import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Input } from './input.js';
import { Textarea } from './textarea.js';

it('protects controlled and registered fields before their actual client handlers can retain edits', () => {
  const untouched = () => {
    throw Error('SSR must not invoke an input handler');
  };
  for (const field of [
    <Input
      aria-label="Controlled title"
      value="Original title"
      onChange={untouched}
    />,
    <Input aria-label="Registered name" defaultValue="" onChange={untouched} />,
    <Input aria-label="Native input callback" onInput={untouched} />,
    <Textarea
      aria-label="Qualification"
      value="Original qualification"
      onChange={untouched}
    />,
  ])
    expect(renderToStaticMarkup(field)).toContain('disabled=""');
});

it('preserves native form enhancement and explicitly disabled prerequisites', () => {
  const native = renderToStaticMarkup(
    <Input type="search" name="q" defaultValue="Native query" />,
  );
  expect(native).not.toContain('disabled=""');
  expect(native).toContain('value="Native query"');
  expect(
    renderToStaticMarkup(
      <Input disabled defaultValue="Prerequisite not satisfied" />,
    ),
  ).toContain('disabled=""');
  expect(
    renderToStaticMarkup(<Textarea defaultValue="Native text" />),
  ).not.toContain('disabled=""');
});

it('inherits the readable semantic foreground while preserving explicit caller colors', () => {
  for (const Field of [Input, Textarea]) {
    expect(
      renderToStaticMarkup(<Field defaultValue="Readable current value" />),
    ).toContain('text-inherit');
    const styled = renderToStaticMarkup(
      <Field className="text-red-500" style={{ color: '#123456' }} />,
    );
    expect(styled).toContain('text-red-500');
    expect(styled).not.toContain('text-inherit');
    expect(styled).toContain('color:#123456');
  }
});
