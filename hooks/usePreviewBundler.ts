import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { bundle } from '../bundler';

interface UsePreviewBundlerProps {
  files: Record<string, string>;
  entryPoint: string;
  onLog: (log: string) => void;
  onClearLogs: () => void;
}

export const usePreviewBundler = ({ files, entryPoint, onLog, onClearLogs }: UsePreviewBundlerProps) => {
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
      setBuiltCode(null);
      setBuildId(null);

      const result = await bundle(files, entryPoint, onLog);
      if (result.code) {
        setBundleError(null);
        setBuiltCode(result.code);
        setBuildId(uuidv4());
      } else if (result.error) {
        setBundleError(result.error);
        onLog(`Bundling failed: ${result.error}`);
      }
      setIsBundling(false);
    };

    const debounceTimer = setTimeout(doBundle, 500);
    return () => clearTimeout(debounceTimer);
  }, [files, entryPoint, onLog, onClearLogs]);

  return { isBundling, bundleError, builtCode, buildId };
};
