import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Civitai App Blocks build config. Static SPA served from the nginx pod
// at the per-app subdomain. No SSR; no server functions; bundle is
// fully self-contained.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Hash assets so Cloudflare caches forever; index.html stays
        // fresh because we serve it with no-cache from nginx.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 5173,
  },
});
