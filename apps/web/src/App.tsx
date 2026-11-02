import { Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './api/queries';
import { AppShell } from './components/layout/app-shell';
import { ErrorState } from './components/ui/states';
import { Logo } from './components/ui/logo';
import { GamePage } from './pages/game-page';
import { HistoryPage } from './pages/history-page';
import { LeaderboardPage } from './pages/leaderboard-page';
import { LobbyPage } from './pages/lobby-page';
import { NotFoundPage } from './pages/not-found-page';
import { OnboardingPage } from './pages/onboarding-page';
import { ReplayPage } from './pages/replay-page';

function SessionLoading() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex flex-col items-center">
        <Logo className="size-12 animate-pulse" />
        <p className="mt-4 text-sm text-muted">Setting the board…</p>
      </div>
    </main>
  );
}

export function App() {
  const session = useMe();

  if (session.isPending) return <SessionLoading />;

  if (session.isError) {
    return (
      <main className="px-4 py-10">
        <ErrorState
          title="Could not reach the game"
          description={
            session.error instanceof Error
              ? session.error.message
              : 'Check that the API is running and try again.'
          }
          onRetry={() => void session.refetch()}
        />
      </main>
    );
  }

  if (!session.data) return <OnboardingPage />;

  return (
    <Routes>
      <Route element={<AppShell player={session.data} />}>
        <Route index element={<LobbyPage player={session.data} />} />
        <Route path="play/:gameId" element={<GamePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="history/:gameId" element={<ReplayPage />} />
        <Route path="leaderboard" element={<LeaderboardPage player={session.data} />} />
        <Route path="not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Route>
    </Routes>
  );
}
