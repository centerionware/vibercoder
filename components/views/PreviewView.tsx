import React, { useState, useEffect } from 'react';
import { bundleCode } from '../../utils/bundler';
import SpinnerIcon from '../icons/SpinnerIcon';
import ExpandIcon from '../icons/ExpandIcon';
import CompressIcon from '../icons/CompressIcon';

interface PreviewViewProps {
  files: Record<string, string>;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  bundleLogs: string[];
  setBundleLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setSandboxErrors: React.Dispatch<React.SetStateAction<string[]>>;
}

const PreviewView: React.FC<PreviewViewProps> = ({ files, isFullScreen, onToggleFullScreen, bundleLogs, setBundleLogs, setSandboxErrors }) => {
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
    
    const entryPoint = activeHtmlFile.replace(/\.html$/, '.tsx');

    const timer = setTimeout(async () => {
      setIsBundling(true);
      setShowLogs(true);
      setIframeContent('');
      setBundleLogs([]);

      const onLog = (message: string) => {
        setBundleLogs(prev => [...prev, message]);
      };
      
      if (!files[entryPoint]) {
          onLog(`--- BUILD FAILED ---`);
          onLog(`Entry point not found for ${activeHtmlFile}.`);
          onLog(`Please create a corresponding "${entryPoint}" file.`);
          setIsBundling(false);
          return;
      }

      const result = await bundleCode(files, entryPoint, onLog);

      if (result.error) {
        onLog('\n--- BUILD FAILED ---');
        onLog(result.error);
      } else {
        // A new build has succeeded, so any previous runtime errors are now obsolete.
        // Clearing them here prevents a race condition where the AI tries to read stale errors
        // that were cleared at the *start* of the build process.
        setSandboxErrors([]);

        const html = files[activeHtmlFile] || '<body></body>';

        // This script is injected into the preview iframe to catch runtime errors
        // and forward them to the main application for display and AI debugging.
        const errorHandlingScript = `
          <script>
            try {
              const postError = (message) => {
                // Use a consistent prefix to make logs easily searchable
                window.parent.postMessage({ type: 'sandbox-error', message }, '*');
              };

              // 1. Catch synchronous errors and script load errors
              window.onerror = function(message, source, lineno, colno, error) {
                let fullMessage = \`[Runtime Error] \${message}\`;
                if (source) {
                  const sourceFile = source.split('/').pop();
                  fullMessage += \` at \${sourceFile}:\${lineno}:\${colno}\`;
                }
                // The error object often has a more detailed stack, which is invaluable.
                if (error && error.stack) {
                  fullMessage += \`\\n--- Stack Trace ---\\n\${error.stack}\`;
                }
                postError(fullMessage);
                return true; // Prevents the default browser error console message
              };

              // 2. Catch unhandled promise rejections (for async errors)
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

              // 3. Intercept console.error to catch framework-specific errors (e.g., from React)
              const originalConsoleError = console.error;
              console.error = function(...args) {
                const messageParts = args.map(arg => {
                  if (arg instanceof Error) {
                    return \`Error: \${arg.message}\\n--- Stack Trace ---\\n\${arg.stack}\`;
                  }
                  try {
                    // Pretty-print objects for better readability
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
              // Failsafe in case the error handler itself has an issue.
              window.parent.postMessage({
                type: 'sandbox-error',
                message: 'CRITICAL: Failed to initialize preview error handler. ' + (e ? e.message : 'Unknown error'),
              }, '*');
            }
          </script>
        `;

        const bundledScript = `<script type="module">${result.code}</script>`;
        
        let finalHtml = html;
        
        // Inject the error handler into the head to catch errors as early as possible.
        if (finalHtml.includes('</head>')) {
            finalHtml = finalHtml.replace('</head>', `${errorHandlingScript}</head>`);
        } else {
            // If no head, prepend to the document.
            finalHtml = errorHandlingScript + finalHtml;
        }
        
        // Inject the main application script at the end of the body.
        if (finalHtml.includes('</body>')) {
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
              srcDoc={iframeContent}
              title="Live Preview"
              className={`w-full h-full flex-1 border-0 transition-opacity duration-300 ${isBundling || buildHasFailed ? 'opacity-0' : 'opacity-100'}`}
              sandbox="allow-scripts"
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
    </div>
  );
};

export default PreviewView;