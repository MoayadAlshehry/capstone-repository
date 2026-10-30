import type { PublicationProjection } from '@capstone/domain';
import type { NativePreview } from '@capstone/domain';
import type { VisualImageView } from '@capstone/ui/visual-media';
export type Locale = 'en' | 'ar';
export function domainLabel(domain: string, locale: Locale) {
  return (
    (locale === 'ar'
      ? { software: 'برمجيات', data: 'بيانات', hardware: 'عتاد' }
      : { software: 'Software', data: 'Data', hardware: 'Hardware' })[
      domain as 'software' | 'data' | 'hardware'
    ] ?? domain
  );
}
export interface PublicFileItem {
  uploadedLicense?: boolean;
  id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
}
export type Project = PublicationProjection & {
  publicCover?: VisualImageView | null;
};
export type PublicPreview = Omit<NativePreview, 'meta'> & {
  meta: PublicFileItem & { extension: string };
};
/** Public source canvases are white / #18252c. Retain syntax hues while lifting
 * only insufficient contrast; source text and the workspace themes are intact. */
export function readableCodeColor(hex: string, dark: boolean) {
  const bg = dark ? [24, 37, 44] : [255, 255, 255],
    raw = /^#[a-f\d]{6}([a-f\d]{2})?$/i.test(hex) ? hex : '#808080',
    alpha = raw.length === 9 ? parseInt(raw.slice(7), 16) / 255 : 1;
  const source = [1, 3, 5].map((n, i) =>
    Math.round(
      parseInt(raw.slice(n, n + 2), 16) * alpha + bg[i]! * (1 - alpha),
    ),
  );
  const luminance = (rgb: number[]) =>
      rgb.reduce((sum, v, i) => {
        const x = v / 255;
        return (
          sum +
          (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) *
            [0.2126, 0.7152, 0.0722][i]!
        );
      }, 0),
    background = luminance(bg);
  for (let amount = 0; amount <= 100; amount++) {
    const rgb = source.map((v) =>
        Math.round(v + (((dark ? 255 : 0) - v) * amount) / 100),
      ),
      l = luminance(rgb);
    if (
      (Math.max(l, background) + 0.05) / (Math.min(l, background) + 0.05) >=
      4.55
    )
      return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  return dark ? '#ffffff' : '#000000';
}
export function readableCodeTokens(tokens: NativePreview['tokens']) {
  return tokens?.map((line) =>
    line.map((token) => ({
      ...token,
      light: readableCodeColor(token.light, false),
      dark: readableCodeColor(token.dark, true),
    })),
  );
}
export function byteSize(bytes: number, locale: Locale) {
  const units =
    locale === 'ar'
      ? ['بايت', 'كيلوبايت', 'ميغابايت', 'غيغابايت']
      : ['B', 'KB', 'MB', 'GB'];
  let amount = bytes,
    i = 0;
  while (amount >= 1000 && i < 3) {
    amount /= 1000;
    i++;
  }
  if (i && i < 3 && Math.round(amount * 10) / 10 >= 1000) {
    amount /= 1000;
    i++;
  }
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: i ? 1 : 0 }).format(
      amount,
    ) +
    ' ' +
    units[i]
  );
}
export function projectPath(locale: Locale, project: string) {
  return `/${locale}/catalogue/${encodeURIComponent(project)}`;
}
export function fileSharePath(locale: Locale, project: string, file: string) {
  return (
    projectPath(locale, project) +
    '?' +
    new URLSearchParams({ file }) +
    '#public-files'
  );
}
export function defaultFile(files: PublicFileItem[]) {
  const supported = files
    .filter((f) => !/\.(docx|pptx)$/i.test(f.name))
    .sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : a.id.localeCompare(b.id),
    );
  return supported.find((f) => /^readme\.md$/i.test(f.path)) ?? supported[0];
}
export function fileEntries(
  files: PublicFileItem[],
  folder: string,
  search: string,
) {
  const q = search.normalize('NFC').toLocaleLowerCase(),
    prefix = folder ? folder + '/' : '';
  const shown = files.filter((f) =>
    q
      ? f.path.normalize('NFC').toLocaleLowerCase().includes(q)
      : f.path.slice(0, f.path.lastIndexOf('/') + 1) === prefix,
  );
  const folders = q
    ? []
    : [
        ...new Set(
          files
            .filter(
              (f) =>
                f.path.startsWith(prefix) &&
                f.path.slice(prefix.length).includes('/'),
            )
            .map((f) => prefix + f.path.slice(prefix.length).split('/')[0]),
        ),
      ].sort();
  return { files: shown.sort((a, b) => a.path.localeCompare(b.path)), folders };
}
export function independentState(p: Project) {
  const s = p.evaluation;
  return !s
    ? 'unavailable'
    : s.external && s.n >= 2
      ? 'released'
      : s.n === 0
        ? 'none'
        : 'incomplete';
}
