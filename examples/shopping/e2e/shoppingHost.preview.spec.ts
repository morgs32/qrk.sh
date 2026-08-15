import { expect, test } from '@playwright/test';

test('production host serves and reloads the sign-in route', async ({
  page,
}) => {
  const response = await page.request.get('/signin');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');

  await page.goto('/signin');
  await expect(page).toHaveURL(/\/signin/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Sign in to Zerospin Shopping',
      exact: true,
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/signin/);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Sign in to Zerospin Shopping',
      exact: true,
    }),
  ).toBeVisible();
});
