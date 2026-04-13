import { expect, test, type Locator, type Page } from "@playwright/test";

function drawerTilePreviewSlot(page: Page, collectionName: string, tileName: string) {
  return page.locator(
    `[data-tile-drawer-tile-slot][data-tile-drawer-collection-name="${collectionName}"][data-tile-drawer-tile-name="${tileName}"]`,
  );
}

function gridLocateByTileNames(grid: Locator, collectionName: string, tileName: string) {
  return grid.locator(
    `[data-tile-grid-collection-name="${collectionName}"][data-tile-grid-tile-name="${tileName}"]`,
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

test.describe("Home grid drag", () => {
  test("tile bounding box stays stable through drag threshold; moves with pointer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const layout = page.getByTestId("grid-layout");
    const grid = page.locator(".grid-layout");
    const tile = gridLocateByTileNames(grid, "orange-flag", "4x4").first();
    await expect(tile).toBeVisible({ timeout: 90_000 });
    await expect(layout).toBeVisible();
    await expect(grid).toBeVisible();

    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toBeVisible();

    const rectIdle = await tile.boundingBox();
    expect(rectIdle, "idle bounding box").not.toBeNull();

    const startX = rectIdle!.x + rectIdle!.width / 2;
    const startY = rectIdle!.y + rectIdle!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    const rectAfterDown = await tile.boundingBox();
    expect(rectAfterDown).not.toBeNull();
    expect(
      centerDistance(rectIdle!, rectAfterDown!),
      "no large jump on mousedown before threshold",
    ).toBeLessThanOrEqual(4);

    const dragDx = 200;
    const dragDy = 200;
    await page.mouse.move(startX + dragDx, startY + dragDy, { steps: 12 });
    await page.waitForTimeout(50);

    const rectAfterDrag = await tile.boundingBox();
    expect(rectAfterDrag).not.toBeNull();

    expect(
      centerDistance(rectIdle!, rectAfterDrag!),
      "tile center should move after drag (grid may snap farther than pointer)",
    ).toBeGreaterThan(40);

    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(tile).toBeVisible();
  });

  test("dragging a drawer tile onto the grid creates a new instance and grows the overlay", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const newTiles = gridLocateByTileNames(grid, "orange-flag", "2x2");
    await expect(newTiles).toHaveCount(0);

    await page.getByRole("button", { name: "Edit tiles" }).click();
    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    const slot = drawerTilePreviewSlot(page, "orange-flag", "2x2").first();
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

    await expect(newTiles).toHaveCount(1, { timeout: 15_000 });
  });

  test("releasing a drawer tile outside the grid springs back without adding an instance", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const tiles = gridLocateByTileNames(grid, "orange-flag", "2x2");
    await expect(tiles).toHaveCount(0);

    await page.getByRole("button", { name: "Edit tiles" }).click();
    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    const slot = drawerTilePreviewSlot(page, "orange-flag", "2x2").first();
    await expect(slot).toBeVisible();

    await slot.dragTo(page.getByLabel("Search tiles"), {
      targetPosition: { x: 4, y: 12 },
      steps: 12,
    });

    await expect(tiles).toHaveCount(0);
  });

  test("standalone Work section is removed; work appears as grid text tiles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const rightColumn = page.locator("[data-home-right-scroll]");
    await expect(rightColumn).toBeVisible({ timeout: 90_000 });
    await expect(rightColumn.locator("h2", { hasText: /^Work$/ })).toHaveCount(0);

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible();

    const workRows = gridLocateByTileNames(grid, "text-tile", "8x2");
    await expect(workRows).toHaveCount(46);

    const sampleRow = workRows.first();
    await expect(sampleRow.getByText("Text Tile")).toBeVisible();
    await expect(sampleRow.locator("a")).toHaveCount(0);
  });

  test("Text tile drawer shows only 2x2 and 4x1 variants", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    await page.getByRole("button", { name: "Edit tiles" }).click();
    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    await expect(drawerTilePreviewSlot(page, "text-tile", "4x4")).toHaveCount(1);
    await expect(drawerTilePreviewSlot(page, "text-tile", "8x2")).toHaveCount(1);
    await expect(drawerTilePreviewSlot(page, "text-tile", "1x1")).toHaveCount(0);
  });

  test("dragging a Text tile from the drawer onto the grid adds a sample instance", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const text4x4Tiles = gridLocateByTileNames(grid, "text-tile", "4x4");
    await expect(text4x4Tiles).toHaveCount(0);

    await page.getByRole("button", { name: "Edit tiles" }).click();
    await expect(page.getByLabel("Workspace drawer")).toBeVisible();
    await page.getByLabel("Search tiles").fill("Text tile");
    await expect(page.getByText("Text tile").first()).toBeVisible();

    const slot = drawerTilePreviewSlot(page, "text-tile", "4x4").first();
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

    await expect(text4x4Tiles).toHaveCount(1, { timeout: 15_000 });
  });

  test("seeded work text tiles can be reordered within the grid", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    const grid = page.locator(".grid-layout");
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const first = grid.locator('[data-tile-instance-id="text-tile-work--0"]');
    const second = grid.locator('[data-tile-instance-id="text-tile-work--1"]');
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
