import * as esbuild from 'esbuild-wasm';
import { initializeService } from './service';
import { unpkgPathPlugin } from './plugins/unpkgPathPlugin';
import { fetchPlugin } from './plugins/fetchPlugin';
import { BundleResult, OnLog } from '../types';

/**
 * Bundles the given files using esbuild-wasm.
 * @param files A record of filenames to their content.
 * @param entryPoint The main file for the bundler (e.g., 'index.tsx').
 * @param onLog A callback to log bundling progress.
 * @param apiKey The Google Gemini API key to make available in the bundled code.
 * @returns An object with the bundled code or an error message.
 */
export const bundleWithEsbuild = async (
  files: Record<string, string>,
  entryPoint: string,
  onLog: OnLog,
  apiKey: string
): Promise<BundleResult> => {
    try {
        onLog('Initializing esbuild service...');
        await initializeService(onLog);
        onLog('Bundler initialized.');

        onLog('Starting build...');

        const esbuildService = (esbuild as any).default || esbuild;

        const result = await esbuildService.build({
            entryPoints: [entryPoint],
            bundle: true,
            write: false,
            plugins: [unpkgPathPlugin(files, onLog), fetchPlugin(files, onLog)],
            define: {
                'process.env.NODE_ENV': '"production"',
                'process.env.API_KEY': `"${apiKey}"`,
                global: 'window',
            },
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
        });
        
        onLog('Build process finished.');
        
        // Polyfill Buffer for libraries like isomorphic-git that need it in the browser.
        const bufferPolyfill = `
            if (typeof window.Buffer === 'undefined') {
                const bufferModule = await import('buffer');
                window.Buffer = bufferModule.Buffer;
            }
        `;
        
        const finalCode = `(async () => {
            ${bufferPolyfill}
            ${result.outputFiles[0].text}
        })();`;

        onLog('Build successful!');
        return {
            code: finalCode,
            error: null
        };
    } catch(e) {
        onLog(`[Critical Error] ${e}`);
        if (e instanceof Error) {
            return { code: null, error: e.message };
        }
        return { code: null, error: 'An unknown error occurred during bundling.' };
    }
};