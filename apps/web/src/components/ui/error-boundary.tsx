import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled React error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-dvh place-items-center px-4">
          <div className="surface max-w-md rounded-3xl p-8 text-center">
            <p className="eyebrow text-danger">Unexpected error</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">The board got scrambled.</h1>
            <p className="mt-3 text-sm leading-6 text-muted">
              Reload the page to start a fresh session. Your finished games are still stored
              server-side.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg"
            >
              Reload app
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
