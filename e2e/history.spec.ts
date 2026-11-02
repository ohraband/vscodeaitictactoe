import { expect, test } from '@playwright/test';
import {
  createFinishedSoloGame,
  createGameViaApi,
  enterAs,
  expectNoSeriousA11yViolations,
  leaveGameViaApi,
  uniqueName,
} from './helpers';

test('a finished game appears in history and can be replayed', async ({ page }) => {
  await enterAs(page, uniqueName('Replay'));
  const game = await createFinishedSoloGame(page);

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Your record.' })).toBeVisible();

  const replayLink = page.getByRole('link', { name: new RegExp(game.code) });
  await expect(replayLink).toBeVisible();
  await replayLink.click();

  await expect(page).toHaveURL(new RegExp(`/history/${game.id}$`));
  await expect(page.getByRole('heading', { name: 'Computer · Easy' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Replayed tic-tac-toe board/ })).toBeVisible();

  const scrubber = page.getByRole('slider', { name: 'Replay position' });
  await expect(scrubber).toBeVisible();
  await page.getByRole('button', { name: 'First move' }).click();
  await expect(scrubber).toHaveValue('0');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(scrubber).toHaveValue('1');

  await expectNoSeriousA11yViolations(page);
});

test('history filters modes and statuses and replays abandoned rooms', async ({ page }) => {
  await enterAs(page, uniqueName('Archive'));

  const solo = await createFinishedSoloGame(page);
  const room = await createGameViaApi(page, { mode: 'multi', visibility: 'private' });
  const abandoned = await leaveGameViaApi(page, room.id);

  expect(abandoned.status).toBe('abandoned');

  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Your record.' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(solo.code) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(room.code) })).toBeVisible();

  const modeFilter = page.getByRole('group', { name: 'Filter by mode' });
  await modeFilter.getByRole('button', { name: 'Solo' }).click();
  await expect(page.getByRole('link', { name: new RegExp(solo.code) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(room.code) })).not.toBeVisible();

  await modeFilter.getByRole('button', { name: 'Multiplayer' }).click();
  await expect(page.getByRole('link', { name: new RegExp(room.code) })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(solo.code) })).not.toBeVisible();

  await page.getByLabel('Status').selectOption('finished');
  await expect(page.getByText('No games match those filters')).toBeVisible();

  await page.getByLabel('Status').selectOption('abandoned');
  const abandonedLink = page.getByRole('link', { name: new RegExp(room.code) });
  await expect(abandonedLink).toBeVisible();
  await abandonedLink.click();

  await expect(page).toHaveURL(new RegExp(`/history/${room.id}$`));
  await expect(page.getByText('Replay · Abandoned')).toBeVisible();
  await expect(page.getByText('Unfinished')).toBeVisible();
  await expect(page.getByRole('img', { name: /Replayed tic-tac-toe board/ })).toBeVisible();

  await expectNoSeriousA11yViolations(page);
});
