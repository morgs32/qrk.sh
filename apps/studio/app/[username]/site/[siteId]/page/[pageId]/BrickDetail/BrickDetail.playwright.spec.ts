import { expect, test, type Page } from "@playwright/test";

const pageBase = process.env.PLAYWRIGHT_EDITOR_PATH ?? "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, moduleId: string) {
  return page.locator(`[data-brick-drawer-brick-slot][data-brick-drawer-module-id="${moduleId}"]`);
}

async function dropSwatchOntoGrid(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${pageBase}/modules`, { waitUntil: "load" });

  const grid = page.locator(".grid-layout");
  await expect(grid).toBeVisible({ timeout: 90_000 });
  await expect(page.getByLabel("Workspace drawer")).toBeVisible();

  const slot = drawerBrickPreviewSlot(page, "swatch-and-icon").first();
  await expect(slot).toBeVisible();

  const gridBox = await grid.boundingBox();
  expect(gridBox).not.toBeNull();
  await slot.dragTo(grid, {
    targetPosition: {
      x: Math.min(120, gridBox!.width / 2),
      y: Math.min(80, gridBox!.height / 2),
    },
    steps: 24,
  });

  const brick = grid.locator('[data-brick="swatch-and-icon"]').first();
  await expect(brick).toBeVisible({ timeout: 15_000 });
  return brick;
}

function getSearchParams(url: string) {
  return new URL(url).searchParams;
}

test.describe("BrickDetail route", () => {
  test("double-clicking a brick navigates to brick detail under /:username/site/:siteId/page/:pageId/brick/:brickId", async ({
    page,
  }) => {
    const brick = await dropSwatchOntoGrid(page);
    const brickId = await brick.getAttribute("data-brick-id");
    expect(brickId).toBeTruthy();

    await brick.dblclick();

    await expect.poll(() => new URL(page.url()).pathname).toBe(`${pageBase}/brick/${brickId}`);
    expect(getSearchParams(page.url()).get("drawer")).toBeNull();
    expect(getSearchParams(page.url()).get("brickId")).toBeNull();
  });

  test("dragging a brick does not navigate to brick detail", async ({ page }) => {
    const brick = await dropSwatchOntoGrid(page);

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

    expect(new URL(page.url()).pathname).toBe(`${pageBase}/modules`);
  });

  test("brick drawer shows module label on brick detail route", async ({ page }) => {
    const brick = await dropSwatchOntoGrid(page);
    const brickId = await brick.getAttribute("data-brick-id");
    expect(brickId).toBeTruthy();

    await page.goto(`${pageBase}/brick/${brickId}`, { waitUntil: "load" });

    await expect(page.getByRole("navigation", { name: "Drawer breadcrumbs" })).toContainText(
      "Update your Swatch and Icon brick",
      { timeout: 90_000 },
    );
  });

  test("Bricks from brick detail opens the catalog", async ({ page }) => {
    const brick = await dropSwatchOntoGrid(page);
    const brickId = await brick.getAttribute("data-brick-id");
    expect(brickId).toBeTruthy();

    await page.goto(`${pageBase}/brick/${brickId}`, { waitUntil: "load" });

    await expect(page.getByTestId("brick-detail-pane")).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("link", { name: "Bricks", exact: true }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(`${pageBase}/modules`);
  });

  test("closing brick drawer returns to site root", async ({ page }) => {
    const brick = await dropSwatchOntoGrid(page);
    const brickId = await brick.getAttribute("data-brick-id");
    expect(brickId).toBeTruthy();

    await page.goto(`${pageBase}/brick/${brickId}`, { waitUntil: "load" });

    await expect(page.getByTestId("brick-detail-pane")).toBeVisible({
      timeout: 90_000,
    });
    await page.getByRole("link", { name: "Close drawer" }).click();

    await expect.poll(() => new URL(page.url()).pathname).toBe(pageBase);
  });
});
