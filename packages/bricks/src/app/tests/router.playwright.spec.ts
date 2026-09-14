import { expect, test } from "@playwright/test";

test("keeps the grid mounted across data routes and restores a placed brick", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const grid = page.getByLabel("Brick grid");
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  const gridElement = await grid.elementHandle();
  await page
    .locator('[data-collection-representative="swatch/default/2x2"]')
    .locator(".brick-drag-handle")
    .dragTo(grid.locator(".react-grid-layout"), { targetPosition: { x: 20, y: 20 } });
  const brick = grid.locator('[data-brick="swatch/default/2x2"]');
  await expect(brick).toBeVisible();
  await page.locator('[data-collection-link="swatch"]').click();
  await expect(page.locator("[data-brick-full-layout]")).toHaveCount(3);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await brick.click();
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page).toHaveURL(/\/collections\/swatch\/brick\/[^/]+$/);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(brick).toBeVisible();
});

test("renders data-router not-found boundaries on direct URLs", async ({ page }) => {
  for (const [path, testId] of [
    ["/collections/not-a-collection", "collection-not-found"],
    ["/collections/swatch/not-a-variant", "variant-not-found"],
    ["/collections/swatch/brick/missing", "brick-not-found"],
    ["/bricks/swatch/default/not-a-layout", "brick-not-found"],
  ]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});
