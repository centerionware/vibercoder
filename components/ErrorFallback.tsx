import React, { useState } from 'react';
import { db } from '../utils/idb';
import { getDebugLogs } from '../utils/logging';
import { safeLocalStorage } from '../utils/environment';

interface ErrorFallbackProps {
  error: Error;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error }) => {
  const [showLogs, setShowLogs] = useState(false);
  const logs = getDebugLogs();
  
  const handleReset = async () => {
    try {
      console.warn("Resetting application state due to critical error...");
      
      // Clear IndexedDB
      await (db as any).delete();
      console.warn("IndexedDB has been cleared.");
      
      // Clear localStorage
      safeLocalStorage.clear();
      console.warn("localStorage has been cleared.");
      
      // Reload the page
      window.location.reload();
    } catch (e) {
      console.error("Failed to reset application state:", e);
      alert("Could not fully reset the application. Please try clearing your browser's site data manually for this domain.");
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleResetWithConfirmation = async () => {
    if (window.confirm("Are you sure you want to reset the application? This will delete all projects, chat history, and settings. This action cannot be undone.")) {
      await handleReset();
    }
  };


  return (
    <div className="bg-vibe-bg-deep text-vibe-text h-screen w-screen flex flex-col items-center justify-center p-4 font-sans">
      <div className="bg-vibe-panel p-8 rounded-lg shadow-2xl max-w-2xl w-full border border-red-500/30">
        <h1 className="text-2xl font-bold text-red-400 mb-4">Oops! Application Error</h1>
        <p className="text-vibe-text-secondary mb-6">The application encountered a critical error and could not continue. This might be due to corrupted data from a previous session or an unexpected bug.</p>
        
        <div className="bg-vibe-bg-deep p-4 rounded-md mb-6">
          <h3 className="font-semibold text-vibe-text mb-2">Error Details:</h3>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono break-all max-h-60 overflow-y-auto">
            {error.message}\n\n{error.stack}
          </pre>
        </div>

        {logs.length > 0 && (
            <div className="mb-4">
                <button onClick={() => setShowLogs(p => !p)} className="text-sm text-vibe-accent hover:underline">
                    {showLogs ? 'Hide' : 'Show'} Debug Log
                </button>
                {showLogs && (
                    <div className="mt-2 bg-vibe-bg-deep p-4 rounded-md">
                        <pre className="text-xs text-vibe-text-secondary whitespace-pre-wrap font-mono break-all max-h-60 overflow-y-auto">
                            {logs.map((log, i) => 
                                `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.level.toUpperCase()}] ${log.message}`
                            ).join('\n')}
                        </pre>
                    </div>
                )}
            </div>
        )}

        <p className="text-sm text-vibe-comment mb-4">
          You can try reloading the page. If the problem persists, the most reliable solution is to reset the application's stored data. This will clear all chat history and settings.
        </p>
        
        <div className="flex flex-col gap-4 mt-6">
            <button
                onClick={handleReload}
                className="w-full bg-vibe-accent text-white font-bold py-3 rounded-md hover:bg-vibe-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-vibe-panel focus:ring-vibe-accent"
            >
                Reload Page
            </button>
            <button
                onClick={handleResetWithConfirmation}
                className="w-full text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 py-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-vibe-panel focus:ring-red-500"
            >
                Reset Application & Data
            </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorFallback;
