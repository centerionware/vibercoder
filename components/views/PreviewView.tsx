import React, { useState, useEffect } from 'react';
import { bundle } from '../../bundler';
import SpinnerIcon from '../icons/SpinnerIcon';
import ExpandIcon from '../icons/ExpandIcon';
import CompressIcon from '../icons/CompressIcon';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import SendIcon from '../icons/SendIcon';


interface PreviewViewProps {
  files: Record<string, string>;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  bundleLogs: string[];
  setBundleLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setSandboxErrors: React.Dispatch<React.SetStateAction<string[]>>;
  sandboxErrors: string[];
  isLive: boolean;
  onSendErrorToAi: (errors: string[]) => void;
}

const PreviewView: React.FC<PreviewViewProps> = ({ 
  files, 
  isFullScreen, 
  onToggleFullScreen, 
  bundleLogs, 
  setBundleLogs, 
  setSandboxErrors,
  sandboxErrors,
  isLive,
  onSendErrorToAi
}) => {
  const [iframeContent, setIframeContent] = useState('');
  const [isBundling, setIsBundling] = useState(true);

  const htmlFiles = Object.keys(files).filter((f) => f.endsWith('.html'));
  const [activeHtmlFile, setActiveHtmlFile] = useState<string | null>(() => {
    const defaultFile = 'index.html';
    return htmlFiles.includes(defaultFile) ? defaultFile : htmlFiles[0] || null;
  });
  const [showLogs, setShowLogs] = useState(true);

  // Effect to update active HTML file if it's deleted or on initial load
  useEffect(() => {
    const newHtmlFiles = Object.keys(files).filter((f) => f.endsWith('.html'));
    if (!activeHtmlFile || !newHtmlFiles.includes(activeHtmlFile)) {
      setActiveHtmlFile(newHtmlFiles.includes('index.html') ? 'index.html' : newHtmlFiles[0] || null);
    }
  }, [files, activeHtmlFile]);

  // Effect to bundle code when files or the selected HTML file change
  useEffect(() => {
    if (!activeHtmlFile) {
        setIsBundling(false);
        setIframeContent('<html><body><p style="color: #c0caf5; font-family: sans-serif; text-align: center; padding-top: 2rem;">No HTML file found. Create an index.html file to begin.</p></body></html>');
        setBundleLogs(['No active HTML file to preview.']);
        return;
    }
    
    const onLog = (message: string) => {
        setBundleLogs(prev => [...prev, message]);
    };
      
    const timer = setTimeout(async () => {
      setIsBundling(true);
      setShowLogs(true);
      setIframeContent('');
      setBundleLogs([]);
      
      // Determine the entry point by convention: [name].html -> [name].tsx
      const baseName = activeHtmlFile.substring(0, activeHtmlFile.lastIndexOf('.'));
      const entryPoint = `${baseName}.tsx`;

      if (!files[entryPoint]) {
          onLog(`--- BUILD FAILED ---`);
          onLog(`Convention Error: The preview file "${activeHtmlFile}" requires a matching entry point named "${entryPoint}", which was not found.`);
          setIsBundling(false);
          return;
      }

      const result = await bundle(files, entryPoint, onLog);

      if (result.error) {
        onLog('\n--- BUILD FAILED ---');
        onLog(result.error);
      } else {
        // A new build has succeeded, so any previous runtime errors are now obsolete.
        setSandboxErrors([]);
        
        // This script is injected to give the parent window tools to interact with the sandbox.
        // It now captures the preview's full state (HTML + video frame) for the screenshot tool.
        const sandboxScripts = `
          <script>
            // --- VibeCode Error Catcher ---
            try {
              const postError = (message) => {
                window.parent.postMessage({ type: 'sandbox-error', message }, '*');
              };
              window.onerror = function(message, source, lineno, colno, error) {
                let fullMessage = \`[Runtime Error] \${message}\`;
                if (source) {
                  const sourceFile = source.split('/').pop();
                  fullMessage += \` at \${sourceFile}:\${lineno}:\${colno}\`;
                }
                if (error && error.stack) {
                  fullMessage += \`\\n--- Stack Trace ---\\n\${error.stack}\`;
                }
                postError(fullMessage);
                return true;
              };
              window.addEventListener('unhandledrejection', function(event) {
                let reason = event.reason;
                let message = '[Unhandled Promise Rejection]';
                if (reason instanceof Error) {
                  message += \`: \${reason.message}\\n--- Stack Trace ---\\n\${reason.stack}\`;
                } else {
                  try {
                    message += \`: \${JSON.stringify(reason)}\`;
                  } catch(e) {
                    message += \`: \${String(reason)}\`;
                  }
                }
                postError(message);
              });
              const originalConsoleError = console.error;
              console.error = function(...args) {
                const messageParts = args.map(arg => {
                  if (arg instanceof Error) {
                    return \`Error: \${arg.message}\\n--- Stack Trace ---\\n\${arg.stack}\`;
                  }
                  try {
                    return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
                  } catch (e) {
                    return 'Unserializable object';
                  }
                });
                const combinedMessage = messageParts.join(' ');
                postError(\`[Console Error] \${combinedMessage}\`);
                originalConsoleError.apply(console, args);
              };
            } catch(e) {
              window.parent.postMessage({
                type: 'sandbox-error',
                message: 'CRITICAL: Failed to initialize preview error handler. ' + (e ? e.message : 'Unknown error'),
              }, '*');
            }

            // --- VibeCode Tooling Listener ---
            try {
              window.addEventListener('message', async (event) => {
                const { type, requestId } = event.data;

                if (type === 'capture-preview-state') {
                    try {
                        const video = document.querySelector('video');
                        let videoFrameDataUrl = null;
                        let videoFrameRect = null;
                        
                        if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                            const bitmap = await createImageBitmap(video);
                            const canvas = document.createElement('canvas');
                            canvas.width = video.videoWidth;
                            canvas.height = video.videoHeight;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) throw new Error('Could not get canvas context');
                            ctx.drawImage(bitmap, 0, 0);
                            videoFrameDataUrl = canvas.toDataURL('image/png');
                            const rect = video.getBoundingClientRect();
                            videoFrameRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
                        }

                        const htmlContent = document.documentElement.innerHTML;

                        window.parent.postMessage({ 
                            type: 'preview-state-captured', 
                            requestId,
                            payload: { videoFrameDataUrl, videoFrameRect, htmlContent }
                        }, '*');

                    } catch (e) {
                        const message = e instanceof Error ? e.message : String(e);
                        window.parent.postMessage({ type: 'preview-state-error', requestId, message }, '*');
                    }

                } else if (type === 'interact-with-element') {
                    const { selector, action, value } = event.data.payload;
                    try {
                        const element = document.querySelector(selector);
                        if (!element) {
                            throw new Error(\`Element not found with selector: "\${selector}"\`);
                        }

                        switch (action) {
                            case 'click':
                                if (typeof element.click === 'function') element.click();
                                else throw new Error('Element is not clickable.');
                                break;
                            case 'type':
                                if (typeof value === 'undefined') throw new Error('A "value" must be provided for the "type" action.');
                                if ('value' in element) {
                                    element.value = value;
                                    element.dispatchEvent(new Event('input', { bubbles: true }));
                                    element.dispatchEvent(new Event('change', { bubbles: true }));
                                } else throw new Error('Element does not have a "value" property to type into.');
                                break;
                            case 'focus':
                                if (typeof element.focus === 'function') element.focus();
                                else throw new Error('Element is not focusable.');
                                break;
                            case 'blur':
                                if (typeof element.blur === 'function') element.blur();
                                else throw new Error('Element cannot be blurred.');
                                break;
                            default:
                                throw new Error(\`Unsupported action: "\${action}"\`);
                        }
                        
                        window.parent.postMessage({ type: 'interaction-success', requestId, message: \`Action "\${action}" performed on "\${selector}" successfully.\` }, '*');

                    } catch (e) {
                        const message = e instanceof Error ? e.message : String(e);
                        window.parent.postMessage({ type: 'interaction-error', requestId, message }, '*');
                    }
                }
              });
            } catch (e) {
              window.parent.postMessage({
                type: 'sandbox-error',
                message: 'CRITICAL: Failed to initialize VibeCode tooling listener. ' + (e ? e.message : 'Unknown error'),
              }, '*');
            }
          </script>
        `;

        const bundledScript = `<script type="module">${result.code}</script>`;
        let finalHtml = files[activeHtmlFile] || '<body></body>';
        
        if (finalHtml.includes('</head>')) {
            finalHtml = finalHtml.replace('</head>', `${sandboxScripts}</head>`);
        } else {
            finalHtml = sandboxScripts + finalHtml;
        }
        
        const scriptTagRegex = /<script[^>]+src="[^"]+"[^>]*type="module"[^>]*><\/script>/i;
        if (scriptTagRegex.test(finalHtml)) {
            finalHtml = finalHtml.replace(scriptTagRegex, bundledScript);
        } else if (finalHtml.includes('</body>')) {
            finalHtml = finalHtml.replace('</body>', `${bundledScript}</body>`);
        } else {
            finalHtml += bundledScript;
        }

        setIframeContent(finalHtml);
        setShowLogs(false); // Hide logs on successful build
      }
      setIsBundling(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [files, activeHtmlFile, setBundleLogs, setSandboxErrors]);
  
  const buildHasFailed = !isBundling && iframeContent === '';
  
  const handleSendToAi = () => {
    onSendErrorToAi(sandboxErrors);
    setSandboxErrors([]); // Clear errors after sending
  };

  const handleDismissError = () => {
    setSandboxErrors([]);
  };

  return (
    <div className="relative flex flex-col flex-1 bg-vibe-panel rounded-lg overflow-hidden h-full">
      {isFullScreen ? (
         <div className="absolute top-0 left-0 right-0 h-8 bg-vibe-bg-deep/80 backdrop-blur-sm z-10 flex justify-end items-center px-2">
            <button onClick={onToggleFullScreen} className="text-vibe-text-secondary hover:text-vibe-text">
              <CompressIcon className="w-5 h-5" />
            </button>
        </div>
      ) : (
        <div className="relative flex items-center p-2 bg-vibe-bg-deep flex-shrink-0 border-b border-vibe-panel">
            <div className="flex space-x-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="flex-1 text-center text-sm text-vibe-comment">
              {activeHtmlFile ? (
                <select
                  value={activeHtmlFile}
                  onChange={(e) => setActiveHtmlFile(e.target.value)}
                  className="bg-vibe-bg-deep border border-vibe-panel rounded-md px-2 py-1 text-vibe-text-secondary focus:ring-2 focus:ring-vibe-accent focus:outline-none appearance-none"
                  aria-label="Select preview file"
                >
                  {htmlFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
              ) : (
                <span>No HTML files found</span>
              )}
            </div>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-3">
                <button 
                    onClick={() => setShowLogs(prev => !prev)}
                    className="text-xs px-2 py-1 rounded bg-vibe-panel hover:bg-vibe-comment text-vibe-text-secondary"
                >
                    {showLogs ? 'Hide Logs' : 'Show Logs'}
                </button>
                <button onClick={onToggleFullScreen} className="text-vibe-text-secondary hover:text-vibe-text">
                    <ExpandIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
      )}
      
      <div className="flex-1 flex flex-col bg-vibe-bg-deep overflow-hidden">
        <div className="flex-1 relative">
            {isBundling && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-vibe-bg-deep text-vibe-text-secondary z-10">
                    <SpinnerIcon className="w-8 h-8" />
                    <p className="mt-4 text-lg">Building preview...</p>
                </div>
            )}
            {buildHasFailed && (
                <div className="absolute inset-0 p-4 font-mono text-sm text-vibe-text-secondary">
                    <h3 className="font-bold text-red-400 mb-2">Build Failed</h3>
                    <p>The preview could not be rendered. See logs for details.</p>
                </div>
            )}
             <iframe
              id="preview-iframe"
              srcDoc={iframeContent}
              title="Live Preview"
              className={`w-full h-full flex-1 border-0 transition-opacity duration-300 ${isBundling || buildHasFailed ? 'opacity-0' : 'opacity-100'}`}
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-presentation allow-same-origin"
              allow="camera; microphone; geolocation; encrypted-media; display-capture"
            />
        </div>

        {showLogs && (
            <div className="flex-shrink-0 h-2/5 border-t border-vibe-panel p-4 font-mono text-sm bg-vibe-bg-deep overflow-auto">
                <h3 className={`font-bold mb-2 flex items-center ${
                    isBundling ? 'text-vibe-accent' : buildHasFailed ? 'text-red-400' : 'text-green-400'
                }`}>
                    {isBundling && <SpinnerIcon className="w-4 h-4 mr-2" />}
                    {isBundling ? 'Bundling...' : buildHasFailed ? 'Build Failed' : 'Build Successful'}
                </h3>
                <pre className="whitespace-pre-wrap text-xs text-vibe-text-secondary">{bundleLogs.join('\n')}</pre>
            </div>
        )}
      </div>
      
      {sandboxErrors.length > 0 && (
        <div className="absolute inset-0 bg-vibe-bg/80 backdrop-blur-sm z-20 flex items-center justify-center p-4">
          <div className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-red-500/30">
            <header className="flex items-center justify-between p-3 border-b border-vibe-bg-deep flex-shrink-0">
              <h2 className="text-lg font-bold text-red-400">Runtime Error Detected</h2>
            </header>
            <div className="overflow-auto p-4 flex-1">
              <pre className="text-sm text-vibe-text-secondary whitespace-pre-wrap font-mono">
                {sandboxErrors.join('\n\n')}
              </pre>
            </div>
            <footer className="p-3 border-t border-vibe-bg-deep flex items-center justify-end gap-3 flex-shrink-0">
              <button
                onClick={handleDismissError}
                className="bg-vibe-bg-deep px-4 py-2 rounded-md text-sm text-vibe-text-secondary hover:bg-vibe-comment transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleSendToAi}
                className="bg-vibe-accent px-5 py-2 rounded-md text-sm text-white font-semibold hover:bg-vibe-accent-hover transition-colors flex items-center gap-2"
              >
                {isLive ? <MicrophoneIcon className="w-4 h-4" /> : <SendIcon className="w-4 h-4" />}
                {isLive ? 'Send to Live AI' : 'Ask AI to Fix'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviewView;
