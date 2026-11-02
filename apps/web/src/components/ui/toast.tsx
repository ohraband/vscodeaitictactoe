import * as Toast from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

type ToastTone = 'info' | 'success' | 'error';

interface ToastMessage {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly tone: ToastTone;
  open: boolean;
}

interface ToastInput {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClasses: Record<ToastTone, string> = {
  info: 'border-line-strong',
  success: 'border-success/50',
  error: 'border-danger/60',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    const message: ToastMessage = {
      id,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      tone: input.tone ?? 'info',
      open: true,
    };

    setMessages((current) => [...current.slice(-2), message]);
  }, []);

  const setOpen = useCallback((id: number, open: boolean) => {
    setMessages((current) =>
      open
        ? current.map((message) => (message.id === id ? { ...message, open } : message))
        : current.filter((message) => message.id !== id),
    );
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <Toast.Provider swipeDirection="right" duration={4200}>
        {children}
        {messages.map((message) => (
          <Toast.Root
            key={message.id}
            open={message.open}
            onOpenChange={(open) => setOpen(message.id, open)}
            className={cn(
              'surface toast-item pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 pr-10',
              toneClasses[message.tone],
            )}
          >
            <span
              className={cn(
                'mt-1.5 size-2 shrink-0 rounded-full',
                message.tone === 'success'
                  ? 'bg-success'
                  : message.tone === 'error'
                    ? 'bg-danger'
                    : 'bg-accent',
              )}
            />
            <div className="min-w-0">
              <Toast.Title className="text-sm font-semibold">{message.title}</Toast.Title>
              {message.description ? (
                <Toast.Description className="mt-1 text-sm leading-5 text-muted">
                  {message.description}
                </Toast.Description>
              ) : null}
            </div>
            <Toast.Close
              aria-label="Dismiss notification"
              className="absolute top-3 right-3 rounded-md p-1 text-muted transition hover:bg-panel-raised hover:text-fg"
            >
              <X className="size-4" />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="pointer-events-none fixed right-3 bottom-20 z-[80] flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 outline-none sm:right-5 sm:bottom-5" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.');
  }

  return context;
}
