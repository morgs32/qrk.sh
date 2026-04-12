import { expect, test } from "@playwright/test";

test.describe("tile instance path", () => {
  test("clicking a grid tile navigates to /edit-tiles/:instanceId", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const tile = page.locator('[data-tile-instance-id="orange-flag--0"]');
    await expect(tile).toBeVisible({ timeout: 90_000 });
    await tile.click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/edit-tiles/orange-flag--0");
  });

  test("dragging a grid tile does not change pathname to an instance route", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    const tile = grid.locator('[data-tile-type-id="orange-flag"]').first();
    await expect(tile).toBeVisible({ timeout: 90_000 });
    await tile.scrollIntoViewIfNeeded();

    const rect = await tile.boundingBox();
    expect(rect).not.toBeNull();

    const startX = rect!.x + rect!.width / 2;
    const startY = rect!.y + rect!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY + 200, { steps: 12 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(new URL(page.url()).pathname.startsWith("/edit-tiles/")).toBe(false);
  });

  test("tile drawer shows instance id on /edit-tiles/:instanceId", async ({ page }) => {
    await page.goto("/edit-tiles/orange-flag--0", { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toHaveText("orange-flag--0", {
      timeout: 90_000,
    });
  });

  test("Back from tile detail goes to /edit-tiles and shows catalog", async ({ page }) => {
    await page.goto("/edit-tiles/orange-flag--0", { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Back to tile catalog" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/edit-tiles");
    await expect(page.getByLabel("Search tiles")).toBeVisible();
  });

  test("closing tile drawer navigates to /", async ({ page }) => {
    await page.goto("/edit-tiles/orange-flag--0", { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Close drawer" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });
});
