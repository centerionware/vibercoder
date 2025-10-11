import * as esbuild from 'esbuild-wasm';

let serviceInitialized = false;

export const initializeService = async () => {
    if (serviceInitialized) {
        return;
    }
    try {
        await esbuild.initialize({
            wasmURL: 'https://unpkg.com/esbuild-wasm@0.21.3/esbuild.wasm',
            worker: true,
        });
        serviceInitialized = true;
    } catch (e) {
        if (e instanceof Error && !e.message.includes('already been initialized')) {
            throw e;
        }
        serviceInitialized = true; // Still mark as initialized on re-init error
    }
};
