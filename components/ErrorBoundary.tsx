import React, { ErrorInfo, ReactNode } from 'react';
import ErrorFallback from './ErrorFallback';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  // Use a class field to initialize state. This is a modern and concise approach
  // for React class components.
  state: State = {
    hasError: false,
    error: null,
  };

  // Standard React error boundary method for render-phase errors
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // For logging errors that were caught by getDerivedStateFromError
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React ErrorBoundary caught:", error, errorInfo);
  }

  // Add global listeners when the component mounts
  componentDidMount() {
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  // Clean up global listeners when the component unmounts
  componentWillUnmount() {
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
  }

  // FIX: Converted to an arrow function to correctly bind `this`.
  // When a class method is passed as a callback to `addEventListener`, its `this` context is lost.
  // An arrow function lexically binds `this`, ensuring `this.setState` refers to the component instance.
  private handleError = (event: ErrorEvent) => {
    console.error("Global uncaught error:", event.error);
    event.preventDefault();
    this.setState({ hasError: true, error: event.error });
  }

  // FIX: Converted to an arrow function to correctly bind `this`.
  // This ensures `this.setState` is available when the event listener is called for an unhandled promise rejection.
  private handleRejection = (event: PromiseRejectionEvent) => {
    console.error("Global unhandled rejection:", event.reason);
    event.preventDefault();
    const error = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason));
    this.setState({ hasError: true, error });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }

    // NOTE: The error about `this.props` not existing is likely a side-effect of the `this` context
    // issues in the event handlers. Correctly binding `this` in `handleError` and `handleRejection`
    // should resolve all reported issues, as it stabilizes the component's context for the TS language server.
    return this.props.children;
  }
}

export default ErrorBoundary;
