import * as esbuild from 'esbuild-wasm';

let serviceInitialized = false;

const initializeService = async () => {
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

const unpkgPathPlugin = (files: Record<string, string>, onLog: (message: string) => void) => {
  return {
    name: 'unpkg-path-plugin',
    setup(build: esbuild.PluginBuild) {
      build.onResolve({ filter: /.*/ }, async (args: esbuild.OnResolveArgs) => {
        // 1. Handle entry point
        if (args.kind === 'entry-point') {
          onLog(`Resolving entry point: ${args.path}`);
          return { path: args.path, namespace: 'a' };
        }
        
        // 2. Handle imports from remote files (on CDN)
        if (args.importer.startsWith('http')) {
          const resolvedUrl = new URL(args.path, args.importer).href;
          onLog(`Resolving remote relative path: ${args.path} -> ${resolvedUrl}`);
          return { path: resolvedUrl, namespace: 'a' };
        }

        // 3. Handle imports from local files
        // First, try to resolve as a local file relative to the importer
        const localPath = new URL(args.path, `file://${args.resolveDir}`).pathname.substring(1);
        const candidates = [
          localPath,
          `${localPath}.ts`,
          `${localPath}.tsx`,
          `${localPath}.css`,
          `${localPath}/index.ts`,
          `${localPath}/index.tsx`,
        ];
        for (const candidate of candidates) {
            if (candidate in files) {
                onLog(`Resolving local file: ${args.path} -> ${candidate}`);
                return { path: candidate, namespace: 'a' };
            }
        }
        
        // If it's not a local file, it must be a root package import
        const remoteUrl = `https://esm.sh/${args.path}`;
        onLog(`Resolving root package: ${args.path} -> ${remoteUrl}`);
        return { path: remoteUrl, namespace: 'a' };
      });
    },
  };
};

const fetchPlugin = (files: Record<string, string>, onLog: (message: string) => void) => {
  return {
    name: 'fetch-plugin',
    setup(build: esbuild.PluginBuild) {
      build.onLoad({ filter: /.*/, namespace: 'a' }, async (args: esbuild.OnLoadArgs) => {
        // Load from virtual in-memory files
        if (files[args.path]) {
          onLog(`Loading from memory: ${args.path}`);
          const fileContent = files[args.path];
          
          const resolveDir = args.path.substring(0, args.path.lastIndexOf('/') + 1) || '/';
          
          if (args.path.endsWith('.css')) {
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
        }
        
        // Fetch from CDN
        onLog(`Fetching from CDN: ${args.path}`);
        const response = await fetch(args.path);
        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Could not load ${args.path}: ${response.status} ${response.statusText}\n${message}`);
        }
        const contents = await response.text();
        
        // The resolveDir is not critical for remote files with the new onResolve logic,
        // but it's good practice to provide it. The 'importer' field will contain the full URL.
        const resolveDir = new URL('./', response.url).pathname;

        return {
          loader: 'tsx',
          contents,
          resolveDir,
        };
      });
    },
  };
};

/**
 * Bundles the given files using esbuild-wasm.
 * @param files A record of filenames to their content.
 * @param entryPoint The main file for the bundler (e.g., 'index.tsx').
 * @param onLog A callback to log bundling progress.
 * @returns An object with the bundled code or an error message.
 */
export const bundleCode = async (
  files: Record<string, string>,
  entryPoint: string,
  onLog: (message: string) => void
): Promise<{ code: string | null; error: string | null }> => {
    try {
        onLog('Initializing bundler service...');
        await initializeService();
        onLog('Bundler initialized.');

        onLog('Starting build...');
        const result = await esbuild.build({
            entryPoints: [entryPoint],
            bundle: true,
            write: false,
            plugins: [unpkgPathPlugin(files, onLog), fetchPlugin(files, onLog)],
            define: {
                'process.env.NODE_ENV': '"production"',
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