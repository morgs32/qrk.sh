import { expect, test } from "@playwright/test";

test("keeps the grid mounted across data routes and restores a placed brick", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const grid = page.getByLabel("Brick grid");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(0);
  const gridElement = await grid.elementHandle();
  await drawer
    .locator('[data-module-representative="swatch"]')
    .dragTo(grid.locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 20 },
    });
  const brick = grid.locator('[data-brick="swatch"]');
  await expect(brick).toBeVisible();
  await drawer.locator('[data-module-link="swatch"]').click();
  await expect(drawer.locator("[data-module-brick]")).toHaveCount(1);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await brick.dblclick();
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page).toHaveURL(/\/modules\/swatch\/brick\/[^/]+$/);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(brick).toBeVisible();
});

test("renders data-router not-found boundaries on direct URLs", async ({ page }) => {
  for (const [path, testId] of [
    ["/modules/not-a-module", "module-not-found"],
    ["/modules/swatch/brick/missing", "brick-not-found"],
    ["/bricks/not-a-catalog", "brick-not-found"],
  ]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});
