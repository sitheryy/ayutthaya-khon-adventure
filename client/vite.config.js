import { defineConfig } from 'vite';
const BUILD = String(Date.now());
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { rollupOptions: { input: { main: 'index.html' } }, chunkSizeWarningLimit: 1200 },
  server: { host: true },
  // version.json lets open tabs / home-screen apps notice a new deploy and reload themselves
  plugins: [{ name: 'version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD }) }); } }],
});
