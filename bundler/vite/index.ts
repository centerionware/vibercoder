import { BundleResult, OnLog } from '../types';

/**
 * Blueprint for a future Vite-based bundler.
 * Currently not implemented.
 */
export const bundleWithVite = (
  files: Record<string, string>,
  entryPoint: string,
  onLog: OnLog,
  apiKey: string
): Promise<BundleResult> => {
  onLog('[Vite] Bundler not implemented.');
  const error = `Vite bundler is not yet implemented. This is a placeholder for future development.`;
  return Promise.resolve({
    code: null,
    error: error,
  });
};