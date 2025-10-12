import React from 'react';
import { db } from '../utils/idb';

interface ErrorFallbackProps {
  error: Error;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error }) => {
  
  const handleReset = async () => {
    try {
      console.warn("Resetting application state due to critical error...");
      
      // Clear IndexedDB
      // Fix: Cast 'db' to 'any' to allow calling Dexie's 'delete' method, resolving a TypeScript type error.
      await (db as any).delete();
      console.warn("IndexedDB has been cleared.");
      
      // Clear localStorage
      localStorage.clear();
      console.warn("localStorage has been cleared.");
      
      // Reload the page
      window.location.reload();
    } catch (e) {
      console.error("Failed to reset application state:", e);
      alert("Could not fully reset the application. Please try clearing your browser's site data manually for this domain.");
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

        <p className="text-sm text-vibe-comment mb-4">
          You can try reloading the page. If the problem persists, the most reliable solution is to reset the application's stored data. This will clear all chat history and settings.
        </p>

        <button
          onClick={handleReset}
          className="w-full bg-red-600 text-white font-bold py-3 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-vibe-panel focus:ring-red-500"
        >
          Reset Application & Reload
        </button>
      </div>
    </div>
  );
};

export default ErrorFallback;