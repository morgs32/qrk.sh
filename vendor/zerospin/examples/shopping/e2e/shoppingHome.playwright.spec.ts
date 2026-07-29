import { expect, test } from '@playwright/test';

import type {} from '@zerospin/react/ZerospinConfig';

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

test('SharedWorker push applies inverse deletes without reentering SQLite', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const targetedRuntimeFailures: string[] = [];

  // 1 — Capture the thrown, logged, and rendered forms of the original fault.
  // Unrelated Clerk or Next development warnings do not fail this regression.
  page.on('pageerror', error => {
    targetedRuntimeFailures.push(error.message);
  });
  page.on('console', message => {
    if (
      message.type() === 'error' &&
      /FiberFailure|drizzle-transaction-failed|database disk image is malformed|account-frontend|durable-stage/.test(
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
        'ZerospinConfig did not install the DevTools console API.',
      );
    }
    await window.zerospin.devtools.open();
  });

  const basicTShirtCard = page
    .locator('[data-slot="card"]')
    .filter({ hasText: 'Basic T-Shirt' });
  const addBasicTShirt = basicTShirtCard.getByRole('button', {
    name: 'Add to cart',
    exact: true,
  });

  // 2 — The authenticated actor persists between runs. Converge only this
  // product to absent through the SharedWorker-owned push path before starting
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
  // authoritative empty state produced by the SharedWorker.
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(addBasicTShirt).toBeVisible();

  // A reload creates a new ZerospinConfig lifetime, so it also requires a new
  // explicit console open before this test can manipulate DevTools again.
  await page.evaluate(async () => {
    if (window.zerospin?.devtools === undefined) {
      throw new Error(
        'ZerospinConfig did not install the DevTools console API.',
      );
    }
    await window.zerospin.devtools.open();
  });
  let devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  await expect(devtools).toBeVisible();
  const pushedRoute = devtools.getByRole('button', {
    name: 'Pushed',
    exact: true,
  });
  await pushedRoute.click();
  await expect(pushedRoute).toHaveCSS(
    'background-color',
    'rgb(243, 244, 246)',
  );
  const baselinePushedRemoveCount = await devtools
    .getByRole('cell', {
      name: 'removeFromCart',
      exact: true,
    })
    .count();
  const executedRoute = devtools.getByRole('button', {
    name: 'Executed',
    exact: true,
  });
  await executedRoute.click();
  await expect(executedRoute).toHaveCSS(
    'background-color',
    'rgb(243, 244, 246)',
  );
  const baselineExecutedRemoveCount = await devtools
    .getByRole('cell', {
      name: 'removeFromCart',
      exact: true,
    })
    .count();
  const baselineSettledRemoveCount =
    baselinePushedRemoveCount + baselineExecutedRemoveCount;
  await page
    .getByRole('button', { name: 'Close Zerospin DevTools', exact: true })
    .click();

  // 4 — Stage an optimistic insert and its removal while the SharedWorker owns
  // continuous journal push. Applying the authoritative frontend blocks must
  // rewind the insert with a DELETE without running the live-query SELECT
  // inside sqlite3_step.
  await addBasicTShirt.click();
  await expect(basicTShirtCard.getByRole('button')).toHaveCount(3);
  await basicTShirtCard.getByRole('button').last().click();
  await expect(addBasicTShirt).toBeVisible();

  await page
    .getByRole('button', { name: 'Open Zerospin DevTools', exact: true })
    .click();
  devtools = page.getByRole('region', { name: 'Zerospin DevTools' });

  // 5 — Pushed or Executed means the durable journal settlement block has
  // rewound and reapplied the optimistic mutations. Count both terminal
  // locations because the server may execute the command while this assertion
  // is observing it.
  await expect
    .poll(
      async () => {
        expect(targetedRuntimeFailures).toEqual([]);
        await pushedRoute.click();
        await expect(pushedRoute).toHaveCSS(
          'background-color',
          'rgb(243, 244, 246)',
        );
        const pushedRemoveCount = await devtools
          .getByRole('cell', {
            name: 'removeFromCart',
            exact: true,
          })
          .count();
        await executedRoute.click();
        await expect(executedRoute).toHaveCSS(
          'background-color',
          'rgb(243, 244, 246)',
        );
        const executedRemoveCount = await devtools
          .getByRole('cell', {
            name: 'removeFromCart',
            exact: true,
          })
          .count();
        return pushedRemoveCount + executedRemoveCount;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(baselineSettledRemoveCount);
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
  await expect(
    page.getByRole('heading', { level: 2, name: 'Products', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

  const devtools = page.getByRole('region', { name: 'Zerospin DevTools' });
  const openDevtools = page.getByRole('button', {
    name: 'Open Zerospin DevTools',
    exact: true,
  });

  // The production application must expose no DevTools UI before the first
  // console request, even though ZerospinConfig and the session are ready.
  await expect(devtools).toHaveCount(0);
  await expect(openDevtools).toHaveCount(0);

  // This is the production escape hatch: it loads one shell into the existing
  // ZerospinConfig React tree and resolves only after that shell is visible.
  await page.evaluate(async () => {
    if (window.zerospin?.devtools === undefined) {
      throw new Error(
        'ZerospinConfig did not install the DevTools console API.',
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
    devtools.getByRole('cell', { name: 'shopper', exact: true }),
  ).toBeVisible({ timeout: 90_000 });

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
    profilerRoute.evaluate(element =>
      element.nextElementSibling?.textContent?.trim(),
    ),
  ).resolves.toBe('Shared Worker');
  await sharedWorkerRoute.click();
  const sharedWorkerRoot = page.locator(
    '[data-testid^="shared-worker-root-"]',
  );
  await expect(sharedWorkerRoot).toHaveCount(1);
  await expect(
    sharedWorkerRoot.getByRole('region', {
      name: 'Account frontend replicas',
    }),
  ).toBeVisible();
  await expect(
    sharedWorkerRoot.getByRole('region', {
      name: 'Service frontend replicas',
    }),
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
