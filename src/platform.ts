import { Capacitor } from '@capacitor/core';

/** True inside the Android or iOS app (the Capacitor shell), false in any browser, installed or not. */
export const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/** True when MyMoney was opened from the home screen as an installed web app. */
export const isStandalone = (): boolean => {
  try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; }
};

export const isIOS = (): boolean => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
