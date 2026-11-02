import { expect, test, type Page } from '@playwright/test';
import {
  BASE_URL,
  createPrivateRoom,
  enterAs,
  expectNoSeriousA11yViolations,
  uniqueName,
  waitForCell,
} from './helpers';

async function playCell(page: Page, name: string): Promise<void> {
  await waitForCell(page, name);
  await page.getByRole('button', { name }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(name.replace('empty', '[XO]')) }),
  ).toBeVisible();
}

test('both players can agree to a rematch and symbols swap', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    const nameA = uniqueName('RematchA');
    const nameB = uniqueName('RematchB');
    await enterAs(pageA, nameA);
    const code = await createPrivateRoom(pageA);
    const oldUrl = pageA.url();
    const oldGameId = oldUrl.split('/').at(-1) ?? '';

    await enterAs(pageB, nameB);
    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join' }).click();

    await expect(pageA.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageB.getByRole('heading', { name: 'Head to head' })).toBeVisible();

    await playCell(pageA, 'Row 1, column 1: empty');
    await playCell(pageB, 'Row 1, column 2: empty');
    await playCell(pageA, 'Row 2, column 1: empty');
    await playCell(pageB, 'Row 2, column 2: empty');
    await waitForCell(pageA, 'Row 3, column 1: empty');
    await pageA.getByRole('button', { name: 'Row 3, column 1: empty' }).click();

    const dialogA = pageA.getByRole('dialog');
    const dialogB = pageB.getByRole('dialog');
    await expect(dialogA.getByRole('heading', { name: 'Victory is yours.' })).toBeVisible();
    await expect(dialogB.getByRole('heading', { name: 'That one got away.' })).toBeVisible();

    await dialogA.getByRole('button', { name: 'Request rematch' }).click();
    await expect(dialogA.getByRole('button', { name: 'Rematch requested' })).toBeDisabled();
    await expect(dialogB.getByRole('button', { name: 'Accept rematch' })).toBeVisible();

    await dialogB.getByRole('button', { name: 'Accept rematch' }).click();

    await expect(pageA).not.toHaveURL(new RegExp(oldGameId));
    await expect(pageB).not.toHaveURL(new RegExp(oldGameId));
    await expect(pageA.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageB.getByRole('heading', { name: 'Head to head' })).toBeVisible();

    const newGameIdA = pageA.url().split('/').at(-1) ?? '';
    const newGameIdB = pageB.url().split('/').at(-1) ?? '';
    expect(newGameIdA).toBe(newGameIdB);
    expect(newGameIdA).not.toBe(oldGameId);

    await expect(pageB.getByText('Your turn', { exact: true })).toBeVisible();
    await expect(pageA.getByText("Opponent's turn", { exact: true })).toBeVisible();
    await expect(pageA.getByText(`${nameB} is thinking`)).toBeVisible();
    await expect(pageA.getByRole('button', { name: 'Row 1, column 1: empty' })).toBeVisible();

    await expectNoSeriousA11yViolations(pageA);
    await expectNoSeriousA11yViolations(pageB);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
