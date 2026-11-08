import type { CreateGameRequest, PublicPlayer } from '@ttt/contracts';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { api, type GameListFilters } from './client';

export const queryKeys = {
  me: ['me'] as const,
  config: ['config'] as const,
  games: ['games'] as const,
  gameList: (filters: GameListFilters) => ['games', 'list', filters] as const,
  game: (gameId: string) => ['games', 'detail', gameId] as const,
  leaderboard: ['leaderboard'] as const,
};

export function useAppConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: api.getConfig,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: api.me,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useCreateSession(): UseMutationResult<PublicPlayer, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.createSession,
    onSuccess: (player) => {
      queryClient.setQueryData(queryKeys.me, player);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games });
    },
  });
}

export function useRenamePlayer(): UseMutationResult<PublicPlayer, Error, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.rename,
    onSuccess: (player) => {
      queryClient.setQueryData(queryKeys.me, player);
      void queryClient.invalidateQueries({ queryKey: queryKeys.games });
    },
  });
}

export function useGameList(filters: GameListFilters = {}) {
  return useQuery({
    queryKey: queryKeys.gameList(filters),
    queryFn: () => api.listGames(filters),
    placeholderData: (previous) => previous,
  });
}

export function useGameDetail(gameId: string) {
  return useQuery({
    queryKey: queryKeys.game(gameId),
    queryFn: () => api.getGame(gameId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: queryKeys.leaderboard,
    queryFn: () => api.leaderboard(),
  });
}

function useInvalidateGames(): () => void {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.games });
  };
}

export function useCreateGame(): UseMutationResult<
  Awaited<ReturnType<typeof api.createGame>>,
  Error,
  CreateGameRequest
> {
  const invalidateGames = useInvalidateGames();

  return useMutation({
    mutationFn: api.createGame,
    onSuccess: invalidateGames,
  });
}

export function useJoinGame(): UseMutationResult<
  Awaited<ReturnType<typeof api.joinGame>>,
  Error,
  string
> {
  const invalidateGames = useInvalidateGames();

  return useMutation({
    mutationFn: api.joinGame,
    onSuccess: invalidateGames,
  });
}

export function useQuickMatch(): UseMutationResult<
  Awaited<ReturnType<typeof api.quickMatch>>,
  Error,
  void
> {
  const invalidateGames = useInvalidateGames();

  return useMutation({
    mutationFn: api.quickMatch,
    onSuccess: invalidateGames,
  });
}
