
import * as esbuild from 'esbuild-wasm';
import { isNativeEnvironment } from '../../utils/environment';

let serviceInitialized = false;

export const initializeService = async () => {
    if (serviceInitialized) {
        return;
    }
    try {
        // FIX: Some module loaders/CDNs wrap the actual exports in a `default` property.
        // This checks for that and uses the correct object to call `initialize`.
        const esbuildService = (esbuild as any).default || esbuild;
        await esbuildService.initialize({
            wasmURL: 'https://esm.sh/esbuild-wasm@0.25.10/esbuild.wasm',
            // Critical fix for native: Disable the worker on native platforms.
            // This forces esbuild to run on the main thread, where our `fetch`
            // polyfill can intercept its requests and route them through the native layer.
            worker: !isNativeEnvironment(),
        });
        serviceInitialized = true;
    } catch (e) {
        if (e instanceof Error && !e.message.includes('already been initialized')) {
            throw e;
        }
        serviceInitialized = true; // Still mark as initialized on re-init error
    }
};