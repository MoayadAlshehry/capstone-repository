export type Theme = 'light' | 'dark';
export type AppearancePreference = Theme | 'system';
export const themeStorageKey = 'capstone.ui.theme.v1';
export function resolveTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light';
}
export function resolveAppearance(value: unknown): AppearancePreference {
  return value === 'system' ? 'system' : resolveTheme(value);
}
export function effectiveAppearance(
  preference: AppearancePreference,
  systemDark: boolean,
): Theme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
/** Commit semantic foreground/background pairs in one paint, without independently tweening either color. */
function paintAppearance(
  root: HTMLElement,
  preference: AppearancePreference,
  theme: Theme,
) {
  const batch =
    typeof requestAnimationFrame === 'function' &&
    typeof root.getBoundingClientRect === 'function';
  if (batch) {
    root.dataset.crPaletteSync = 'true';
    root.getBoundingClientRect();
  }
  root.dataset.appearance = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  if (batch) {
    root.getBoundingClientRect();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        delete root.dataset.crPaletteSync;
      }),
    );
  }
}
/** Apply the one existing application preference. No account or private data is stored. */
export function applyAppearance(preference: AppearancePreference) {
  const next = resolveAppearance(preference),
    root = document.documentElement;
  const theme = effectiveAppearance(
    next,
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  try {
    localStorage.setItem(themeStorageKey, next);
  } catch {
    /* Explicit choice still works. */
  }
  paintAppearance(root, next, theme);
}
// Keep the pre-paint program literal: independently minified middleware/render bundles must hash identical CSP bytes.
const palettePainting = `function(root,preference,theme){const batch=typeof requestAnimationFrame==='function'&&typeof root.getBoundingClientRect==='function';if(batch){root.dataset.crPaletteSync='true';root.getBoundingClientRect()}root.dataset.appearance=preference;root.dataset.theme=theme;root.style.colorScheme=theme;if(batch){root.getBoundingClientRect();requestAnimationFrame(()=>requestAnimationFrame(()=>{delete root.dataset.crPaletteSync}))}}`;
/** Runs before body paint; explicit historic light/dark choices and storage denial remain supported. */
export const themeInitialization = `(()=>{const paint=${palettePainting};const root=document.documentElement,media=typeof window!=='undefined'&&typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null;let preference='light';try{const saved=localStorage.getItem('${themeStorageKey}');if(saved==='dark'||saved==='system')preference=saved}catch{}function apply(){const theme=preference==='system'?(media?.matches?'dark':'light'):preference;paint(root,preference,theme)}apply();media?.addEventListener('change',()=>{preference=root.dataset.appearance==='system'?'system':root.dataset.theme==='dark'?'dark':'light';if(preference==='system')apply()})})();`;
