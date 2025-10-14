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

  // FIX: Use an arrow function for the event handler. This automatically binds `this`
  // to the component instance, ensuring that `this.setState` is defined and can be called.
  private handleError = (event: ErrorEvent) => {
    console.error("Global uncaught error:", event.error);
    event.preventDefault();
    this.setState({ hasError: true, error: event.error });
  }

  // FIX: Use an arrow function for the event handler to ensure correct `this` binding.
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
    
    // FIX: The `render` method is called by React with the correct context, so `this.props`
    // is correctly available. The reported error was likely a cascade from the event handler type issues.
    return this.props.children;
  }
}

export default ErrorBoundary;