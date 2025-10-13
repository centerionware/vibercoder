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
 * @returns An object with the bundled code or an error message.
 */
export const bundleWithEsbuild = async (
  files: Record<string, string>,
  entryPoint: string,
  onLog: OnLog
): Promise<BundleResult> => {
    try {
        onLog('Initializing esbuild service...');
        await initializeService();
        onLog('Bundler initialized.');

        onLog('Starting build...');

        // FIX: Some module loaders/CDNs wrap the actual exports in a `default` property.
        // This checks for that and uses the correct object to call `build`.
        const esbuildService = (esbuild as any).default || esbuild;

        const result = await esbuildService.build({
            entryPoints: [entryPoint],
            bundle: true,
            write: false,
            plugins: [unpkgPathPlugin(files, onLog), fetchPlugin(files, onLog)],
            define: {
                'process.env.NODE_ENV': '"production"',
                'process.env.API_KEY': `"${process.env.API_KEY}"`,
                global: 'window',
            },
            jsxFactory: 'React.createElement',
            jsxFragment: 'React.Fragment',
        });
        onLog('Build successful!');
        return {
            code: result.outputFiles[0].text,
            error: null
        };
    } catch(e) {
        if (e instanceof Error) {
            return { code: null, error: e.message };
        }
        return { code: null, error: 'An unknown error occurred during bundling.' };
    }
};