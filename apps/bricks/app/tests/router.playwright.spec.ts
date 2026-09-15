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
    .locator('[data-group-representative="swatch/default"]')
    .dragTo(grid.locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 20 },
    });
  const brick = grid.locator('[data-brick="swatch/default"]');
  await expect(brick).toBeVisible();
  await drawer.locator('[data-group-link="swatch"]').click();
  await expect(drawer.locator("[data-catalog-brick]")).toHaveCount(1);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await brick.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page).toHaveURL(/\/groups\/swatch\/brick\/[^/]+$/);
  expect(await gridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(brick).toBeVisible();
});

test("renders data-router not-found boundaries on direct URLs", async ({ page }) => {
  for (const [path, testId] of [
    ["/groups/not-a-group", "group-not-found"],
    ["/groups/swatch/not-a-catalog", "catalog-not-found"],
    ["/groups/swatch/brick/missing", "brick-not-found"],
    ["/bricks/swatch/not-a-catalog", "brick-not-found"],
  ]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});
