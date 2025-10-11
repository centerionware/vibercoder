import * as esbuild from 'esbuild-wasm';
import { OnLog } from '../../types';

export const unpkgPathPlugin = (files: Record<string, string>, onLog: OnLog): esbuild.Plugin => {
  return {
    name: 'unpkg-path-plugin',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /.*/ }, async (args: esbuild.OnResolveArgs) => {
        const log = (msg: string) => onLog(`[Resolve] ${msg}`);

        // 1. Handle entry point - the simplest case.
        if (args.kind === 'entry-point') {
          log(`Entry point: ${args.path}`);
          if (!files[args.path]) {
            throw new Error(`Entry point "${args.path}" not found in the virtual file system.`);
          }
          return { path: args.path, namespace: 'a' };
        }

        // 2. Handle relative paths ('./' or '../'). This is now the priority check.
        if (args.path.startsWith('./') || args.path.startsWith('../')) {
          // The decision of how to resolve is based on the CONTEXT of the importing file.
          // Using `importer` is more robust than `resolveDir` for this check.
          if (args.importer.startsWith('http')) {
            // CONTEXT: CDN file. Resolve as a URL.
            const resolvedUrl = new URL(args.path, args.importer).href;
            log(`Resolved CDN relative path: ${args.path} from ${args.importer} -> ${resolvedUrl}`);
            return { path: resolvedUrl, namespace: 'a' };
          } else {
            // CONTEXT: Local file. Resolve within the virtual file system.
            log(`Attempting to resolve local relative path: ${args.path} from ${args.resolveDir || 'root'}`);
            const path = new URL(args.path, 'file://' + (args.resolveDir ? args.resolveDir + '/' : '')).pathname.substring(1);
            
            const candidates = [
                path, `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}.jsx`, `${path}.css`,
                `${path}/index.ts`, `${path}/index.tsx`, `${path}/index.js`, `${path}/index.jsx`,
            ];

            for (const candidate of candidates) {
                if (candidate in files) {
                    log(`Resolved local path: ${args.path} -> ${candidate}`);
                    return { path: candidate, namespace: 'a' };
                }
            }
            throw new Error(`Could not resolve local file: "${args.path}" from importer "${args.importer}"`);
          }
        }
        
        // 3. Handle bare imports and absolute-like paths.
        // First, check if the import is from a CDN file (e.g., import 'react' from a CDN module)
        if (args.importer.startsWith('http')) {
             const resolvedUrl = new URL(args.path, args.importer).href;
             log(`Resolved CDN bare/absolute path: ${args.path} from ${args.importer} -> ${resolvedUrl}`);
             return { path: resolvedUrl, namespace: 'a' };
        }
        
        // If not from a CDN, it's a bare import from a local file.
        // Try to resolve as a local file first. This allows for absolute-like paths in the project.
        const localCandidates = [
            args.path, `${args.path}.ts`, `${args.path}.tsx`, `${args.path}.js`, `${args.path}.jsx`, `${args.path}.css`,
            `${args.path}/index.ts`, `${args.path}/index.tsx`, `${args.path}/index.js`, `${args.path}/index.jsx`,
        ];
        for (const candidate of localCandidates) {
            if (candidate in files) {
                log(`Resolved bare import to local file: ${args.path} -> ${candidate}`);
                return { path: candidate, namespace: 'a' };
            }
        }

        // 4. If it's not a local file, assume it's an external package and fetch from the CDN.
        log(`Assuming external package for bare import: ${args.path}`);
        const resolvedUrl = new URL(args.path, 'https://esm.sh/').href;
        return {
            path: resolvedUrl,
            namespace: 'a',
        };
      });
    },
  };
};