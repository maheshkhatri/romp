import { defineConfig } from 'vite';

export default defineConfig({
  // Served from a subpath (GitHub Pages: BASE_PATH=/romp/) or, by default, a domain root.
  base: process.env.BASE_PATH || '/',
  build: { target: 'es2022', sourcemap: true },
  server: { host: '127.0.0.1', port: 5180, strictPort: true },
});
