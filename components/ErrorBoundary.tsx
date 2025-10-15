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
  // Initialize state as a class property.
  public state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
    // FIX: Explicitly bind event handlers to 'this' in the constructor. This ensures that 'this.setState' and 'this.props' refer to the component instance, even when the handlers are called by a global event listener (window).
    this.handleError = this.handleError.bind(this);
    this.handleRejection = this.handleRejection.bind(this);
  }

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

  // FIX: Converted from an arrow function property to a standard class method.
  private handleError(event: ErrorEvent): void {
    console.error("Global uncaught error:", event.error);
    event.preventDefault();
    const error = event.error instanceof Error ? event.error : new Error(JSON.stringify(event.error ?? 'An unknown error occurred'));
    this.setState({ hasError: true, error });
  }

  // FIX: Converted from an arrow function property to a standard class method.
  private handleRejection(event: PromiseRejectionEvent): void {
    console.error("Global unhandled rejection:", event.reason);
    event.preventDefault();
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
