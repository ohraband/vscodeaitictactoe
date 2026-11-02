import { expect, test, type Page } from '@playwright/test';
import {
  BASE_URL,
  enterAs,
  expectNoSeriousA11yViolations,
  uniqueName,
  waitForCell,
} from './helpers';

async function startQuickMatch(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Quick match' }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: /Your open table|Head to head/ })).toBeVisible();

  return page.url().split('/').at(-1) ?? '';
}

async function leaveCurrentGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Leave game|Close room)$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^(Forfeit game|Close room)$/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Pick your table.' })).toBeVisible();
}

test('two guests are paired by quick match', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterAs(pageA, uniqueName('QuickA'));

    let waitingGameId = '';

    for (let attempt = 0; attempt < 3 && waitingGameId === ''; attempt += 1) {
      const gameId = await startQuickMatch(pageA);

      if (await pageA.getByRole('heading', { name: 'Your open table' }).isVisible()) {
        waitingGameId = gameId;
        break;
      }

      await leaveCurrentGame(pageA);
    }

    expect(waitingGameId).not.toBe('');
    await expect(pageA.getByText('Finding a rival')).toBeVisible();
    await expect(pageA.getByText('Waiting for a challenger')).toBeVisible();

    await enterAs(pageB, uniqueName('QuickB'));

    let matched = false;

    for (let attempt = 0; attempt < 3 && !matched; attempt += 1) {
      const gameId = await startQuickMatch(pageB);

      if (gameId === waitingGameId) {
        matched = true;
        break;
      }

      await leaveCurrentGame(pageB);
    }

    expect(matched).toBe(true);
    await expect(pageA.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageB.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageA.getByText('Both players are here')).toBeVisible();
    await expect(pageB.getByText('Both players are here')).toBeVisible();

    await waitForCell(pageA, 'Row 2, column 2: empty');
    await pageA.getByRole('button', { name: 'Row 2, column 2: empty' }).click();
    await expect(pageB.getByRole('button', { name: 'Row 2, column 2: X' })).toBeVisible();

    await expectNoSeriousA11yViolations(pageA);
    await expectNoSeriousA11yViolations(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
