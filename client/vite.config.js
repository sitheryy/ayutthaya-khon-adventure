import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: 'index.html' } }, chunkSizeWarningLimit: 1200 },
  server: { host: true },
});
