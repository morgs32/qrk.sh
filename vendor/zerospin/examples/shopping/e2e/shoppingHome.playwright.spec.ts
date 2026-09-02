import { expect, test } from '@playwright/test';
import '@zerospin/react/makeZerospinApp';

test('signed-out user is redirected to sign in', async ({ browser }) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page).toHaveURL(/\/signin/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Sign in to Zerospin Shopping',
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

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
  const main = page.getByRole('main');
  await expect(main.getByText('Basic T-Shirt', { exact: true })).toBeVisible();
  await expect(
    main.getByText('Canvas Backpack', { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText('Wireless Headphones', { exact: true }),
  ).toBeVisible();
  await expect(main.getByText('Water Bottle', { exact: true })).toBeVisible();
  await expect(main.getByText('Lined Notebook', { exact: true })).toBeVisible();
  await expect(
    main.getByText('Ceramic Coffee Mug', { exact: true }),
  ).toBeVisible();
  await expect(main.getByText('LED Desk Lamp', { exact: true })).toBeVisible();
  await expect(main.getByText('Mouse Pad', { exact: true })).toBeVisible();
  await expect(
    main.getByText('USB-C Cable (2m)', { exact: true }),
  ).toBeVisible();
  await expect(main.getByText('Fleece Hoodie', { exact: true })).toBeVisible();
  await expect(
    main.getByText('Polarized Sunglasses', { exact: true }),
  ).toBeVisible();
  await expect(main.getByText('Yoga Mat', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open cart', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Cart', { exact: true })).toBeVisible();
});

test('main-thread push applies inverse deletes without reentering SQLite', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const targetedRuntimeFailures: string[] = [];

  // 1 — Capture the thrown, logged, and rendered forms of the original fault.
  // Unrelated Clerk or Vite development warnings do not fail this regression.
  page.on('pageerror', error => {
    targetedRuntimeFailures.push(error.message);
  });
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      /drizzle-transaction-failed|database disk image is malformed|account-frontend/.test(
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

  // DevTools is deliberately absent from the production application tree
  // until this console-equivalent call loads and opens the shell.
  await page.evaluate(async () => {
    if (window.zerospin?.devtools === undefined) {
      throw new Error(
        'ZerospinApp.Provider did not install the DevTools console API.',
      );
    }
    await window.zerospin.devtools.open();
  });

  let devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  await expect(devtools).toBeVisible();
  await devtools
    .getByRole('button', {
      name: 'Close Zerospin DevTools',
      exact: true,
    })
    .click();
  await expect(devtools).toBeHidden();

  const basicTShirtCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: 'Basic T-Shirt' });
  const addBasicTShirt = basicTShirtCard.getByRole('button', {
    name: 'Add to cart',
    exact: true,
  });

  // 2 — The authenticated actor persists between runs. Converge only this
  // product to absent through the main-thread push path before starting
  // the precise add/remove regression.
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
  }

  // 3 — Reload after convergence so the regression starts from the
  // authoritative empty state produced by the frontend session.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(addBasicTShirt).toBeVisible();

  // A reload creates a new ZerospinApp.Provider lifetime, so it also requires a new
  // explicit console open before this test can manipulate DevTools again.
  await page.evaluate(async () => {
    if (window.zerospin?.devtools === undefined) {
      throw new Error(
        'ZerospinApp.Provider did not install the DevTools console API.',
      );
    }
    await window.zerospin.devtools.open();
  });
  devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  await expect(devtools).toBeVisible();
  const aggregateSessionRow = devtools
    .getByRole('cell', { name: 'shopper/web', exact: true })
    .locator('..');
  await expect(aggregateSessionRow).toHaveCount(1);
  await expect(
    aggregateSessionRow.getByRole('cell', {
      name: 'aggregate',
      exact: true,
    }),
  ).toBeVisible();
  const aggregateSessionId = (
    await aggregateSessionRow.locator('td').nth(2).innerText()
  ).trim();
  await aggregateSessionRow.click();
  await devtools.getByRole('link', { name: 'Commands', exact: true }).click();
  const commandTable = devtools
    .getByRole('columnheader', {
      name: 'commandName',
      exact: true,
    })
    .locator('xpath=ancestor::table');
  const baselineCommandIds = new Set(
    (
      await commandTable.locator('tbody tr td:first-child').allTextContents()
    ).map(commandId => commandId.trim()),
  );

  try {
    await devtools
      .getByRole('button', { name: 'Pause push', exact: true })
      .click();
    await expect(devtools.getByText('paused', { exact: true })).toBeVisible();
    await devtools
      .getByRole('button', {
        name: 'Close Zerospin DevTools',
        exact: true,
      })
      .click();
    await expect(devtools).toBeHidden();

    // 4 — Apply an optimistic insert and its removal while the exact
    // main-thread push lane is paused. Applying the authoritative command must
    // rewind the insert with a DELETE without running the live-query SELECT
    // inside sqlite3_step.
    await addBasicTShirt.click();
    await expect(basicTShirtCard.getByRole('button')).toHaveCount(3);
    await basicTShirtCard.getByRole('button').last().click();

    await page
      .getByRole('button', { name: 'Open Zerospin DevTools', exact: true })
      .click();
    await expect(devtools).toBeVisible();
    await devtools.getByRole('link', { name: 'Sessions', exact: true }).click();
    const currentAggregateSessionRow = devtools
      .getByRole('cell', { name: 'shopper/web', exact: true })
      .locator('..');
    await expect(currentAggregateSessionRow).toHaveCount(1);
    await expect(currentAggregateSessionRow.locator('td').nth(2)).toHaveText(
      aggregateSessionId,
    );
    await currentAggregateSessionRow.click();
    await devtools.getByRole('link', { name: 'Commands', exact: true }).click();
    const removeCommandRows = commandTable
      .getByRole('cell', {
        name: 'removeFromCart',
        exact: true,
      })
      .locator('..');
    await expect
      .poll(
        async () =>
          (await removeCommandRows.locator('td:first-child').allTextContents())
            .map(commandId => commandId.trim())
            .filter(commandId => !baselineCommandIds.has(commandId)).length,
        { timeout: 30_000 },
      )
      .toBe(1);
    const newRemoveCommandIds = (
      await removeCommandRows.locator('td:first-child').allTextContents()
    )
      .map(commandId => commandId.trim())
      .filter(commandId => !baselineCommandIds.has(commandId));
    expect(newRemoveCommandIds).toHaveLength(1);
    const removeCommandId = newRemoveCommandIds[0];
    if (removeCommandId === undefined) {
      throw new Error('The removeFromCart command ID was not journaled');
    }
    await expect(
      removeCommandRows
        .locator('td:first-child')
        .filter({ hasText: removeCommandId }),
    ).toBeVisible();

    await devtools
      .getByRole('button', { name: 'Push now', exact: true })
      .click();
    await expect(devtools.getByText('pushed', { exact: true })).toBeVisible();

    // 5 — The exact remove command remains one retained journal occurrence as
    // its push and finalization indexes settle.
    await devtools.getByRole('link', { name: 'Sessions', exact: true }).click();
    await currentAggregateSessionRow.click();
    await devtools.getByRole('link', { name: 'Commands', exact: true }).click();
    await expect
      .poll(
        async () => {
          expect(targetedRuntimeFailures).toEqual([]);
          return (
            await commandTable
              .locator('tbody tr td:first-child')
              .allTextContents()
          ).filter(commandId => commandId.trim() === removeCommandId).length;
        },
        { timeout: 30_000 },
      )
      .toBe(1);
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
  } finally {
    if (!page.isClosed()) {
      await page.evaluate(async () => {
        if (window.zerospin?.devtools === undefined) {
          throw new Error(
            'ZerospinApp.Provider did not install the DevTools console API.',
          );
        }
        await window.zerospin.devtools.open();
      });
      devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
      await expect(devtools).toBeVisible();
      await devtools.getByRole('link', { name: 'Sessions', exact: true }).click();
      const cleanupSessionRow = devtools
        .getByRole('cell', { name: 'shopper/web', exact: true })
        .locator('..');
      await cleanupSessionRow.click();
      await devtools.getByRole('link', { name: 'Commands', exact: true }).click();
      const resumePush = devtools.getByRole('button', {
        name: 'Resume push',
        exact: true,
      });
      if (await resumePush.isVisible()) {
        await resumePush.click();
      }
      await devtools
        .getByRole('button', {
          name: 'Close Zerospin DevTools',
          exact: true,
        })
        .click();
      await expect(devtools).toBeHidden();
    }
  }
});

