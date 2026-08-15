import { expect, test } from '@playwright/test';

test('two real pages share one worker while retaining independent sessions and failover', async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(180_000);
  const secondPage = await context.newPage();
  const browserSession = await browser.newBrowserCDPSession();

  try {
    await page.goto('/');
    await page
      .getByRole('heading', { level: 2, name: 'Products', exact: true })
      .waitFor({ state: 'visible', timeout: 90_000 });
    await secondPage.goto('/');
    await secondPage
      .getByRole('heading', { level: 2, name: 'Products', exact: true })
      .waitFor({ state: 'visible', timeout: 90_000 });

    await Promise.all(
      [page, secondPage].map(currentPage =>
        currentPage.evaluate(async () => {
          if (window.zerospin?.devtools === undefined) {
            throw new Error(
              'ZerospinApp.Provider did not install the DevTools console API',
            );
          }
          await window.zerospin.devtools.open();
        }),
      ),
    );
    const firstDevtools = page.getByRole('region', {
      name: 'Zerospin DevTools',
    });
    const secondDevtools = secondPage.getByRole('region', {
      name: 'Zerospin DevTools',
    });
    await Promise.all([
      expect(firstDevtools).toBeVisible(),
      expect(secondDevtools).toBeVisible(),
    ]);

    const firstSessionIds = await firstDevtools
      .locator('table')
      .first()
      .locator('tbody tr td:nth-child(3)')
      .allTextContents();
    const secondSessionIds = await secondDevtools
      .locator('table')
      .first()
      .locator('tbody tr td:nth-child(3)')
      .allTextContents();
    expect(firstSessionIds).toHaveLength(2);
    expect(secondSessionIds).toHaveLength(2);
    expect(new Set([...firstSessionIds, ...secondSessionIds]).size).toBe(4);

    await firstDevtools
      .getByRole('link', { name: 'Shared Worker', exact: true })
      .click();
    const firstAggregateRow = firstDevtools
      .getByRole('region', { name: 'Aggregate frontend replicas' })
      .locator('tbody tr')
      .first();
    const firstServiceRow = firstDevtools
      .getByRole('region', { name: 'Service frontend replicas' })
      .locator('tbody tr')
      .first();
    await expect(firstAggregateRow.locator('td').nth(5)).toHaveText('2');
    await expect(firstServiceRow.locator('td').nth(6)).toHaveText('2');

    const initialTargets = await browserSession.send('Target.getTargets');
    const initialSharedWorkers = initialTargets.targetInfos.filter(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('sharedWorker.bundle.js'),
    );
    expect(initialSharedWorkers).toHaveLength(1);
    const sharedWorkerTargetId = initialSharedWorkers[0]?.targetId;

    const firstCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Basic T-Shirt' });
    const secondCard = secondPage
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Basic T-Shirt' });
    const firstAdd = firstCard.getByRole('button', {
      name: 'Add to cart',
      exact: true,
    });
    const secondAdd = secondCard.getByRole('button', {
      name: 'Add to cart',
      exact: true,
    });
    await expect
      .poll(
        async () =>
          (await firstAdd.isVisible()) ||
          (await firstCard.getByRole('button').count()) === 3,
        { timeout: 90_000 },
      )
      .toBe(true);
    if (!(await firstAdd.isVisible())) {
      await firstCard.getByRole('button').last().click();
      await Promise.all([
        expect(firstAdd).toBeVisible({ timeout: 90_000 }),
        expect(secondAdd).toBeVisible({ timeout: 90_000 }),
      ]);
    }

    await firstAdd.click();
    await Promise.all([
      expect(firstCard.getByText('1', { exact: true })).toBeVisible({
        timeout: 90_000,
      }),
      expect(secondCard.getByText('1', { exact: true })).toBeVisible({
        timeout: 90_000,
      }),
      expect(
        page.getByText('Basic T-Shirt', { exact: true }).first(),
      ).toBeVisible(),
      expect(
        secondPage.getByText('Basic T-Shirt', { exact: true }).first(),
      ).toBeVisible(),
    ]);

    await Promise.all([
      page.waitForEvent('close'),
      page.close({ runBeforeUnload: true }),
    ]);
    await secondDevtools
      .getByRole('link', { name: 'Shared Worker', exact: true })
      .click();
    const secondAggregateRegion = secondDevtools.getByRole('region', {
      name: 'Aggregate frontend replicas',
    });
    const secondServiceRegion = secondDevtools.getByRole('region', {
      name: 'Service frontend replicas',
    });
    await expect(async () => {
      await secondDevtools.getByRole('button', { name: 'Refresh' }).click();
      await expect(
        secondAggregateRegion.locator('tbody tr').first().locator('td').nth(5),
      ).toHaveText('1', { timeout: 500 });
      await expect(
        secondServiceRegion.locator('tbody tr').first().locator('td').nth(6),
      ).toHaveText('1', { timeout: 500 });
    }).toPass({ timeout: 10_000 });
    const retainedTargets = await browserSession.send('Target.getTargets');
    const retainedSharedWorkers = retainedTargets.targetInfos.filter(
      target =>
        target.type === 'shared_worker' &&
        target.url.includes('sharedWorker.bundle.js'),
    );
    expect(retainedSharedWorkers).toHaveLength(1);
    expect(retainedSharedWorkers[0]?.targetId).toBe(sharedWorkerTargetId);

    await secondCard.getByRole('button').nth(1).click();
    await expect(secondCard.getByText('2', { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await Promise.all([
      secondPage.waitForEvent('close'),
      secondPage.close({ runBeforeUnload: true }),
    ]);

    const resumedPage = await context.newPage();
    await resumedPage.goto('/');
    await resumedPage
      .getByRole('heading', { level: 2, name: 'Products', exact: true })
      .waitFor({ state: 'visible', timeout: 90_000 });
    const resumedCard = resumedPage
      .locator('[data-slot="card"]')
      .filter({ hasText: 'Basic T-Shirt' });
    await expect(resumedCard.getByText('2', { exact: true })).toBeVisible({
      timeout: 90_000,
    });

    await resumedPage.evaluate(async () => {
      if (window.zerospin?.devtools === undefined) {
        throw new Error(
          'ZerospinApp.Provider did not install the DevTools console API',
        );
      }
      await window.zerospin.devtools.open();
    });
    const resumedDevtools = resumedPage.getByRole('region', {
      name: 'Zerospin DevTools',
    });
    await resumedDevtools
      .getByRole('link', { name: 'Shared Worker', exact: true })
      .click();
    await expect(
      resumedDevtools
        .getByRole('region', { name: 'Aggregate frontend replicas' })
        .locator('tbody tr')
        .first()
        .locator('td')
        .nth(5),
    ).toHaveText('1');
    await expect(
      resumedCard.getByText('Basic T-Shirt', { exact: true }),
    ).toBeVisible();

    await resumedCard.getByRole('button').last().click();
    await expect(
      resumedCard.getByRole('button', { name: 'Add to cart', exact: true }),
    ).toBeVisible({ timeout: 90_000 });
    await resumedPage.close();
  } finally {
    await browserSession.detach();
    if (!page.isClosed()) await page.close();
    if (!secondPage.isClosed()) await secondPage.close();
  }
});
