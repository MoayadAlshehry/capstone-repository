'use client';
import { safeOrigin } from './experience-model.js';
// Session-only coordinates, scoped to the authenticated context. No record data.
export function rememberPosition(owner: string) {
  try {
    const path = safeOrigin(
      location.pathname + location.search,
      location.pathname.startsWith('/ar') ? 'ar' : 'en',
    );
    if (path)
      sessionStorage.setItem(
        'capstone.position.' + owner + path,
        String(window.scrollY),
      );
  } catch {}
}
export function preparePosition(owner: string, href: string) {
  try {
    const u = new URL(href, location.origin);
    if (u.origin !== location.origin) return;
    const path = safeOrigin(
      u.pathname + u.search,
      u.pathname.startsWith('/ar') ? 'ar' : 'en',
    );
    if (
      path &&
      sessionStorage.getItem('capstone.position.' + owner + path) !== null
    )
      sessionStorage.setItem('capstone.position.pending.' + owner, path);
  } catch {}
}
export function restorePosition(owner: string) {
  const key = 'capstone.position.pending.' + owner;
  let path: string | null = null,
    top = 0;
  try {
    path = sessionStorage.getItem(key);
    if (path !== location.pathname + location.search) return () => {};
    top = Number(sessionStorage.getItem('capstone.position.' + owner + path));
    sessionStorage.removeItem(key);
  } catch {
    return () => {};
  }
  if (!Number.isFinite(top) || top < 0) return () => {};
  const apply = () => {
    if (!document.getElementById('r3-main')) return;
    window.scrollTo({ top, behavior: 'instant' });
  };
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  const timeout = setTimeout(() => {
    apply();
    observer.disconnect();
  }, 2000);
  apply();
  return () => {
    clearTimeout(timeout);
    observer.disconnect();
  };
}
