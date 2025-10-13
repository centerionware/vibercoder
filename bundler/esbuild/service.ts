

import * as esbuild from 'esbuild-wasm';

let serviceInitialized = false;

export const initializeService = async () => {
    if (serviceInitialized) {
        return;
    }
    try {
        // FIX: Some module loaders/CDNs wrap the actual exports in a `default` property.
        // This checks for that and uses the correct object to call `initialize`.
        const esbuildService = (esbuild as any).default || esbuild;

        // Simplify to always use the web-worker based initialization.
        // In native Capacitor environments, the `fetch` call inside the worker
        // will be automatically intercepted and handled by the native HTTP client,
        // which correctly bypasses CORS and fetches the WASM binary.
        await esbuildService.initialize({
            wasmURL: 'https://unpkg.com/esbuild-wasm@0.25.10/esbuild.wasm',
            worker: true,
        });

        serviceInitialized = true;
    } catch (e) {
        if (e instanceof Error && !e.message.includes('already been initialized')) {
            // Rethrow critical initialization errors to be caught by the bundler.
            console.error("Failed to initialize esbuild service:", e);
            throw e;
        }
        // If it's just a re-initialization error, we can ignore it and proceed.
        serviceInitialized = true;
    }
};