import '@fontsource-variable/inter';
import './styles/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiError } from './api/client';
import { App } from './App';
import { ErrorBoundary } from './components/ui/error-boundary';
import { ToastProvider } from './components/ui/toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found.');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider delayDuration={250}>
            <ToastProvider>
              <App />
            </ToastProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
