import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

export type CreateGameInput =
  | { readonly mode: 'single'; readonly difficulty: 'easy' | 'medium' | 'hard' }
  | { readonly mode: 'multi'; readonly visibility?: 'private' | 'public' };

export interface ApiGame {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly version: number;
  readonly board: readonly (string | null)[];
  readonly winningLine: readonly number[] | null;
}

async function postGame(page: Page, path: string, data?: unknown): Promise<ApiGame> {
  const response = await page.request.post(path, data === undefined ? {} : { data });

  if (!response.ok()) {
    throw new Error(`POST ${path} failed with ${response.status()}: ${await response.text()}`);
  }

  return ((await response.json()) as { game: ApiGame }).game;
}

export async function createGameViaApi(page: Page, input: CreateGameInput): Promise<ApiGame> {
  return postGame(page, '/api/games', input);
}

export async function joinGameViaApi(page: Page, code: string): Promise<ApiGame> {
  return postGame(page, '/api/games/join', { code });
}

export async function moveGameViaApi(
  page: Page,
  gameId: string,
  cell: number,
  expectedVersion: number,
): Promise<ApiGame> {
  return postGame(page, `/api/games/${gameId}/moves`, { cell, expectedVersion });
}

export async function leaveGameViaApi(page: Page, gameId: string): Promise<ApiGame> {
  return postGame(page, `/api/games/${gameId}/leave`);
}

export async function createFinishedSoloGame(page: Page): Promise<ApiGame> {
  let game = await createGameViaApi(page, { mode: 'single', difficulty: 'easy' });

  for (let turn = 0; turn < 9 && game.status === 'active'; turn += 1) {
    const cell = game.board.findIndex((value) => value === null);

    if (cell < 0) break;

    game = await moveGameViaApi(page, game.id, cell, game.version);
  }

  if (game.status !== 'finished') {
    throw new Error(`Solo game ${game.id} did not finish.`);
  }

  return game;
}

export async function seedMultiplayerWin(winner: Page, loser: Page): Promise<ApiGame> {
  const created = await createGameViaApi(loser, { mode: 'multi', visibility: 'private' });
  await joinGameViaApi(winner, created.code);

  return leaveGameViaApi(loser, created.id);
}

let nameCounter = 0;

export function uniqueName(prefix: string): string {
  nameCounter += 1;

  return `${prefix} ${Date.now().toString(36).slice(-5)}${nameCounter}`;
}

export async function enterAs(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your move.' })).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /Start playing/i }).click();
  await expect(page.getByRole('heading', { name: 'Pick your table.' })).toBeVisible();
}

export async function createPrivateRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Create private room' }).click();
  await expect(page.getByRole('heading', { name: 'Your private table' })).toBeVisible();

  const copyButton = page.getByRole('button', { name: /^Copy room code [A-Z0-9]{6}$/ });
  await expect(copyButton).toBeVisible();
  const label = await copyButton.getAttribute('aria-label');

  if (!label) throw new Error('Room code copy button has no accessible label.');

  return label.replace('Copy room code ', '');
}

export async function waitForCell(page: Page, name: string): Promise<void> {
  const cell = page.getByRole('button', { name });
  await expect(cell).toBeVisible();
  await expect(cell).toHaveAttribute('aria-disabled', 'false');
}

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(
    serious.map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