test('Zerospin DevTools uses one routed React shell', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  const devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  const openDevtools = page.getByRole('button', {
    name: 'Open Zerospin DevTools',
    exact: true,
  });

  // The production application must expose no DevTools UI before the first
  // console request, even though ZerospinApp.Provider and the session are ready.
  await expect(devtools).toHaveCount(0);
  await expect(openDevtools).toHaveCount(0);

  // This is the production escape hatch: it loads one shell into the existing
  // ZerospinApp.Provider React tree and resolves only after that shell is visible.
  await page.evaluate(async () => {
    if (window.zerospin?.devtools === undefined) {
      throw new Error(
        'ZerospinApp.Provider did not install the DevTools console API.',
      );
    }
    await window.zerospin.devtools.open();

    const openedPanel = document.querySelector(
      'section[aria-label="Zerospin DevTools"]',
    );
    if (
      !(openedPanel instanceof HTMLElement) ||
      window.getComputedStyle(openedPanel).visibility !== 'visible'
    ) {
      throw new Error(
        'The DevTools console Promise resolved before its panel was visible.',
      );
    }
  });
  await expect(devtools).toBeVisible({ timeout: 90_000 });
  await expect(
    devtools.getByRole('cell', { name: 'shopper/web', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  const sessionsRoute = page.getByRole('link', {
    name: 'Sessions',
    exact: true,
  });
  const profilerRoute = page.getByRole('link', {
    name: 'Profiler',
    exact: true,
  });
  await expect(sessionsRoute).toHaveAttribute('aria-current', 'page', {
    timeout: 90_000,
  });
  await expect(profilerRoute).toBeVisible();

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
  await expect(devtools).toBeHidden();
  await expect(openDevtools).toBeVisible();

  // Once loaded, the ordinary trigger reopens the same routed shell rather
  // than creating a second shell or resetting its in-memory Settings route.
  await openDevtools.click();
  await expect(devtools).toBeVisible();
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
