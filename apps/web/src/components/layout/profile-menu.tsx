import { displayNameSchema, type PublicPlayer } from '@ttt/contracts';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Pencil, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useRenamePlayer } from '../../api/queries';
import { Button } from '../ui/button';
import { FieldError, Input } from '../ui/form';
import { Modal } from '../ui/modal';
import { useToast } from '../ui/toast';

export function ProfileMenu({ player }: { player: PublicPlayer }) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [displayName, setDisplayName] = useState(player.displayName);
  const [error, setError] = useState<string | null>(null);
  const rename = useRenamePlayer();
  const { toast } = useToast();
  const initial = player.displayName.slice(0, 1).toUpperCase();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsed = displayNameSchema.safeParse(displayName);

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose a display name.');
      return;
    }

    rename.mutate(parsed.data, {
      onSuccess: () => {
        setRenameOpen(false);
        toast({ title: 'Name updated', tone: 'success' });
      },
      onError: (mutationError) => {
        setError(
          mutationError instanceof ApiError && mutationError.code === 'NAME_TAKEN'
            ? 'That name is already playing. Pick another one.'
            : mutationError.message,
        );
      },
    });
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-xl border border-line bg-panel/55 px-2 pr-2.5 text-sm transition hover:border-line-strong hover:bg-panel-raised"
          >
            <span className="sr-only">Profile menu for</span>
            <span
              aria-hidden="true"
              className="grid size-6 place-items-center rounded-lg bg-accent text-[0.65rem] font-bold text-accent-fg"
            >
              {initial}
            </span>
            <span className="hidden max-w-28 truncate font-medium sm:block">
              {player.displayName}
            </span>
            <ChevronDown className="size-3.5 text-muted" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            align="end"
            className="surface z-50 min-w-56 rounded-2xl p-1.5 shadow-lift"
          >
            <div className="rounded-xl px-3 py-2.5">
              <p className="text-sm font-semibold">{player.displayName}</p>
              <p className="mt-0.5 text-xs text-muted">Guest player</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item
              onSelect={() => {
                setDisplayName(player.displayName);
                setError(null);
                setRenameOpen(true);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted outline-none transition data-[highlighted]:bg-panel-raised data-[highlighted]:text-fg"
            >
              <Pencil className="size-3.5" />
              Rename player
            </DropdownMenu.Item>
            <DropdownMenu.Item
              disabled
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-subtle"
            >
              <UserRound className="size-3.5" />
              Guest session · 30 days
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Modal
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename player"
        description="Only the name changes. Your games and history stay with this guest session."
      >
        <form onSubmit={submit} noValidate>
          <label htmlFor="rename-player" className="mb-2 block text-sm font-medium">
            Display name
          </label>
          <Input
            id="rename-player"
            autoFocus
            maxLength={20}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
            aria-invalid={Boolean(error)}
          />
          <FieldError>{error ?? undefined}</FieldError>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={rename.isPending}>
              Save name
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
