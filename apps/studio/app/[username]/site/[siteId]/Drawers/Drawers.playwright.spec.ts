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
    "Drag a brick onto your page",
  );
  expect(
    await shell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  await page.goBack();
  await bottom.getByRole("link", { name: "Close drawer" }).click();
  await expect(bottom).toBeHidden();
  await expect(bottom).toHaveCount(1);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(bottom).toBeVisible();
  expect(await shell!.evaluate((element) => element.isConnected)).toBe(true);
  await page.goBack();
  await expect(bottom).toBeHidden();
  await expect(bottom).toHaveCount(1);
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
    .getByRole("link", { name: "Bricks", exact: true })
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
  test(`drawer overlays half the viewport without shrinking the editor at ${width}px`, async ({
    page,
  }) => {
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
      .toBe(Math.round(fullHeight));
    await expect(page.locator("[data-editor-drawer-space]")).toHaveCSS("padding-bottom", "450px");
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

test("breakpoint selection keeps four centered walls and one editor session", async ({ page }) => {
  await page.setViewportSize({ width: 3200, height: 900 });
  await page.goto(base);
  const grid = page.getByTestId("grid-layout");
  await expect(grid).toBeVisible();
  const gridElement = await grid.elementHandle();
  const walls = page.locator("[data-wall-breakpoint]");
  await expect(walls).toHaveCount(4);
  const wallElements = await Promise.all(
    ["sm", "md", "lg", "xl"].map((id) =>
      page.locator(`[data-wall-breakpoint="${id}"]`).elementHandle(),
    ),
  );
  const region = page.getByTestId("grid-region");
  const composition = page.getByTestId("page-composition");
  const initialWidth = await region.evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("link", { name: "Add bricks" }).click();
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });

  // Assert rendered widths, so a selected-looking button alone cannot pass.
  for (const [id, wallWidth] of [
    ["sm", 360],
    ["md", 720],
    ["lg", 1080],
    ["xl", 1440],
  ]) {
    const button = toolbar.getByRole("button", { name: `${id} preview width`, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => composition.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(initialWidth);
    const wall = page.locator(`[data-wall-breakpoint="${id}"]`);
    await expect(wall).toHaveAttribute("data-wall-active", "true");
    await expect
      .poll(() => wall.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(wallWidth);
    await expect
      .poll(() =>
        wall.evaluate((element) => {
          const parent = element.closest('[data-testid="grid-layout"]');
          if (!parent) return null;
          const bounds = element.getBoundingClientRect();
          const stage = parent.getBoundingClientRect();
          return Math.abs(bounds.left + bounds.width / 2 - (stage.left + stage.width / 2));
        }),
      )
      .toBeLessThanOrEqual(1);
  }

  await toolbar.getByRole("button", { name: "md preview width", exact: true }).click();
  await page.locator("[data-module-link]").first().click();
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await expect
    .poll(() =>
      page
        .locator('[data-wall-active="true"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(720);
  await page.goForward();
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Close drawer", exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('[data-wall-active="true"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(720);
  expect(await gridElement!.evaluate((element) => element.isConnected)).toBe(true);
  for (const wallElement of wallElements) {
    expect(await wallElement!.evaluate((element) => element.isConnected)).toBe(true);
  }
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
    .poll(() =>
      page
        .locator('[data-wall-active="true"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(720);
  await page.setViewportSize({ width: 3200, height: 900 });
  await expect(
    toolbar.getByRole("button", { name: "md preview width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("page settings hides breakpoint controls; the dedicated route retains its close action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await page.goto(`${base}/page-settings`);
  await expect(page.getByTestId("grid-layout")).toBeVisible();
  await expect(toolbar).toHaveCount(0);
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
      page
        .locator('[data-wall-active="true"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(360);
  await toolbar.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).toHaveURL(base);
  await expect(toolbar).toHaveCount(0);
});

test("selected wall falls back and returns as available width changes", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(`${base}/modules`);
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await toolbar.getByRole("button", { name: "md preview width" }).click();
  await expect(page.locator('[data-wall-breakpoint="md"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.locator('[data-wall-breakpoint="sm"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await page.setViewportSize({ width: 1000, height: 900 });
  await expect(page.locator('[data-wall-breakpoint="md"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.getByRole("status").filter({ hasText: "At least 360px" })).toBeVisible();
  await expect(page.locator('[data-wall-active="true"]')).toHaveCount(0);
  await page.setViewportSize({ width: 400, height: 900 });
  await expect(page.locator('[data-wall-breakpoint="sm"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
});

test("wall transitions cancel obsolete exits and reduced motion settles immediately", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.goto(`${base}/breakpoints`);
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  const sm = toolbar.getByRole("button", { name: "sm preview width" });
  const md = toolbar.getByRole("button", { name: "md preview width" });
  const lg = toolbar.getByRole("button", { name: "lg preview width" });
  await md.click();
  await expect(page.locator('[data-wall-breakpoint="md"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await lg.click();
  await expect
    .poll(() =>
      page
        .locator('[data-wall-breakpoint="lg"]')
        .evaluate((element) => getComputedStyle(element.parentElement!).transform),
    )
    .not.toBe("none");
  await md.click();
  await expect(page.locator('[data-wall-breakpoint="md"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await lg.click();
  await sm.click();
  await expect(page.locator('[data-wall-breakpoint="sm"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await expect
    .poll(() =>
      page
        .locator('[data-wall-breakpoint="sm"]')
        .evaluate((element) => getComputedStyle(element.parentElement!).transform),
    )
    .toBe("none");
  await expect(page.locator('[data-wall-breakpoint="md"]').locator("..")).toHaveAttribute(
    "hidden",
    "",
  );
  await expect(page.locator('[data-wall-breakpoint="lg"]').locator("..")).toHaveAttribute(
    "hidden",
    "",
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  await lg.click();
  await expect(page.locator('[data-wall-breakpoint="lg"]')).toHaveAttribute(
    "data-wall-active",
    "true",
  );
  await expect(page.locator('[data-wall-breakpoint="sm"]').locator("..")).toHaveAttribute(
    "hidden",
    "",
  );
});

test("wall-only page previews retain metadata settings", async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.goto(`${base}/page-settings`);
  const toolbar = page.getByRole("toolbar", { name: "Breakpoints", exact: true });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show article" })).toHaveCount(0);
  await expect(toolbar).toHaveCount(0);
  await page.getByRole("button", { name: "Close drawer" }).click();
  await page.goto(`${base}/breakpoints`);
  for (const [breakpoint, width] of [
    ["sm", 360],
    ["md", 720],
    ["lg", 1080],
    ["xl", 1440],
  ] as const) {
    await toolbar.getByRole("button", { name: `${breakpoint} preview width` }).click();
    await expect(page.locator(`[data-wall-breakpoint="${breakpoint}"]`)).toHaveJSProperty(
      "clientWidth",
      width,
    );
    await expect(page.locator(`[data-wall-breakpoint="${breakpoint}"]`)).toHaveAttribute(
      "data-wall-active",
      "true",
    );
  }
  await toolbar.getByRole("button", { name: "Close", exact: true }).click();
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
      page
        .locator('[data-wall-active="true"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBe(360);
  await page.locator('[data-drawer="bottom"]').getByRole("link", { name: "Close drawer" }).click();
  await expect(page.locator("[data-drawer]")).toBeHidden();
  await expect(page.locator("[data-drawer]")).toHaveCount(1);
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
  await expect(page.locator("[data-drawer]")).toBeHidden();
  await expect(page.locator("[data-drawer]")).toHaveCount(1);
});

for (const startingPosition of ["top", "middle", "bottom"]) {
  test(`drawer preserves the editor's ${startingPosition} scroll anchor`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base);
    const scroll = page.locator("[data-site-right-scroll]");
    await expect(scroll).toBeVisible();
    // Give the existing wall a stable long-page geometry without writing user data.
    await page.addStyleTag({ content: '[data-testid="grid-layout"] { min-height: 4000px; }' });
    const before = await scroll.evaluate((element, position) => {
      const max = element.scrollHeight - element.clientHeight;
      element.scrollTop = position === "bottom" ? max : position === "middle" ? 500 : 0;
      return element.scrollTop;
    }, startingPosition);
    await page.getByRole("link", { name: "Add bricks", exact: true }).click();
    const drawer = page.locator('[data-drawer="bottom"]');
    await expect(drawer).toHaveAttribute("data-state", "open");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(before + (startingPosition === "bottom" ? 450 : 0));
    // Viewport changes preserve bottom alignment only for an already pinned reader.
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect(page.locator("[data-editor-drawer-space]")).toHaveCSS("padding-bottom", "400px");
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(before + (startingPosition === "bottom" ? 500 : 0));
    // Closing must respect scrolling performed while open, not restore the old offset.
    await scroll.evaluate((element) => {
      element.scrollTop = 250;
    });
    await drawer.getByRole("link", { name: "Close drawer", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(scroll).toHaveJSProperty("scrollTop", 250);
    await expect(page.locator("[data-editor-drawer-space]")).toHaveCSS("padding-bottom", "0px");
  });
}

test("short editor pages and direct drawer links do not force a bottom scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  const scroll = page.locator("[data-site-right-scroll]");
  await expect(scroll).toBeVisible();
  await page.addStyleTag({
    content:
      '[data-testid="grid-layout"] { height: 0 !important; min-height: 0 !important; overflow: hidden; }',
  });
  await page.getByRole("link", { name: "Add bricks", exact: true }).click();
  await expect(page.locator('[data-drawer="bottom"]')).toHaveAttribute("data-state", "open");
  await expect(scroll).toHaveJSProperty("scrollTop", 0);
  await page.goto(base + "/modules");
  await expect(page.locator("[data-editor-drawer-space]")).toHaveCSS("padding-bottom", "450px");
  await expect(scroll).toHaveJSProperty("scrollTop", 0);
});

test("closing restores focus and removes the persistent drawer from keyboard access", async ({
  page,
}) => {
  await page.goto(base);
  const opener = page.getByRole("link", { name: "Add bricks", exact: true });
  await opener.focus();
  await opener.press("Enter");
  const drawer = page.locator('[data-drawer="bottom"]');
  await drawer.getByRole("link", { name: "Close drawer", exact: true }).click();
  await expect(drawer).toHaveAttribute("inert", "");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test("content growth does not turn a previous bottom position into sticky scrolling", async ({
  page,
}) => {
  await page.goto(base + "/modules");
  const scroll = page.locator("[data-site-right-scroll]");
  await expect(scroll).toBeVisible();
  await page.addStyleTag({ content: '[data-testid="grid-layout"] { min-height: 4000px; }' });
  const previousTop = await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  await page.addStyleTag({ content: '[data-testid="grid-layout"] { min-height: 5000px; }' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(scroll).toHaveJSProperty("scrollTop", previousTop);
  await page.setViewportSize({ width: 1280, height: 600 });
  await expect(page.locator("[data-editor-drawer-space]")).toHaveCSS("padding-bottom", "300px");
  await expect(scroll).toHaveJSProperty("scrollTop", previousTop);
});
