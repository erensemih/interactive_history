import { defineConfig } from 'vitest/config';

// Relative base so the built site works from any sub-path (GitHub Pages, a folder, file hosting).
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
