import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  createPrivateRoom,
  enterAs,
  expectNoSeriousA11yViolations,
  uniqueName,
  waitForCell,
} from './helpers';

test('two guests play a private room in realtime', async ({ browser }) => {
  const contextA = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const contextB = await browser.newContext({ baseURL: BASE_URL, reducedMotion: 'reduce' });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterAs(pageA, uniqueName('Ada'));
    const code = await createPrivateRoom(pageA);

    await enterAs(pageB, uniqueName('Grace'));
    await pageB.getByLabel('Room code').fill(code);
    await pageB.getByRole('button', { name: 'Join' }).click();

    await expect(pageB.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageA.getByRole('heading', { name: 'Head to head' })).toBeVisible();
    await expect(pageA.getByText('Both players are here')).toBeVisible();
    await expect(pageB.getByText('Both players are here')).toBeVisible();

    await waitForCell(pageA, 'Row 2, column 2: empty');
    await pageA.getByRole('button', { name: 'Row 2, column 2: empty' }).click();

    await expect(pageA.getByRole('button', { name: 'Row 2, column 2: X' })).toBeVisible();
    await expect(pageB.getByRole('button', { name: 'Row 2, column 2: X' })).toBeVisible();

    await waitForCell(pageB, 'Row 1, column 1: empty');
    await pageB.getByRole('button', { name: 'Row 1, column 1: empty' }).click();

    await expect(pageB.getByRole('button', { name: 'Row 1, column 1: O' })).toBeVisible();
    await expect(pageA.getByRole('button', { name: 'Row 1, column 1: O' })).toBeVisible();
    await expect(pageA.getByText('Your turn', { exact: true })).toBeVisible();

    await expectNoSeriousA11yViolations(pageA);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
