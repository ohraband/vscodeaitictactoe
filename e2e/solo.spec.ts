import { expect, test } from '@playwright/test';
import { enterAs, expectNoSeriousA11yViolations, uniqueName, waitForCell } from './helpers';

test('a guest starts a solo game and exchanges moves with the computer', async ({ page }) => {
  await enterAs(page, uniqueName('Solo'));
  await expectNoSeriousA11yViolations(page);
  await expect(page.getByRole('button', { name: 'Start solo game' })).toBeVisible();

  await page.getByRole('button', { name: 'Start solo game' }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Solo vs computer' })).toBeVisible();
  await expect(page.getByText('Computer', { exact: true })).toBeVisible();
  await expect(page.getByText('Easy AI', { exact: true })).toBeVisible();

  await waitForCell(page, 'Row 2, column 2: empty');
  await page.getByRole('button', { name: 'Row 2, column 2: empty' }).click();

  await expect(page.getByRole('button', { name: 'Row 2, column 2: X' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Row \d, column \d: O/ })).toHaveCount(1);
  await expect(page.getByText('Your turn', { exact: true })).toBeVisible();
  await expect(page.getByText('Make your move')).toBeVisible();
  await expect(page.getByText('Live connection lost')).not.toBeVisible();

  await expectNoSeriousA11yViolations(page);
});
