import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';


// Polyfill the global Buffer object for libraries like isomorphic-git
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// Fix: The ErrorBoundary component requires a 'children' prop. This is fixed by wrapping the <App /> component.
root.render(
  <React.StrictMode>
    {/* FIX: Wrapped the <App /> component inside <ErrorBoundary> to provide the required 'children' prop. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);