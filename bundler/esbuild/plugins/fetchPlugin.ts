import * as esbuild from 'esbuild-wasm';
import { OnLog } from '../../types';

export const fetchPlugin = (files: Record<string, string>, onLog: OnLog): esbuild.Plugin => {
  return {
    name: 'fetch-plugin',
    setup(build: esbuild.PluginBuild) {
      // Loader for files fetched from the CDN (full https:// URLs)
      // This more specific filter runs first.
      build.onLoad({ filter: /^https?:\/\//, namespace: 'a' }, async (args: esbuild.OnLoadArgs) => {
        const log = (msg: string) => onLog(`[Load] ${msg}`);
        log(`Fetching from CDN: ${args.path}`);
        
        const response = await fetch(args.path);
        if (!response.ok) {
            const message = await response.text();
            throw new Error(`[plugin: fetch-plugin] Could not load ${args.path}: ${response.status}\n${message}`);
        }
        const contents = await response.text();
        // The resolveDir for CDN files is the URL of the directory containing the file.
        // This is crucial for the onResolve plugin to work correctly.
        const resolveDir = new URL('./', response.url).href;

        return {
          loader: 'tsx',
          contents,
          resolveDir,
        };
      });

      // Loader for local files in the virtual file system
      // This catch-all filter runs second for any paths that didn't match the first loader.
      build.onLoad({ filter: /.*/, namespace: 'a' }, (args: esbuild.OnLoadArgs) => {
        const log = (msg: string) => onLog(`[Load] ${msg}`);
        log(`Loading from memory: ${args.path}`);

        if (!files[args.path]) {
          // This should not happen if onResolve is correct, but it's a good safeguard.
          throw new Error(`[plugin: fetch-plugin] File not found in virtual file system: ${args.path}`);
        }

        const fileContent = files[args.path];
        // The resolveDir for local files is their directory path.
        const resolveDir = args.path.includes('/') ? args.path.substring(0, args.path.lastIndexOf('/')) : '';

        // Handle CSS files by injecting them as a <style> tag
        if (args.path.endsWith('.css')) {
            log(`Handling CSS import for ${args.path}`);
            const escaped = fileContent.replace(/\n/g, '').replace(/"/g, '\\"').replace(/'/g, "\\'");
            const contents = `
              const style = document.createElement('style');
              style.innerText = '${escaped}';
              document.head.appendChild(style);
            `;
            return { loader: 'jsx', contents, resolveDir };
        }
        
        return {
          loader: 'tsx',
          contents: fileContent,
          resolveDir,
        };
      });
    },
  };
};