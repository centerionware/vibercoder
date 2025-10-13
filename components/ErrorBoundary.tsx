

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
  public state: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };

    // The explicit binding is no longer necessary because the handler methods
    // have been converted to arrow functions, which lexically bind `this`.
  }

  // This is the standard React error boundary method for render-phase errors
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // This is for logging errors that were caught by getDerivedStateFromError
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("React ErrorBoundary caught:", error, errorInfo);
  }
  
  // Add global listeners when the component mounts to act as a final safety net
  componentDidMount() {
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  // Clean up global listeners when the component unmounts
  componentWillUnmount() {
    window.removeEventListener('error', this.handleError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
  }

  // FIX: Converted to an arrow function to ensure `this` is correctly bound when called as a window event listener.
  // This resolves the error "Property 'setState' does not exist on type 'ErrorBoundary'".
  private handleError = (event: ErrorEvent) => {
    console.error("Global uncaught error:", event.error);
    this.setState({ hasError: true, error: event.error });
  }

  // FIX: Converted to an arrow function to ensure `this` is correctly bound when called as a window event listener.
  // This also resolves the "Property 'setState' does not exist" error.
  private handleRejection = (event: PromiseRejectionEvent) => {
    console.error("Global unhandled rejection:", event.reason);
    // Coerce the reason to an Error object if it's not one already
    const error = event.reason instanceof Error ? event.reason : new Error(JSON.stringify(event.reason));
    this.setState({ hasError: true, error });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
