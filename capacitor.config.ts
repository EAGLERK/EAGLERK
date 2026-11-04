import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android and iOS apps are this same web app inside a native shell (Capacitor). `npm run build:mobile` builds it and copies it in.
 *
 * CHANGE `appId` BEFORE YOU PUBLISH. It is the app's permanent identity in Google Play and the App Store and cannot be changed
 * afterwards. Use a reverse domain name you own, for example `com.yourcompany.mymoney`.
 */
const config: CapacitorConfig = {
  appId: 'app.mymoney',
  appName: 'MyMoney',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  ios: { contentInset: 'automatic' },
};

export default config;
