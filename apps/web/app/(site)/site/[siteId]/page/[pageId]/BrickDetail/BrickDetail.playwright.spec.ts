import { expect, test } from "@playwright/test";

const pageBase = "/site/e2e/page/home";

function getSearchParams(url: string) {
  return new URL(url).searchParams;
}

test.describe("BrickDetail route", () => {
  test("clicking a grid brick navigates to brick detail under /site/:siteId/page/:pageId/brick/:brickId", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pageBase, { waitUntil: "load" });

    const brick = page.locator('[data-brick-instance-id="orange-flag--0"]');
    await expect(brick).toBeVisible({ timeout: 90_000 });
    await brick.click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(`${pageBase}/brick/orange-flag--0`);
    expect(getSearchParams(page.url()).get("drawer")).toBeNull();
    expect(getSearchParams(page.url()).get("brickId")).toBeNull();
  });

  test("dragging a grid brick does not navigate to brick detail", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pageBase, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    const brick = grid
      .locator('[data-brick-grid-collection-name="orange-flag"][data-brick-grid-brick-name="4x4"]')
      .first();
    await expect(brick).toBeVisible({ timeout: 90_000 });
    await brick.scrollIntoViewIfNeeded();

    const rect = await brick.boundingBox();
    expect(rect).not.toBeNull();

    const startX = rect!.x + rect!.width / 2;
    const startY = rect!.y + rect!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY + 200, { steps: 12 });
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(new URL(page.url()).pathname).toBe(pageBase);
  });

  test("brick drawer shows instance id on brick detail route", async ({ page }) => {
    await page.goto(`${pageBase}/brick/orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("brick-detail-title")).toHaveText("orange-flag--0", {
      timeout: 90_000,
    });
  });

  test("Back from brick detail opens catalog at brick-catalog", async ({ page }) => {
    await page.goto(`${pageBase}/brick/orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("brick-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Back to brick catalog" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(`${pageBase}/brick-catalog`);
    await expect(page.getByLabel("Search bricks")).toBeVisible();
  });

  test("closing brick drawer returns to site root", async ({ page }) => {
    await page.goto(`${pageBase}/brick/orange-flag--0`, { waitUntil: "load" });

    await expect(page.getByTestId("brick-detail-title")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Close drawer" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(pageBase);
  });
});
