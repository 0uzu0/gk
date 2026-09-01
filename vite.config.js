import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 10000,
    cssCodeSplit: false
  }
});
