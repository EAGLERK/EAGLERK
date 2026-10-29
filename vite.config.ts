import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// SINGLE=1 (npm run build:single) folds the lazy 3D chunk into one file.
export default defineConfig({
  plugins: [react()],
  build: process.env.SINGLE ? { rolldownOptions: { output: { codeSplitting: false } } } : {},
  test: { include: ['tests/**/*.test.ts'] },
});
