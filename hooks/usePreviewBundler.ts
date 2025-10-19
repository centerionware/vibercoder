import { useState, useEffect, useRef, useCallback } from 'react';
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

  // Use a ref to hold the latest version of the props. This avoids having potentially
  // unstable functions (like onLog) in the dependency array of the main debounce useEffect,
  // making the debounce logic more robust.
  const latestPropsRef = useRef({ files, entryPoint, apiKey, onLog, onClearLogs });
  useEffect(() => {
    latestPropsRef.current = { files, entryPoint, apiKey, onLog, onClearLogs };
  });

  const doBundle = useCallback(async () => {
    // Access the latest props via the ref inside the stable callback.
    const { files: currentFiles, entryPoint: currentEntryPoint, onLog: currentOnLog, apiKey: currentApiKey, onClearLogs: currentOnClearLogs } = latestPropsRef.current;
    
    if (!currentFiles || Object.keys(currentFiles).length === 0) return;

    currentOnClearLogs();
    setIsBundling(true);
    setBundleError(null);

    try {
      const result = await bundle(currentFiles, currentEntryPoint, currentOnLog, currentApiKey);
      if (result.code) {
        setBundleError(null);
        setBuiltCode(result.code);
        setBuildId(uuidv4());
      } else if (result.error) {
        setBundleError(result.error);
        currentOnLog(`Bundling failed: ${result.error}`);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred during bundling.';
      setBundleError(errorMsg);
      currentOnLog(`Bundling failed: ${errorMsg}`);
    } finally {
      setIsBundling(false);
    }
  }, []); // This useCallback has no dependencies and will be stable across re-renders.

  // This dependency only changes when the file *content* changes.
  const filesContent = JSON.stringify(files);

  useEffect(() => {
    // The main effect for triggering the debounced bundle. Its dependencies are
    // now stable data, not functions, making it reliable.
    const debounceTimer = setTimeout(doBundle, 500);
    return () => clearTimeout(debounceTimer);
  }, [filesContent, entryPoint, apiKey, doBundle]);

  return { isBundling, bundleError, builtCode, buildId };
};