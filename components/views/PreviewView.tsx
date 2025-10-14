import React, { useState, useEffect, useRef } from 'react';
import { bundle } from '../../bundler';
import SpinnerIcon from '../icons/SpinnerIcon';
import XIcon from '../icons/XIcon';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import TrashIcon from '../icons/TrashIcon';


const previewHtml = `
<html>
  <head>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              'vibe-bg': '#1a1b26',
              'vibe-bg-deep': '#16161e',
              'vibe-panel': '#24283b',
              'vibe-accent': '#7aa2f7',
              'vibe-accent-hover': '#9ece6a',
              'vibe-text': '#c0caf5',
              'vibe-text-secondary': '#a9b1d6',
              'vibe-comment': '#565f89',
            }
          }
        }
      }
    </script>
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

      const handleCaptureState = (event) => {
        const videoEl = document.querySelector('video');
        const styles = Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
                           .map(el => el.outerHTML)
                           .join('');
        const payload = {
            htmlContent: styles + document.body.outerHTML,
            videoFrameDataUrl: null,
            videoFrameRect: null,
        };

        if (videoEl && videoEl.readyState >= 2) { // HAVE_CURRENT_DATA
            const canvas = document.createElement('canvas');
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                payload.videoFrameDataUrl = canvas.toDataURL();
                // Bounding rect needs to be serialized as it's not a plain object
                payload.videoFrameRect = JSON.parse(JSON.stringify(videoEl.getBoundingClientRect()));
            }
        }
        
        window.parent.postMessage({
            type: 'preview-state-captured',
            requestId: event.data.requestId,
            payload: payload
        }, '*');
      };

      const handleInteraction = (event) => {
        try {
            const { selector, action, value } = event.data.payload;
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error('Element with selector "' + selector + '" not found.');
            }
            switch(action) {
                case 'click':
                    element.click();
                    break;
                case 'type':
                    element.value = value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                case 'focus':
                    element.focus();
                    break;
                case 'blur':
                    element.blur();
                    break;
                default:
                    throw new Error('Unsupported action: "' + action + '".');
            }
            window.parent.postMessage({ type: 'interaction-success', requestId: event.data.requestId, message: "Successfully performed '" + action + "' on '" + selector + "'." }, '*');
        } catch (err) {
             window.parent.postMessage({ type: 'interaction-error', requestId: event.data.requestId, message: err.message }, '*');
        }
      };

      window.addEventListener('message', (event) => {
        const rootEl = document.getElementById('root');

        const waitForContentAndRun = (actionFn) => {
            let attempts = 0;
            const maxAttempts = 20; // Try for 2 seconds
            const interval = 100;

            const checkContent = () => {
                // Check if root has children, significant innerHTML, or if an error is displayed
                if (rootEl && (rootEl.children.length > 0 || rootEl.innerHTML.length > 100 || document.getElementById('root-error'))) {
                    actionFn(event);
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkContent, interval);
                } else {
                    console.warn('Timed out waiting for preview content, running action anyway.');
                    actionFn(event);
                }
            };
            checkContent();
        };

        if (event.data.type === 'execute') {
            try {
                if(rootEl) rootEl.innerHTML = ''; // Clear previous content/errors
                eval(event.data.code);
            } catch (err) {
                handleError(err);
            }
        } else if (event.data.type === 'capture-preview-state') {
            waitForContentAndRun(handleCaptureState);
        } else if (event.data.type === 'interact-with-element') {
            waitForContentAndRun(handleInteraction);
        }
      }, false);
    </script>
  </body>
</html>
`;

const BuildLogDisplay: React.FC<{
  logs: string[];
  error: string | null;
  onClear: () => void;
}> = ({ logs, error, onClear }) => {
  const [isOpen, setIsOpen] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, error, isOpen]);

  const hasContent = logs.length > 0 || error;
  if (!hasContent) {
    return null;
  }

  const headerColor = error ? 'text-red-400' : 'text-vibe-text-secondary';
  const borderColor = error ? 'border-red-500/30' : 'border-vibe-panel';

  return (
    <div className={`flex-shrink-0 border-t ${borderColor} bg-vibe-bg-deep`}>
      <header className="flex items-center justify-between p-2">
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center font-semibold text-sm hover:opacity-80 transition-opacity">
          <ChevronDownIcon className={`w-5 h-5 mr-2 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          <span className={headerColor}>
            {error ? 'Build Failed' : 'Build Output'}
          </span>
        </button>
        <button onClick={onClear} className="p-1.5 rounded-md text-vibe-comment hover:bg-vibe-bg hover:text-red-400" title="Clear logs">
          <TrashIcon className="w-4 h-4" />
        </button>
      </header>
      {isOpen && (
        <pre className="p-2 font-mono text-xs whitespace-pre-wrap overflow-auto max-h-48 bg-vibe-bg border-t border-vibe-panel">
          {logs.join('\n')}
          {error && <div className="text-red-400 mt-2">{error}</div>}
          <div ref={logsEndRef} />
        </pre>
      )}
    </div>
  );
};


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
  
  useEffect(() => {
    if (!files || Object.keys(files).length === 0) return;

    const doBundle = async () => {
      onClearLogs(); // Clear previous build's logs at the start of a new build.
      setIsBundling(true);
      setBundleError(null);

      const result = await bundle(files, entryPoint, onLog);
      if (result.code) {
        setBundleError(null);
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
        {isBundling && (
          <div className="absolute inset-0 bg-vibe-bg-deep/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-vibe-panel p-4 rounded-lg border border-vibe-accent/30 text-center">
                <h3 className="text-lg font-bold text-vibe-accent flex items-center gap-2">
                    <SpinnerIcon className="w-5 h-5"/> Building...
                </h3>
                <p className="text-sm text-vibe-text-secondary mt-2">Check the build output below for progress.</p>
              </div>
          </div>
        )}
      </div>
      <BuildLogDisplay 
        logs={bundleLogs}
        error={bundleError}
        onClear={onClearLogs}
      />
    </div>
  );
};

export default PreviewView;