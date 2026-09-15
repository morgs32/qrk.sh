import { expect, test } from "@playwright/test";

test("limits presets to available width and preserves width through navigation and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  const grid = page.getByLabel("Brick grid");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });

  await expect(grid).toHaveCSS("width", "1440px");
  await expect(toolbar.getByRole("button", { name: "Full", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /^(768|1536)px grid width$/ })).toHaveCount(0);
  await expect(page.getByLabel("Bricks panel")).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Bricks", exact: true })).toBeVisible();
  await expect(drawer).not.toBeVisible();

  const toolbarBounds = await toolbar.boundingBox();
  expect(toolbarBounds?.y).toBeGreaterThan(800);
  expect(toolbarBounds?.x).toBeGreaterThanOrEqual(0);

  await toolbar.getByRole("button", { name: "375px grid width", exact: true }).click();
  await expect(grid).toHaveCSS("width", "375px");
  expect((await grid.boundingBox())?.x).toBeCloseTo((1600 - 375) / 2, 0);
  await expect(
    toolbar.getByRole("button", { name: "640px grid width", exact: true }),
  ).toBeEnabled();
  await expect(
    toolbar.getByRole("button", { name: "1024px grid width", exact: true }),
  ).toBeEnabled();

  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-group-link="swatch"]').click();
  await expect(page).toHaveURL(/groups\/swatch$/);
  await expect(grid).toHaveCSS("width", "375px");
  await toolbar.getByRole("button", { name: "Reset grid layout" }).click();
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
  await expect(grid).toHaveCSS("width", "375px");
  await toolbar.getByRole("button", { name: "640px grid width", exact: true }).click();
  await expect(grid).toHaveCSS("width", "640px");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    toolbar.getByRole("button", { name: "640px grid width", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toHaveCSS("width", "640px");
  await expect(
    toolbar.getByRole("button", { name: "1024px grid width", exact: true }),
  ).toBeEnabled();
  await toolbar.getByRole("button", { name: "375px grid width", exact: true }).click();
  await page.reload();
  await expect(grid).toHaveCSS("width", "375px");
});

test("all fixed presets measure exactly when the viewport fits them", async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 900 });
  await page.goto("/");
  for (const width of [375, 640, 1024, 1440]) {
    await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
    await expect(page.getByLabel("Brick grid")).toHaveCSS("width", `${width}px`);
  }
  await page.reload();
  await expect(page.getByLabel("Brick grid")).toHaveCSS("width", "1440px");
});

for (const width of [375, 768, 1600]) {
  test(`toolbar and nonmodal half-height drawer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
    const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
    await expect(drawer).not.toBeVisible();
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Bricks", exact: true })).toBeVisible();
    const bounds = await toolbar.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    await expect(page.getByLabel("Brick grid")).toBeVisible();
    await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("height", "450px");
    await expect(drawer).toHaveCSS("width", `${width}px`);
    await drawer
      .locator('[data-group-representative="icon/default"]')
      .dragTo(page.getByLabel("Brick grid").locator(".react-grid-layout"), {
        targetPosition: { x: 20, y: 20 },
      });
    await expect(
      page.getByLabel("Brick grid").locator('[data-brick="icon/default"]'),
    ).toBeVisible();
    await expect(drawer).toBeVisible();
    await drawer.locator('[data-group-link="swatch"]').click();
    await expect(page).toHaveURL(/groups\/swatch$/);
    await toolbar.getByRole("button", { name: "Reset grid layout" }).click();
    await expect(page.getByLabel("Brick grid").locator("[data-brick-id]")).toHaveCount(0);
    await drawer.getByRole("button", { name: "Close drawer" }).click();
    await expect(drawer).not.toBeVisible();
    await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
    await drawer.getByRole("button", { name: "Close drawer" }).focus();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });
}
