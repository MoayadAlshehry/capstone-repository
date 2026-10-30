import { describe, it, expect } from 'vitest';
import {
  nativeRange,
  nativeTree,
  previewFamily,
  safeMarkdownUrl,
  type NativeFile,
} from './native-files.js';
describe('internal preview constraints', () => {
  it.each([
    ['bytes=0-0', 10, { start: 0, end: 0, length: 1 }],
    ['bytes=2-', 10, { start: 2, end: 9, length: 8 }],
    ['bytes=-3', 10, { start: 7, end: 9, length: 3 }],
    ['bytes=-30', 10, { start: 0, end: 9, length: 10 }],
    ['bytes=0-99', 10, { start: 0, end: 9, length: 10 }],
  ])('bounds range %s', (value, size, expected) =>
    expect(nativeRange(value as string, size as number)).toEqual(expected),
  );
  it.each([
    'bytes=10-',
    'bytes=9-2',
    'bytes=-0',
    'bytes=0-1,4-5',
    'bytes=',
    'bytes=9007199254740992-',
    'bytes=0-1e3',
    'items=0-1',
    'bytes=+1-2',
  ])('rejects unsafe range %s', (value) =>
    expect(() => nativeRange(value, 10)).toThrow('INVALID_RANGE'),
  );
  it('rejects ranges on empty data', () =>
    expect(() => nativeRange('bytes=0-', 0)).toThrow());
  it('dispatches from stored MIME and extension together', () => {
    expect(previewFamily({ extension: 'html', mime: 'text/plain' })).toBe(
      'source',
    );
    expect(previewFamily({ extension: 'pdf', mime: 'text/plain' })).toBe(
      'source',
    );
    expect(previewFamily({ extension: 'svg', mime: 'image/svg+xml' })).toBe(
      'unsupported',
    );
    expect(previewFamily({ extension: 'docx', mime: 'application/zip' })).toBe(
      'unsupported',
    );
  });
  it.each([
    'javascript:alert(1)',
    ' JAVASCRIPT:alert(1)',
    'data:text/html,x',
    '//remote.example/pixel',
    'file:///secret',
    'blob:foo',
    'https://site.example/\nx',
  ])('blocks unsafe or automatic-resource URL %s', (value) =>
    expect(safeMarkdownUrl(value)).toBe(''),
  );
  it('retains explicit safe links', () => {
    expect(safeMarkdownUrl('https://example.invalid/docs')).toBe(
      'https://example.invalid/docs',
    );
    expect(safeMarkdownUrl('#section')).toBe('#section');
  });
  it('keeps separate logical file/folder entries and stable names', () => {
    const file = (path: string) => ({ path, id: path }) as NativeFile,
      tree = nativeTree([
        file('README'),
        file('README/nested.ts'),
        file('src/ملف.ts'),
        file('a.ts'),
      ]);
    expect(tree.map((n) => [n.name, !!n.file])).toEqual([
      ['README', false],
      ['src', false],
      ['README', true],
      ['a.ts', true],
    ]);
    expect(tree[0]?.children[0]?.file?.path).toBe('README/nested.ts');
  });
});
