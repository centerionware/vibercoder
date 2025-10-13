

import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { isNativeEnvironment } from './utils/environment';
import { capacitorFetch, electronFetch } from './services/nativeFetch';
import { Capacitor } from '@capacitor/core';


// Polyfill fetch for native environments to bypass WebView restrictions.
// This allows libraries like esbuild-wasm (running on the main thread) to fetch remote resources.
if (isNativeEnvironment()) {
  const originalFetch = window.fetch;
  (window as any).fetch = (url: string | URL, options?: RequestInit): Promise<Response> => {
    const urlString = url.toString();
    // Only intercept http/https requests.
    if (urlString.startsWith('http')) {
      if (Capacitor.isNativePlatform()) {
        return capacitorFetch(url, options);
      }
      if (window.electron?.isElectron) {
        return electronFetch(url, options);
      }
    }
    // For all other cases (e.g., data URLs), use the original browser fetch.
    return originalFetch.call(window, url, options);
  };
}


// Polyfill the global Buffer object for libraries like isomorphic-git
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* FIX: The <App /> component must be a child of <ErrorBoundary> to be caught by it and to satisfy its 'children' prop requirement. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);