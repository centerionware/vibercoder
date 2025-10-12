import React, { useState, useEffect, useRef } from 'react';
import { bundle } from '../../bundler';
import SpinnerIcon from '../icons/SpinnerIcon';
import XIcon from '../icons/XIcon';
import ClipboardIcon from '../icons/ClipboardIcon';
import CheckIcon from '../icons/CheckIcon';

const previewHtml = `
<html>
  <head>
    <style>
      body { margin: 0; background-color: #1a1b26; }
      #root-error { color: white; font-family: sans-serif; padding: 1rem; }
      #root-error h3 { color: #f87171; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      const handleError = (err) => {
        const root = document.querySelector('#root');
        root.innerHTML = '<div id="root-error"><h3>Runtime Error</h3><pre>' + err.message + '</pre></div>';
        console.error('Error in preview:', err);
        window.parent.postMessage({ type: 'runtime-error', error: err.message }, '*');
      };
      
      window.addEventListener('error', (event) => handleError(event.error));

      window.addEventListener('message', (event) => {
        if (event.data.type === 'execute') {
            try {
                document.querySelector('#root').innerHTML = ''; // Clear previous content/errors
                eval(event.data.code);
            } catch (err) {
                handleError(err);
            }
        }
      }, false);
    </script>
  </body>
</html>
`;

interface PreviewViewProps {
  files: Record<string, string>;
  entryPoint: string;
  onLog: (log: string) => void;
  onRuntimeError: (error: string) => void;
  bundleLogs: string[];
  onClearLogs: () => void;
}

const PreviewView: React.FC<PreviewViewProps> = ({ files, entryPoint, onLog, onRuntimeError, bundleLogs, onClearLogs }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isBundling, setIsBundling] = useState(true);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isBundling) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [bundleLogs, isBundling]);

  useEffect(() => {
    if (!files || Object.keys(files).length === 0) return;

    const doBundle = async () => {
      onClearLogs();
      setIsBundling(true);
      setBundleError(null);

      const result = await bundle(files, entryPoint, onLog);
      if (result.code) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'execute', code: result.code }, '*');
      } else if (result.error) {
        setBundleError(result.error);
        onLog(`Bundling failed: ${result.error}`);
      }
      setIsBundling(false);
    };

    const debounceTimer = setTimeout(doBundle, 500);
    return () => clearTimeout(debounceTimer);
  }, [files, entryPoint, onLog, onClearLogs]);

  useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
          if (event.source === iframeRef.current?.contentWindow && event.data.type === 'runtime-error') {
              onRuntimeError(event.data.error);
          }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
  }, [onRuntimeError]);

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden">
      <div className="relative flex-1">
        <iframe
          id="preview-iframe"
          ref={iframeRef}
          srcDoc={previewHtml}
          title="Preview"
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
        />
        {(isBundling || bundleError) && (
          <div className="absolute inset-0 bg-vibe-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-4">
            {isBundling && (
              <div className="bg-vibe-panel p-4 rounded-lg max-w-2xl w-full border border-vibe-accent/30">
                <h3 className="text-lg font-bold text-vibe-accent flex items-center gap-2">
                    <SpinnerIcon className="w-5 h-5"/> Building...
                </h3>
                <pre className="mt-3 text-xs text-vibe-text-secondary whitespace-pre-wrap font-mono break-all max-h-80 overflow-y-auto bg-vibe-bg-deep p-2 rounded-md">
                  {bundleLogs.join('\n')}
                  <div ref={logsEndRef} />
                </pre>
              </div>
            )}
            {bundleError && <BuildErrorDisplay error={bundleError} />}
          </div>
        )}
      </div>
    </div>
  );
};

const BuildErrorDisplay: React.FC<{ error: string }> = ({ error }) => {
    const [copied, setCopied] = useState(false);
    const handleErrorCopy = () => {
        navigator.clipboard.writeText(error);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  return (
    <div className="bg-vibe-panel p-4 rounded-lg max-w-2xl w-full border border-red-500/30">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
            <XIcon className="w-5 h-5"/> Build Failed
        </h3>
        <button onClick={handleErrorCopy} className="text-xs flex items-center gap-1.5 bg-vibe-bg-deep px-2 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment transition-colors">
            {copied ? <CheckIcon className="w-4 h-4 text-green-400"/> : <ClipboardIcon className="w-4 h-4"/>}
            {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="mt-3 text-xs text-vibe-text whitespace-pre-wrap font-mono break-all max-h-80 overflow-y-auto bg-vibe-bg-deep p-2 rounded-md">
        {error}
      </pre>
    </div>
  );
};

export default PreviewView;