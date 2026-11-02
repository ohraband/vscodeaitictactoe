import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

interface ModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly hideClose?: boolean;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideClose = false,
}: ModalProps) {
  const descriptionId = useId();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            'dialog-content surface fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 outline-none sm:p-7',
            className,
          )}
          {...(description
            ? { 'aria-describedby': descriptionId }
            : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <Dialog.Title className="text-balance text-xl font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description
                  id={descriptionId}
                  className="mt-1.5 text-sm leading-6 text-muted"
                >
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            {hideClose ? null : (
              <Dialog.Close
                aria-label="Close dialog"
                className="-mt-1 -mr-1 rounded-lg p-2 text-muted transition hover:bg-panel-raised hover:text-fg"
              >
                <X className="size-4" />
              </Dialog.Close>
            )}
          </div>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly loading?: boolean;
  readonly destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading = false,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
