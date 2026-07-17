import { expect, test } from '@playwright/test';

test('signed-in user can view the parking dashboard', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/signin/);
  await expect(
    page.getByRole('link', { name: 'Zerospin Parking', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('heading', { level: 2, name: 'Provider View', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('heading', { level: 2, name: 'Driver View', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Destinations', { exact: true })).toBeVisible();
  await expect(page.getByText('Carparks', { exact: true })).toBeVisible();
  await expect(page.getByText('Garages', { exact: true })).toBeVisible();
  await expect(page.getByText('Cars', { exact: true })).toBeVisible();
});
