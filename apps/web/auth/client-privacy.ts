'use client';
import { useEffect } from 'react';
export function clearPrivateInputs() {
  document.querySelectorAll<HTMLInputElement>('[data-secret]').forEach((el) => {
    el.value = '';
  });
}
export function hidePrivateSurfaces() {
  document
    .querySelectorAll<HTMLElement>('[data-private-surface]')
    .forEach((el) => {
      el.style.visibility = 'hidden';
      el.setAttribute('inert', '');
    });
}
export function useBackPrivacyGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const hide = () => {
      clearPrivateInputs();
      hidePrivateSurfaces();
    };
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hide();
        location.reload();
      }
    };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [active]);
}
