import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { bundle } from '../bundler';

interface UsePreviewBundlerProps {
  files: Record<string, string>;
  entryPoint: string;
  apiKey: string;
  onLog: (log: string) => void;
  onClearLogs: () => void;
}

export const usePreviewBundler = ({ files, entryPoint, apiKey, onLog, onClearLogs }: UsePreviewBundlerProps) => {
  const [isBundling, setIsBundling] = useState(true);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [builtCode, setBuiltCode] = useState<string | null>(null);
  const [buildId, setBuildId] = useState<string | null>(null);

  useEffect(() => {
    if (!files || Object.keys(files).length === 0) return;

    const doBundle = async () => {
      onClearLogs();
      setIsBundling(true);
      setBundleError(null);

      try {
        const result = await bundle(files, entryPoint, onLog, apiKey);
        if (result.code) {
          setBundleError(null);
          setBuiltCode(result.code);
          setBuildId(uuidv4());
        } else if (result.error) {
          setBundleError(result.error);
          onLog(`Bundling failed: ${result.error}`);
        }
      } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred during bundling.';
          setBundleError(errorMsg);
          onLog(`Bundling failed: ${errorMsg}`);
      } finally {
          setIsBundling(false);
      }
    };

    const debounceTimer = setTimeout(doBundle, 500);
    return () => clearTimeout(debounceTimer);
  }, [files, entryPoint, apiKey, onLog, onClearLogs]);

  return { isBundling, bundleError, builtCode, buildId };
};