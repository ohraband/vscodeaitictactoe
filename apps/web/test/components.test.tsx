// @vitest-environment happy-dom
import './setup';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Board } from '../src/components/game/board';
import { GameSidebar } from '../src/components/game/game-sidebar';
import { OnboardingPage } from '../src/pages/onboarding-page';
import { makeGame, makeMultiplayerGame, playerO, playerX } from './fixtures';

function renderSidebar(
  game = makeGame(),
  options: {
    presence?: Record<string, boolean>;
    connection?: 'connected' | 'disconnected';
  } = {},
) {
  const onReconnect = vi.fn();

  render(
    <GameSidebar
      game={game}
      me={playerX}
      connection={options.connection ?? 'connected'}
      presence={options.presence ?? {}}
      onLeave={vi.fn()}
      onRematch={vi.fn()}
      rematchLoading={false}
      onReconnect={onReconnect}
    />,
  );

  return { onReconnect };
}

describe('Board', () => {
  it('calls onMove for an empty cell', () => {
    const onMove = vi.fn();
    render(<Board board={Array(9).fill(null)} onMove={onMove} />);

    const cell = screen.getByRole('button', { name: 'Row 1, column 1: empty' });
    expect(cell).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(cell);

    expect(onMove).toHaveBeenCalledWith(0);
  });

  it('blocks clicks while disabled or occupied', () => {
    const onMove = vi.fn();
    const { rerender } = render(<Board board={Array(9).fill(null)} onMove={onMove} disabled />);

    fireEvent.click(screen.getByRole('button', { name: 'Row 1, column 1: empty' }));
    expect(onMove).not.toHaveBeenCalled();

    rerender(
      <Board board={['X', null, null, null, null, null, null, null, null]} onMove={onMove} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Row 1, column 1: X' }));

    expect(onMove).not.toHaveBeenCalled();
  });

  it('supports roving keyboard focus', () => {
    render(<Board board={Array(9).fill(null)} onMove={vi.fn()} />);

    const first = screen.getByRole('button', { name: 'Row 1, column 1: empty' });
    const second = screen.getByRole('button', { name: 'Row 1, column 2: empty' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: 'Row 2, column 2: empty' })).toHaveFocus();
  });

  it('keeps existing marks mounted when the latest move changes', () => {
    const board = ['X', 'O', null, null, null, null, null, null, null] as const;
    const { rerender } = render(<Board board={board} lastMove={0} onMove={vi.fn()} />);

    const firstMark = screen
      .getByRole('button', { name: 'Row 1, column 1: X' })
      .querySelector('svg');
    const secondMark = screen
      .getByRole('button', { name: 'Row 1, column 2: O' })
      .querySelector('svg');

    rerender(<Board board={board} lastMove={1} onMove={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Row 1, column 1: X' }).querySelector('svg')).toBe(
      firstMark,
    );
    expect(screen.getByRole('button', { name: 'Row 1, column 2: O' }).querySelector('svg')).toBe(
      secondMark,
    );
    expect(secondMark?.querySelector('circle')?.getAttribute('style')).toContain('mark-draw');
  });

  it('renders a read-only board with an accessible summary', () => {
    render(
      <Board
        board={['X', null, 'O', null, 'X', null, 'O', null, 'X']}
        winningLine={[0, 4, 8]}
        label="Completed board"
      />,
    );

    expect(
      screen.getByRole('img', {
        name: /Completed board: cell 1 X, cell 2 empty, cell 3 O/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('GameSidebar', () => {
  it('shows the computer as the solo opponent', () => {
    renderSidebar(makeGame({ playerO: null }));

    expect(screen.getByText('Computer')).toBeInTheDocument();
    expect(screen.getByText('Easy AI')).toBeInTheDocument();
    expect(screen.getByText('Make your move')).toBeInTheDocument();
    expect(screen.queryByText('Waiting for rival')).not.toBeInTheDocument();
  });

  it('invites opponents to a private waiting room with the room code', () => {
    renderSidebar(
      makeMultiplayerGame({
        status: 'waiting',
        playerO: null,
        startedAt: null,
        turnDeadline: null,
      }),
    );

    expect(screen.getByText('Invite a rival')).toBeInTheDocument();
    expect(screen.getByText('ABC234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy room code ABC234' })).toBeInTheDocument();
  });

  it('describes public waiting rooms as matchmaking', () => {
    renderSidebar(
      makeMultiplayerGame({
        status: 'waiting',
        visibility: 'public',
        playerO: null,
        startedAt: null,
        turnDeadline: null,
      }),
    );

    expect(screen.getByText('Finding a rival')).toBeInTheDocument();
    expect(screen.getByText('Waiting for a challenger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy room code/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Matchmaking')).toHaveLength(2);
  });

  it('shows live multiplayer presence', () => {
    const game = makeMultiplayerGame({ turn: 'O' });
    renderSidebar(game, {
      presence: { [playerX.id]: true, [playerO.id]: true },
    });

    expect(screen.getByText('Both players are here')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper is thinking')).toBeInTheDocument();
  });

  it('offers a retry when the socket disconnects', () => {
    const { onReconnect } = renderSidebar(makeMultiplayerGame(), {
      connection: 'disconnected',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Live connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});

describe('OnboardingPage', () => {
  it('validates the display name before creating a session', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <OnboardingPage />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText('Display name');
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: /Start playing/i }));

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/too small/i);
  });
});
