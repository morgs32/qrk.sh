import { expect, test } from "@playwright/test";

const base = process.env.PLAYWRIGHT_EDITOR_PATH ?? "/e2e/site/e2e/page/home";

test("brick routes retain the bottom shell, grid, and encoded history", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/modules");
  const bottom = page.locator('[data-drawer="bottom"]');
  await expect(bottom).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Breakpoints", exact: true })).toBeVisible();
  await expect(page.locator('[data-drawer="left"]')).toHaveCount(0);
  const shell = await bottom.elementHandle();
  const grid = await page.getByTestId("grid-layout").elementHandle();
  await page.locator("[data-module-link]").first().click();
  await expect(page.getByRole("toolbar", { name: "Breakpoints", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Drawer breadcrumbs" })).toContainText(
    "Modules",
  );
  expect(
    await shell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  await page
    .getByRole("navigation", { name: "Drawer breadcrumbs" })
    .getByRole("link", { name: "Modules", exact: true })
    .click();
  await bottom.getByRole("link", { name: "Close drawer" }).click();
  await expect(bottom).toHaveCount(0);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(bottom).toBeVisible();
  await page.goBack();
  await expect(bottom).toHaveCount(0);
  await page.goForward();
  await expect(bottom).toBeVisible();
  expect(await grid!.evaluate((element) => element.isConnected)).toBe(true);

  await page.goto(base + "/brick/brk_missing%20brick");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Breakpoints", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(base + "/brick/brk_missing%20brick");
  const detailShell = await bottom.elementHandle();
  await page
    .getByRole("navigation", { name: "Drawer breadcrumbs" })
    .getByRole("link", { name: "Modules", exact: true })
    .click();
  expect(
    await detailShell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await bottom.getByRole("link", { name: "Close drawer" }).click();
  await expect(page.getByRole("link", { name: "Add bricks", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`drawer reserves half the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    const editor = page.locator("[data-editor-region]");
    await expect(editor).toBeVisible();
    const fullHeight = await editor.evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole("link", { name: "Add bricks" }).click();
    const bottom = page.locator('[data-drawer="bottom"]');
    await expect
      .poll(() => bottom.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(450);
    await expect
      .poll(() => editor.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(Math.round(fullHeight - 450));
    await expect(page.getByRole("link", { name: "Add bricks" })).toHaveCount(0);
    const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
    await expect(toolbar.getByRole("button")).toHaveText(["sm", "md", "lg", "xl"]);
    await expect
      .poll(async () => {
        const drawerBox = await bottom.boundingBox();
        const toolbarBox = await toolbar.boundingBox();
        return drawerBox && toolbarBox
          ? Math.round(drawerBox.y - toolbarBox.y - toolbarBox.height)
          : null;
      })
      .toBe(24);
    await expect
      .poll(async () => {
        const regionBox = await page.getByTestId("page-preview-region").boundingBox();
        const toolbarBox = await toolbar.boundingBox();
        return regionBox && toolbarBox
          ? Math.abs(regionBox.x + regionBox.width / 2 - toolbarBox.x - toolbarBox.width / 2)
          : Infinity;
      })
      .toBeLessThanOrEqual(1);
    if (width === 390) {
      await expect(toolbar.locator("button:disabled")).toHaveCount(3);
      await expect(page.getByTestId("page-composition")).toBeVisible();
      await expect(page.getByTestId("grid-layout")).toBeVisible();
    }
    await bottom.getByRole("link", { name: "Close drawer" }).click();
    await expect
      .poll(() => editor.evaluate((element) => Math.round(element.getBoundingClientRect().height)))
      .toBe(Math.round(fullHeight));
    await expect(toolbar).toHaveCount(0);
    await expect(page.getByTestId("grid-layout")).toBeVisible();
  });
}

test("breakpoint selection resizes the whole wall without replacing it", async ({ page }) => {
  await page.setViewportSize({ width: 3200, height: 900 });
  await page.goto(base);
  const grid = page.getByTestId("grid-layout");
  await expect(grid).toBeVisible();
  const gridElement = await grid.elementHandle();
  const wallElement = await page
    .getByRole("region", { name: "Brick grid", exact: true })
    .elementHandle();
  const region = page.getByTestId("grid-region");
  const composition = page.getByTestId("page-composition");
  const initialWidth = await region.evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("link", { name: "Add bricks" }).click();
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });

  // Assert rendered widths, so a selected-looking button alone cannot pass.
  for (const [id, pageWidth, wallWidth, wallBreakpoint] of [
    ["sm", 360, 360, "sm"],
    ["md", 720, 720, "md"],
    ["lg", 1080, 1080, "lg"],
    ["xl", 1440, 1440, "xl"],
  ]) {
    const button = toolbar.getByRole("button", { name: `${id} preview width`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => composition.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(pageWidth);
    await expect
      .poll(() => grid.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(wallWidth);
    await expect(grid).toHaveAttribute("data-wall-breakpoint", String(wallBreakpoint));
  }

  await toolbar.getByRole("button", { name: "md preview width", exact: true }).click();
  await page.locator("[data-module-link]").first().click();
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect
    .poll(() => grid.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(720);
  await page.goForward();
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Close drawer", exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await expect
    .poll(() => grid.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(initialWidth);
  expect(await gridElement!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await wallElement!.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Resizing must disable oversized choices and preserve the selected width for recovery.
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(toolbar.locator("button:disabled")).toHaveCount(2);
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => grid.evaluate((element) => element.getBoundingClientRect().width))
    .toBe(720);
  await page.setViewportSize({ width: 3200, height: 900 });
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("page settings shares breakpoint controls; the dedicated route retains its close action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await page.goto(`${base}/page-settings`);
  await expect(page.getByTestId("grid-layout")).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  for (const route of ["site-settings"]) {
    await page.goto(`${base}/${route}`);
    await expect(page.getByTestId("grid-layout")).toBeVisible();
    await expect(toolbar).toHaveCount(0);
  }
  await page.goto(`${base}/breakpoints`);
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  await toolbar.getByRole("button", { name: "sm preview width", exact: true }).click();
  await expect
    .poll(() =>
      page.getByTestId("grid-layout").evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(360);
  await toolbar.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(base);
  await expect(toolbar).toHaveCount(0);
});

test("wall-only page previews retain metadata settings", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.goto(`${base}/page-settings`);
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show article" })).toHaveCount(0);
  for (const [breakpoint, width] of [
    ["sm", 360],
    ["md", 720],
    ["lg", 1080],
    ["xl", 1440],
  ] as const) {
    await toolbar.getByRole("button", { name: `${breakpoint} preview width` }).click();
    await expect(page.getByTestId("page-composition")).toHaveJSProperty("clientWidth", width);
    await expect(page.getByTestId("grid-layout")).toHaveJSProperty("clientWidth", width);
    await expect(page.getByTestId("grid-layout")).toHaveAttribute(
      "data-wall-breakpoint",
      breakpoint,
    );
  }
  await page.getByRole("button", { name: "Close drawer" }).click();
  await expect(page.getByRole("link", { name: "Compose" })).toHaveCount(0);
  await expect(page.getByLabel("Article content")).toHaveCount(0);
});

test("brick and settings routes share the outer drawer across history navigation", async ({
  page,
}) => {
  await page.goto(base + "/page-settings");
  await page.getByRole("button", { name: "Close drawer", exact: true }).click();
  await page.getByRole("link", { name: "Add bricks" }).click();
  const shell = await page.locator('[data-drawer="bottom"]').elementHandle();
  // Skip the base entry in one navigation so the drawer stays mounted.
  await page.evaluate(() => history.go(-2));
  await expect(page.getByRole("heading", { name: "Page Settings", exact: true })).toBeVisible();
  expect(
    await shell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  await page.evaluate(() => history.go(2));
  await expect(page.getByRole("navigation", { name: "Drawer breadcrumbs" })).toBeVisible();
  expect(
    await shell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
});

test("interrupted history navigation settles with one drawer and preserves bottom shell", async ({
  page,
}) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Page settings", exact: true }).click();
  await page
    .locator('[data-drawer="bottom"]')
    .getByRole("button", { name: "Close drawer", exact: true })
    .click();
  await page.getByRole("link", { name: "Site settings", exact: true }).click();
  await expect(page).toHaveURL(base + "/site-settings");
  const bottom = await page.locator('[data-drawer="bottom"]').elementHandle();
  // Interrupt the native snapshot animation; the final live route must settle correctly.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener(
          "popstate",
          () => {
            requestAnimationFrame(() => {
              window.addEventListener("popstate", () => resolve(), { once: true });
              history.back();
            });
          },
          { once: true },
        );
        history.back();
      }),
  );
  await expect(page.getByRole("heading", { name: "Page Settings", exact: true })).toBeVisible();
  expect(
    await bottom!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  for (let index = 0; index < 3; index++) {
    await page.goForward();
    await page.goForward();
    await page.goBack();
    await page.goBack();
  }
  await expect(page.locator("[data-drawer]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Page Settings", exact: true })).toBeVisible();
});

test("reduced motion preserves navigation without positional drawer animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(page.locator('[data-drawer="bottom"]')).toHaveCount(1);
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await toolbar.getByRole("button", { name: "sm preview width", exact: true }).click();
  await expect
    .poll(() =>
      page.getByTestId("grid-layout").evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(360);
  await page.locator('[data-drawer="bottom"]').getByRole("link", { name: "Close drawer" }).click();
  await expect(page.locator("[data-drawer]")).toHaveCount(0);
  await expect(page.getByTestId("grid-layout")).toBeVisible();
});

test("drawer navigation works without native view transitions", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "startViewTransition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto(base);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(page.locator('[data-drawer="bottom"]')).toBeVisible();
  await page.getByRole("link", { name: "Close drawer" }).click();
  await expect(page.locator("[data-drawer]")).toHaveCount(0);
});
