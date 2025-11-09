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
// FIX: The ErrorBoundary component requires a `children` prop. Wrapping the <App /> component inside <ErrorBoundary> provides the necessary children and correctly sets up the error boundary for the application.
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);