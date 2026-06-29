'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white p-6 rounded-lg shadow-lg">
            <h1 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-sm text-slate-600 mb-4">
              A rendering error occurred in the application. Try clearing your local storage or refreshing the page.
            </p>
            <div className="bg-red-50 p-4 rounded-md overflow-auto max-h-48 mb-4">
              <pre className="text-xs text-red-800 font-mono">
                {this.state.error?.toString()}
              </pre>
            </div>
            <div className="flex gap-4">
              <Button onClick={() => window.location.reload()} className="flex-1">
                Refresh Page
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/login';
                }}
                className="flex-1"
              >
                Clear Data & Login
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
