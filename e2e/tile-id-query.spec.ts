import { expect, test } from "@playwright/test";

const sitePath = "/site/e2e";

function getSearchParams(url: string) {
  return new URL(url).searchParams;
}

test.describe("tile instance path", () => {
  test("clicking a grid tile sets drawer=edit-tiles and tileId on /site/:siteId", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(sitePath, { waitUntil: "load" });

    const tile = page.locator('[data-tile-instance-id="orange-flag--0"]');
    await expect(tile).toBeVisible({ timeout: 90_000 });
    await tile.click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(sitePath);
    await expect
      .poll(() => getSearchParams(page.url()).get("drawer"))
      .toBe("edit-tiles");
    await expect.poll(() => getSearchParams(page.url()).get("tileId")).toBe("orange-flag--0");
  });

  test("dragging a grid tile does not set tile detail search params", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(sitePath, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    const tile = grid
      .locator(
        '[data-tile-grid-collection-name="orange-flag"][data-tile-grid-tile-name="4x4"]',
      )
      .first();
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

    expect(new URL(page.url()).pathname).toBe(sitePath);
    expect(getSearchParams(page.url()).get("tileId")).toBeNull();
  });

  test("tile drawer shows instance id when tileId is in the query string", async ({ page }) => {
    await page.goto(`${sitePath}?drawer=edit-tiles&tileId=orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toHaveText("orange-flag--0", {
      timeout: 90_000,
    });
  });

  test("Back from tile detail clears tileId and shows catalog", async ({ page }) => {
    await page.goto(`${sitePath}?drawer=edit-tiles&tileId=orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Back to tile catalog" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(sitePath);
    await expect.poll(() => getSearchParams(page.url()).get("drawer")).toBe("edit-tiles");
    expect(getSearchParams(page.url()).get("tileId")).toBeNull();
    await expect(page.getByLabel("Search tiles")).toBeVisible();
  });

  test("closing tile drawer clears drawer and tileId", async ({ page }) => {
    await page.goto(`${sitePath}?drawer=edit-tiles&tileId=orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("tile-drawer-tile-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Close drawer" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(sitePath);
    expect(getSearchParams(page.url()).get("drawer")).toBeNull();
    expect(getSearchParams(page.url()).get("tileId")).toBeNull();
  });
});
