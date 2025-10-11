import { bundleWithEsbuild } from './esbuild';
import { bundleWithVite } from './vite';
import { BundleResult, OnLog } from './types';

export enum BundlerType {
  Esbuild = 'esbuild',
  Vite = 'vite',
}

/**
 * The main entry point for the bundling service.
 * It abstracts the specific bundler implementation.
 * @param files A record of filenames to their content.
 * @param entryPoint The main file for the bundler.
 * @param onLog A callback for logging.
 * @param bundlerType The type of bundler to use (defaults to esbuild).
 * @returns A promise that resolves to the bundle result.
 */
export const bundle = (
  files: Record<string, string>,
  entryPoint: string,
  onLog: OnLog,
  bundlerType: BundlerType = BundlerType.Esbuild
): Promise<BundleResult> => {
  switch (bundlerType) {
    case BundlerType.Esbuild:
      return bundleWithEsbuild(files, entryPoint, onLog);
    case BundlerType.Vite:
      return bundleWithVite(files, entryPoint, onLog);
    default:
      return Promise.resolve({
        code: null,
        error: `Unknown bundler type: ${bundlerType}`,
      });
  }
};
