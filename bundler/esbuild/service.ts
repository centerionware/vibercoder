import * as esbuild from 'esbuild-wasm';
import { OnLog } from '../types';

let serviceInitialized = false;

export const initializeService = async (onLog: OnLog) => {
    if (serviceInitialized) {
        onLog('[Service] Already initialized.');
        return;
    }
    try {
        const esbuildService = (esbuild as any).default || esbuild;

        onLog('[Service] Fetching and initializing esbuild.wasm...');
        await esbuildService.initialize({
            wasmURL: 'https://aistudiocdn.com/esbuild-wasm@0.25.11/esbuild.wasm',
            worker: true,
        });
        onLog('[Service] WASM initialized successfully.');

        serviceInitialized = true;
    } catch (e) {
        if (e instanceof Error && !e.message.includes('already been initialized')) {
            onLog(`[Service Error] Failed to initialize esbuild: ${e.message}`);
            console.error("Failed to initialize esbuild service:", e);
            throw e;
        }
        // This handles hot-reloading scenarios where the service might be initialized multiple times.
        // It's a non-fatal error we can safely ignore.
        onLog('[Service] Caught re-initialization error, proceeding.');
        serviceInitialized = true;
    }
};
