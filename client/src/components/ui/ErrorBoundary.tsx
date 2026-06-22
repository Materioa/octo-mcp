import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive my-2">
          <h3 className="font-semibold mb-1">Something went wrong while rendering</h3>
          <p className="opacity-80 break-words">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
