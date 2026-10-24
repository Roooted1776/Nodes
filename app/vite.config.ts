import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: open it by double-click, no server needed.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4000, assetsInlineLimit: 100000000 },
});
