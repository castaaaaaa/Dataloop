import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Copy, Check } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleCopy = () => {
    const errorDetails = [
      this.state.error?.name || 'Error',
      this.state.error?.message || 'Unknown error',
      this.state.error?.stack || '',
      this.state.errorInfo?.componentStack || ''
    ].join('\n\n');

    navigator.clipboard.writeText(errorDetails).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-screen w-full flex items-center justify-center p-4 font-sans"
          style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}
        >
          <div
            className="w-full max-w-lg p-6 rounded-lg border shadow-lg space-y-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--status-danger)'
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="p-2 rounded-full shrink-0"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--status-danger)'
                }}
              >
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Application Error
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  An unexpected error occurred during rendering. Details are below:
                </p>
              </div>
            </div>

            <div
              className="p-3 rounded border text-xs font-mono break-all whitespace-pre-wrap max-h-48 overflow-y-auto"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--status-danger)'
              }}
            >
              <strong>{this.state.error?.name || 'Error'}: </strong>
              {this.state.error?.message || 'An unknown runtime error occurred'}
              {this.state.error?.stack && (
                <div className="mt-2 text-[10px] opacity-75">
                  {this.state.error.stack.split('\n').slice(1, 4).join('\n')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded text-xs font-medium cursor-pointer transition-colors"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-text)'
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="h-8 px-3 rounded border text-xs font-medium cursor-pointer"
                style={{
                  borderColor: 'var(--border-main)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-raised)'
                }}
              >
                Try Again
              </button>

              <button
                type="button"
                onClick={this.handleCopy}
                className="inline-flex items-center gap-1 h-8 px-3 rounded border text-xs font-medium cursor-pointer ml-auto"
                style={{
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-card)'
                }}
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Error</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
