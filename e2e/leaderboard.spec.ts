import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  enterAs,
  expectNoSeriousA11yViolations,
  seedMultiplayerWin,
  uniqueName,
} from './helpers';

test('a qualified player appears on the leaderboard and is highlighted', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const nameA = uniqueName('RankedA');
    await enterAs(pageA, nameA);
    await enterAs(pageB, uniqueName('RankedB'));

    for (let game = 0; game < 5; game += 1) {
      const finished = await seedMultiplayerWin(pageA, pageB);
      expect(finished.status).toBe('finished');
    }

    await pageA.goto('/leaderboard');
    await expect(pageA.getByRole('heading', { name: 'The leaderboard.' })).toBeVisible();
    await expect(pageA.getByText('Min 5 games')).toBeVisible();
    await expect(pageA.getByText(/Casual guest leaderboard/)).toBeVisible();

    const row = pageA.getByRole('row').filter({ hasText: nameA });
    await expect(row).toBeVisible();
    await expect(row.getByText('You')).toBeVisible();
    await expect(row).toContainText('100%');

    await expectNoSeriousA11yViolations(pageA);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
