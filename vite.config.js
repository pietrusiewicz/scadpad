import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so one build works from any subpath: /edytor/ on a Django
  // site, a GitHub Pages project page, or a plain static directory.
  base: './',
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // The OpenSCAD WASM build is one ~11 MB module. It is loaded lazily by the
    // render worker, so the bundle-size warning is just noise here.
    chunkSizeWarningLimit: 20000,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
