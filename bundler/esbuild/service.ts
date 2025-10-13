
import * as esbuild from 'esbuild-wasm';
import { isNativeEnvironment } from '../../utils/environment';
import { nativeFetch } from '../../services/nativeFetch';

let serviceInitialized = false;

export const initializeService = async () => {
    if (serviceInitialized) {
        return;
    }
    try {
        // FIX: Some module loaders/CDNs wrap the actual exports in a `default` property.
        // This checks for that and uses the correct object to call `initialize`.
        const esbuildService = (esbuild as any).default || esbuild;

        if (isNativeEnvironment()) {
            // In native environments, the fetch polyfill is gone.
            // We must manually fetch the WASM binary using our native-aware fetch
            // and provide it directly to esbuild, bypassing its internal fetch call.
            console.log("[esbuild] Native environment detected. Fetching WASM binary manually.");
            const wasmURL = 'https://unpkg.com/esbuild-wasm@0.25.10/esbuild.wasm';
            const response = await nativeFetch(wasmURL);
            if (!response.ok) {
                throw new Error(`Failed to fetch esbuild.wasm: ${response.status} ${response.statusText}`);
            }
            const wasmBytes = await response.arrayBuffer();
            const wasmModule = await WebAssembly.compile(wasmBytes);
            
            await esbuildService.initialize({
                wasmModule,
                worker: false, // Must run on main thread to use native capabilities
            });

        } else {
            // In a standard web/sandbox environment, let esbuild fetch its own WASM in a worker.
            await esbuildService.initialize({
                wasmURL: 'https://unpkg.com/esbuild-wasm@0.25.10/esbuild.wasm',
                worker: true,
            });
        }

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