import { expect, test } from '@playwright/test';

test('signed-in user can view the authed home page', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/signin/);
  await expect(
    page.getByRole('link', { name: 'Zerospin Shopping', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText('Basic T-Shirt', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Canvas Backpack', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Wireless Headphones', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Water Bottle', { exact: true })).toBeVisible();
  await expect(page.getByText('Lined Notebook', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Ceramic Coffee Mug', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('LED Desk Lamp', { exact: true })).toBeVisible();
  await expect(page.getByText('Mouse Pad', { exact: true })).toBeVisible();
  await expect(
    page.getByText('USB-C Cable (2m)', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Fleece Hoodie', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Polarized Sunglasses', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Yoga Mat', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open cart', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Cart', { exact: true })).toBeVisible();

  const res = await page.request.get('/api/e2e/session-inspection');
  if (res.status() === 404) {
    test.skip(
      true,
      'Session inspection disabled (PLAYWRIGHT_CLAIM_INSPECTION not set on server)',
    );
    return;
  }

  expect(res.ok(), `session-inspection status ${res.status()}`).toBe(true);
  const body = (await res.json()) as {
    userId: string;
  };

  expect(body.userId).toBeTruthy();
  expect(body.userId).toMatch(/^user_/);
});

test('manual push applies inverse deletes without reentering SQLite', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const targetedRuntimeFailures: string[] = [];

  // 1 — Capture the thrown, logged, and rendered forms of the original fault.
  // Unrelated Clerk or Next development warnings do not fail this regression.
  page.on('pageerror', error => {
    if (
      /FiberFailure|drizzle-transaction-failed|database disk image is malformed/.test(
        error.message,
      )
    ) {
      targetedRuntimeFailures.push(error.message);
    }
  });
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      /FiberFailure|drizzle-transaction-failed|database disk image is malformed/.test(
        message.text(),
      )
    ) {
      targetedRuntimeFailures.push(message.text());
    }
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  const basicTShirtCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: 'Basic T-Shirt' });
  const addBasicTShirt = basicTShirtCard.getByRole('button', {
    name: 'Add to cart',
    exact: true,
  });

  // 2 — The authenticated actor persists between runs. Converge only this
  // product to absent before starting the precise add/remove regression.
  let devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  await expect(devtools).toBeVisible({ timeout: 90_000 });
  await devtools.getByRole('checkbox', { name: 'Pause push' }).check();
  await page
    .getByRole('button', { name: 'Close Zerospin DevTools', exact: true })
    .click();

  await expect
    .poll(
      async () =>
        (await addBasicTShirt.isVisible()) ||
        (await basicTShirtCard.getByRole('button').count()) === 3,
    )
    .toBe(true);

  if (!(await addBasicTShirt.isVisible())) {
    await basicTShirtCard.getByRole('button').last().click();
    await expect(addBasicTShirt).toBeVisible();

    await page
      .getByRole('button', { name: 'Open Zerospin DevTools', exact: true })
      .click();
    devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
    const cleanupPush = devtools.getByRole('button', {
      name: 'Push staged commands',
    });
    await expect(cleanupPush).toBeEnabled();
    await cleanupPush.click();
    await expect(
      devtools.getByRole('link', { name: /^Pushed at / }),
    ).toBeVisible({ timeout: 30_000 });
    await devtools
      .getByRole('button', { name: 'Executed', exact: true })
      .click();
    await expect(
      devtools.getByRole('cell', {
        name: 'removeFromCart',
        exact: true,
      }),
    ).toBeVisible({ timeout: 30_000 });
  }

  // 3 — Reload after convergence so executed rows and push feedback belong
  // only to the regression batch below, not a cleanup push from a prior run.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(addBasicTShirt).toBeVisible();

  const openDevtools = page.getByRole('button', {
    name: 'Open Zerospin DevTools',
    exact: true,
  });
  if (await openDevtools.isVisible()) {
    await openDevtools.click();
  }
  devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  await expect(devtools).toBeVisible();
  await devtools.getByRole('checkbox', { name: 'Pause push' }).check();
  await page
    .getByRole('button', { name: 'Close Zerospin DevTools', exact: true })
    .click();

  // 4 — Stage an optimistic insert and its removal in the same paused batch.
  // Applying the authoritative frontend block must rewind that insert with a
  // DELETE without running the live-query SELECT inside sqlite3_step.
  await addBasicTShirt.click();
  await expect(basicTShirtCard.getByRole('button')).toHaveCount(3);
  await basicTShirtCard.getByRole('button').last().click();
  await expect(addBasicTShirt).toBeVisible();

  await page
    .getByRole('button', { name: 'Open Zerospin DevTools', exact: true })
    .click();
  devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  const pushStagedCommands = devtools.getByRole('button', {
    name: 'Push staged commands',
  });
  await expect(pushStagedCommands).toBeEnabled();
  await pushStagedCommands.click();
  await expect(
    devtools.getByRole('link', { name: /^Pushed at / }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(pushStagedCommands).toBeDisabled();

  // 5 — Executed is populated by the authoritative websocket block, so this
  // is the completion barrier for the browser-side inverse transaction.
  await devtools
    .getByRole('button', { name: 'Executed', exact: true })
    .click();
  await expect(
    devtools.getByRole('cell', {
      name: 'removeFromCart',
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });
  expect(targetedRuntimeFailures).toEqual([]);
  await expect(page.locator('body')).not.toContainText(
    'database disk image is malformed',
  );

  // 6 — A fresh session must reconstruct the same authoritative empty state.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(addBasicTShirt).toBeVisible();
  const desktopCart = page.locator(
    '[data-slot="sidebar"][data-side="right"] [data-sidebar="sidebar"]',
  );
  await expect(
    desktopCart.getByText('Basic T-Shirt', { exact: true }),
  ).toHaveCount(0);
  expect(targetedRuntimeFailures).toEqual([]);
});

test('Zerospin DevTools uses one routed React shell', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');

  const sessionsRoute = page.getByRole('link', {
    name: 'Sessions',
    exact: true,
  });
  const profilerRoute = page.getByRole('link', {
    name: 'Profiler',
    exact: true,
  });
  const sharedWorkerRoute = page.getByRole('link', {
    name: 'Shared Worker',
    exact: true,
  });

  await expect(sessionsRoute).toHaveAttribute('aria-current', 'page', {
    timeout: 90_000,
  });
  await expect(profilerRoute).toBeVisible();
  await expect(sharedWorkerRoute).toBeVisible();
  await expect(
    profilerRoute.evaluate(
      element => element.nextElementSibling?.textContent?.trim(),
    ),
  ).resolves.toBe('Shared Worker');
  await sharedWorkerRoute.click();
  await expect(
    page.getByText('Shared Worker is enabled', { exact: true }),
  ).toBeVisible();

  const toolbar = page.getByTestId('zerospin-devtools-toolbar');
  const nativeControls = page.getByTestId('zerospin-devtools-native-controls');
  await expect(nativeControls).toBeVisible();
  await expect(
    nativeControls.evaluate(element => {
      const toolbarRect = element.parentElement?.getBoundingClientRect();
      const controlsRect = element.getBoundingClientRect();
      const controls = Array.from(element.children);
      return {
        rightAligned:
          toolbarRect === undefined
            ? false
            : Math.abs(toolbarRect.right - controlsRect.right) < 1,
        controlSizes: controls.map(control => {
          const controlRect = control.getBoundingClientRect();
          const iconRect = control
            .querySelector('svg')
            ?.getBoundingClientRect();
          return {
            height: controlRect.height,
            iconHeight: iconRect?.height,
            iconWidth: iconRect?.width,
            width: controlRect.width,
          };
        }),
      };
    }),
  ).resolves.toEqual({
    rightAligned: true,
    controlSizes: [
      { height: 32, iconHeight: 18, iconWidth: 18, width: 32 },
      { height: 32, iconHeight: 18, iconWidth: 18, width: 32 },
      { height: 32, iconHeight: 18, iconWidth: 18, width: 32 },
    ],
  });
  await expect(toolbar).toBeVisible();

  const settingsRoute = page.getByRole('link', {
    name: 'Settings',
    exact: true,
  });
  await settingsRoute.click();
  await expect(settingsRoute).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { name: 'General', exact: true }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Close Zerospin DevTools', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open Zerospin DevTools', exact: true })
    .click();
  await expect(settingsRoute).toHaveAttribute('aria-current', 'page');
});

test('cart opens as a drawer below the desktop sidebar breakpoint', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/signin/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  const cartDrawer = page.locator(
    '[data-sidebar="sidebar"][data-mobile="true"]',
  );
  await expect(cartDrawer).toBeHidden();

  await page.getByRole('button', { name: 'Open cart', exact: true }).click();
  await expect(cartDrawer).toBeVisible();
  await expect(cartDrawer.getByText('Cart', { exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(cartDrawer).toBeHidden();
});
