import type { PublicPlayer } from '@ttt/contracts';
import { History, House, Moon, Sun, Trophy } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { useThemeStore } from '../../stores/theme-store';
import { Wordmark } from '../ui/logo';
import { ProfileMenu } from './profile-menu';

const navigation = [
  { to: '/', label: 'Lobby', icon: House, end: true },
  { to: '/history', label: 'History', icon: History, end: false },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy, end: false },
] as const;

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        'grid place-items-center rounded-xl border border-line bg-panel/55 text-muted transition hover:border-line-strong hover:bg-panel-raised hover:text-fg',
        compact ? 'size-9' : 'size-9',
      )}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function AppShell({ player }: { player: PublicPlayer }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" aria-label="Tic-Tac-Toe lobby" className="rounded-xl">
            <Wordmark />
          </NavLink>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {navigation.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-panel-raised text-fg'
                      : 'text-muted hover:bg-panel/60 hover:text-fg',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ProfileMenu player={player} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-10">
        <Outlet />
      </main>

      <footer className="mx-auto hidden w-full max-w-6xl px-6 pb-6 text-xs text-subtle md:block">
        <div className="flex items-center justify-between border-t border-line/70 pt-4">
          <span>Guest sessions. No accounts, no noise.</span>
          <span>Built for the love of the grid.</span>
        </div>
      </footer>

      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[0.65rem] font-semibold transition',
                  isActive ? 'bg-panel-raised text-fg' : 'text-muted',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
