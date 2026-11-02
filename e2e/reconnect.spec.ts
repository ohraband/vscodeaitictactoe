import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  createPrivateRoom,
  enterAs,
  expectNoSeriousA11yViolations,
  uniqueName,
  waitForCell,
} from './helpers';

test('a guest reconnects after going offline and can keep playing', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterAs(pageA, uniqueName('RecA'));
    const code = await createPrivateRoom(pageA);
    await enterAs(pageB, uniqueName('RecB'));
    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join' }).click();

    await expect(pageA.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageB.getByText('Both players are here')).toBeVisible();

    await contextA.setOffline(true);
    await expect(pageA.getByText('Live connection lost')).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText(/Opponent is offline/)).toBeVisible({ timeout: 15_000 });

    await contextA.setOffline(false);
    const retry = pageA.getByRole('button', { name: 'Retry now' });

    if (await retry.isVisible().catch(() => false)) {
      await retry.click();
    }

    await expect(pageA.getByText('Live connection lost')).not.toBeVisible({ timeout: 15_000 });
    await expect(pageA.getByText('Both players are here')).toBeVisible({ timeout: 15_000 });
    await expect(pageB.getByText('Both players are here')).toBeVisible({ timeout: 15_000 });

    await waitForCell(pageA, 'Row 2, column 2: empty');
    await pageA.getByRole('button', { name: 'Row 2, column 2: empty' }).click();
    await expect(pageB.getByRole('button', { name: 'Row 2, column 2: X' })).toBeVisible();

    await expectNoSeriousA11yViolations(pageA);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
