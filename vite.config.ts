import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Emits the service worker with a cache name unique to this build, so a release replaces the old files instead of piling up beside them. */
const serviceWorker = (): Plugin => ({
  name: 'service-worker',
  apply: 'build',
  generateBundle() {
    if (process.env.SINGLE) return;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync('pwa/sw.js', 'utf8').replace('__BUILD__', Date.now().toString(36)) });
  },
});

// SINGLE=1 (npm run build:single) folds the lazy 3D chunk into one file, and leaves the service worker out (an embedded preview cannot run one).
export default defineConfig({
  plugins: [react(), serviceWorker()],
  define: { __PWA__: JSON.stringify(!process.env.SINGLE) },
  build: process.env.SINGLE ? { rolldownOptions: { output: { codeSplitting: false } } } : {},
  test: { include: ['tests/**/*.test.ts'], define: { __PWA__: 'false' } },
});
