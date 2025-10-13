import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Replicate the define behavior from esbuild for process.env and global
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || ''),
    'global': 'window',
  },
  build: {
    // Output to 'www' to be compatible with Capacitor
    outDir: 'www',
    // Ensure the output directory is cleaned before building
    emptyOutDir: true,
  },
  worker: {
    // Define worker-specific globals. This is crucial because workers do not have
    // a 'window' object. Overriding the top-level 'global: "window"' prevents
    // a runtime error in the bundled git worker. 'self' is the correct
    // global scope for a web worker.
    // The `define` property is not valid here and causes a TypeScript error.
    // This is now handled by a polyfill in `services/git.worker.ts`.
  },
});