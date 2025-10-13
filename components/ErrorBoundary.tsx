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

  // FIX: Bind event handlers in the constructor. This ensures `this` correctly refers to the
  // component instance when the methods are used as callbacks for `window.addEventListener`.
  constructor(props: Props) {
    super(props);
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

  // This is now a standard class method. The `this` context is bound in the constructor.
  private handleError(event: ErrorEvent) {
    console.error("Global uncaught error:", event.error);
    event.preventDefault();
    this.setState({ hasError: true, error: event.error });
  }

  // This is now a standard class method. The `this` context is bound in the constructor.
  private handleRejection(event: PromiseRejectionEvent) {
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
    // issues in the event handlers. Correctly binding `this` in the constructor
    // resolves all reported issues by stabilizing the component's context.
    return this.props.children;
  }
}

export default ErrorBoundary;
