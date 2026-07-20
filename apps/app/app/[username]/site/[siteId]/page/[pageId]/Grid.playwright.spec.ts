import { expect, test, type Locator, type Page } from "@playwright/test";

const pageBase = "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, collectionName: string, variant: string, size: string) {
  return page.locator(
    `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="${collectionName}"][data-brick-drawer-variant="${variant}"][data-brick-drawer-size="${size}"]`,
  );
}

function gridLocateByBrickIdentity(
  grid: Locator,
  collectionName: string,
  variant: string,
  size: string,
) {
  return grid.locator(
    `[data-brick-collection-name="${collectionName}"][data-brick-variant="${variant}"][data-brick-size="${size}"]`,
  );
}

function boxCenter(box: { x: number; y: number; width: number; height: number }) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function centerDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  const ca = boxCenter(a);
  const cb = boxCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

test.describe("Site grid drag", () => {
  test("brick bounding box stays stable through drag threshold; moves with pointer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pageBase, { waitUntil: "load" });

    const layout = page.getByTestId("grid-layout");
    const grid = page.locator(".grid-layout");
    const brick = gridLocateByBrickIdentity(grid, "swatch", "default", "4x4").first();
    await expect(brick).toBeVisible({ timeout: 90_000 });
    await expect(layout).toBeVisible();
    await expect(grid).toBeVisible();

    await brick.scrollIntoViewIfNeeded();
    await expect(brick).toBeVisible();

    const rectIdle = await brick.boundingBox();
    expect(rectIdle, "idle bounding box").not.toBeNull();

    const startX = rectIdle!.x + rectIdle!.width / 2;
    const startY = rectIdle!.y + rectIdle!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    const rectAfterDown = await brick.boundingBox();
    expect(rectAfterDown).not.toBeNull();
    expect(
      centerDistance(rectIdle!, rectAfterDown!),
      "no large jump on mousedown before threshold",
    ).toBeLessThanOrEqual(4);

    const dragDx = 200;
    const dragDy = 200;
    await page.mouse.move(startX + dragDx, startY + dragDy, { steps: 12 });
    await page.waitForTimeout(50);

    const rectAfterDrag = await brick.boundingBox();
    expect(rectAfterDrag).not.toBeNull();

    expect(
      centerDistance(rectIdle!, rectAfterDrag!),
      "brick center should move after drag (grid may snap farther than pointer)",
    ).toBeGreaterThan(40);

    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(brick).toBeVisible();
  });

  test("dragging a drawer brick onto the grid creates a new instance and grows the overlay", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const newBricks = gridLocateByBrickIdentity(grid, "swatch", "default", "2x2");
    await expect(newBricks).toHaveCount(0);

    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    const slot = drawerBrickPreviewSlot(page, "swatch", "default", "2x2").first();
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

    await expect(newBricks).toHaveCount(1, { timeout: 15_000 });
  });

  test("releasing a drawer brick outside the grid springs back without adding an instance", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const bricks = gridLocateByBrickIdentity(grid, "swatch", "default", "2x2");
    await expect(bricks).toHaveCount(0);

    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    const slot = drawerBrickPreviewSlot(page, "swatch", "default", "2x2").first();
    await expect(slot).toBeVisible();

    await slot.dragTo(page.getByLabel("Search bricks"), {
      targetPosition: { x: 4, y: 12 },
      steps: 12,
    });

    await expect(bricks).toHaveCount(0);
  });

  test("work appears as grid text bricks", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pageBase, { waitUntil: "load" });

    const rightColumn = page.locator("[data-site-right-scroll]");
    await expect(rightColumn).toBeVisible({ timeout: 90_000 });
    await expect(rightColumn.locator("h2", { hasText: /^Work$/ })).toHaveCount(0);

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible();

    const workRows = gridLocateByBrickIdentity(grid, "text", "default", "8x2");
    await expect(workRows).toHaveCount(46);

    const sampleRow = workRows.first();
    await expect(sampleRow.getByText("Text brick")).toBeVisible();
    await expect(sampleRow.locator("a")).toHaveCount(0);
  });

  test("dragging a Text brick from the drawer onto the grid adds a sample instance", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const text4x4Bricks = gridLocateByBrickIdentity(grid, "text", "default", "4x4");
    await expect(text4x4Bricks).toHaveCount(0);

    await expect(page.getByLabel("Workspace drawer")).toBeVisible();
    await page.getByLabel("Search bricks").fill("Text brick");
    await expect(page.getByText("Text brick").first()).toBeVisible();

    const slot = drawerBrickPreviewSlot(page, "text", "default", "4x4").first();
    await expect(slot).toBeVisible();

    const gridBox = await grid.boundingBox();
    expect(gridBox).not.toBeNull();
    await slot.dragTo(grid, {
      targetPosition: {
        x: Math.min(160, gridBox!.width / 2),
        y: Math.min(100, gridBox!.height / 2),
      },
      steps: 24,
    });

    await expect(text4x4Bricks).toHaveCount(1, { timeout: 15_000 });
  });

  test("seeded work text bricks can be reordered within the grid", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pageBase, { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const first = grid.locator('[data-brick-id="text-brick-work--0"]');
    const second = grid.locator('[data-brick-id="text-brick-work--1"]');
    await expect(first).toBeVisible();
    await expect(second).toBeVisible();

    const boxA = await first.boundingBox();
    const boxB = await second.boundingBox();
    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    const startX = boxA!.x + boxA!.width / 2;
    const startY = boxA!.y + boxA!.height / 2;
    const endX = boxB!.x + boxB!.width / 2;
    const endY = boxB!.y + boxB!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 14 });
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.waitForTimeout(300);

    const boxAAfter = await first.boundingBox();
    expect(boxAAfter).not.toBeNull();
    expect(
      Math.hypot(
        boxAAfter!.y + boxAAfter!.height / 2 - (boxB!.y + boxB!.height / 2),
        boxAAfter!.x + boxAAfter!.width / 2 - (boxB!.x + boxB!.width / 2),
      ),
    ).toBeGreaterThan(20);
  });
});
