import { useEffect, useState } from 'react';
import { isNative } from './platform';

/**
 * Makes MyMoney installable and usable offline. The service worker (public/sw.js) only caches this site's own files;
 * your data lives in the browser's storage as before, and sign-in and sync calls go straight to the network.
 */

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at start-up. Chrome and Edge fire `beforeinstallprompt` early, so it has to be caught before any screen mounts. */
export function startPwa(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
  const secure = location.protocol === 'https:' || location.hostname === 'localhost';
  if (__PWA__ && import.meta.env.PROD && !isNative() && secure && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => { void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* the app works without it */ }); });
  }
}

/** Whether the browser can show its install prompt right now, and a function that shows it. */
export function useInstallPrompt(): { canPrompt: boolean; prompt: () => Promise<'accepted' | 'dismissed' | 'unavailable'> } {
  const [, force] = useState(0);
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  return {
    canPrompt: deferred !== null,
    prompt: async () => {
      const e = deferred;
      if (!e) return 'unavailable';
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      notify();
      return outcome;
    },
  };
}
