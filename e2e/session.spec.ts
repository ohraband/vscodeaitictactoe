import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  createPrivateRoom,
  enterAs,
  expectNoSeriousA11yViolations,
  uniqueName,
} from './helpers';

test('a guest onboards, renames, keeps a theme, and sees a friendly 404', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Make your move.' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByLabel('Display name').fill('A');
  await page.getByRole('button', { name: /Start playing/i }).click();
  await expect(page.getByText(/too small/i)).toBeVisible();

  const name = uniqueName('Sess');
  const renamed = `${name} renamed`;
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /Start playing/i }).click();
  await expect(page.getByRole('heading', { name: 'Pick your table.' })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pick your table.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();

  await page.getByRole('button', { name: /Profile menu for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename player' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Display name').fill(renamed);
  await dialog.getByRole('button', { name: 'Save name' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: new RegExp(`Profile menu for ${renamed}`) }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pick your table.' })).toBeVisible();
  await expect(page.getByText(`Welcome back, ${renamed}`)).toBeVisible();

  await page.goto('/not-a-page');
  await expect(page).toHaveURL(/\/not-found$/);
  await expect(page.getByRole('heading', { name: 'This square is empty.' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('a game is only visible to its participants', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterAs(pageA, uniqueName('Owner'));
    await createPrivateRoom(pageA);
    const gameId = pageA.url().split('/').at(-1) ?? '';

    await enterAs(pageB, uniqueName('Outsider'));
    await pageB.goto(`/play/${gameId}`);
    await expect(pageB.getByRole('heading', { name: 'This game is not yours' })).toBeVisible();
    await expect(
      pageB.getByText('Only the two players in a game can open its board.'),
    ).toBeVisible();

    await pageB.goto('/play/00000000-0000-4000-8000-000000000000');
    await expect(pageB.getByRole('heading', { name: 'Game not found' })).toBeVisible();

    await expectNoSeriousA11yViolations(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
