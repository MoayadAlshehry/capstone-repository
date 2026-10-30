import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  themeInitialization,
  effectiveAppearance,
  resolveAppearance,
  resolveTheme,
} from './theme.js';
describe('one application appearance preference', () => {
  it('preserves existing explicit values and safe light fallback', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveAppearance('light')).toBe('light');
    expect(resolveAppearance('dark')).toBe('dark');
    for (const value of [null, undefined, 'unexpected', {}, 42])
      expect(resolveAppearance(value)).toBe('light');
  });
  it('follows OS only for the explicit system preference', () => {
    expect(resolveAppearance('system')).toBe('system');
    expect(effectiveAppearance('system', true)).toBe('dark');
    expect(effectiveAppearance('system', false)).toBe('light');
    expect(effectiveAppearance('light', true)).toBe('light');
    expect(effectiveAppearance('dark', false)).toBe('dark');
  });
});

it('applies system preference before paint and follows later OS changes without overriding explicit choices', () => {
  const root = {
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
  };
  let changed = () => {};
  const media = {
    matches: true,
    addEventListener: (_type: string, listener: () => void) => {
      changed = listener;
    },
  };
  runInNewContext(themeInitialization, {
    document: { documentElement: root },
    window: { matchMedia: () => media },
    localStorage: { getItem: () => 'system' },
  });
  expect(root.dataset.theme).toBe('dark');
  expect(root.dataset.appearance).toBe('system');
  expect(root.style.colorScheme).toBe('dark');
  media.matches = false;
  changed();
  expect(root.dataset.theme).toBe('light');
  root.dataset.appearance = 'dark';
  root.dataset.theme = 'dark';
  media.matches = false;
  changed();
  expect(root.dataset.theme).toBe('dark');
});
it('commits palette pairs together and releases the short transition boundary after painting', () => {
  const frames: (() => void)[] = [],
    root = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
      getBoundingClientRect: () => ({}),
    };
  runInNewContext(themeInitialization, {
    document: { documentElement: root },
    window: {
      matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    },
    localStorage: { getItem: () => 'system' },
    requestAnimationFrame: (callback: () => void) => {
      frames.push(callback);
      return frames.length;
    },
  });
  expect(root.dataset.theme).toBe('dark');
  expect(root.dataset.crPaletteSync).toBe('true');
  frames.shift()!();
  expect(root.dataset.crPaletteSync).toBe('true');
  frames.shift()!();
  expect(root.dataset.crPaletteSync).toBeUndefined();
});
