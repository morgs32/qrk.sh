import { expect, test, type Locator, type Page } from '@playwright/test';

function boxCenter(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function centerDistance(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  const ca = boxCenter(a);
  const cb = boxCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

async function startDrawerTileDrag(page: Page, thumb: Locator) {
  await expect(thumb).toBeVisible();
  await thumb.scrollIntoViewIfNeeded();

  const thumbBox = await thumb.boundingBox();
  expect(thumbBox).not.toBeNull();

  const startX = thumbBox!.x + thumbBox!.width / 2;
  const startY = thumbBox!.y + thumbBox!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 18, startY + 18, { steps: 6 });

  const overlay = page.getByTestId('drawer-drag-overlay');
  await expect(overlay).toBeVisible();

  return { overlay, thumbBox: thumbBox! };
}

test.describe('Portfolio grid drag', () => {
  test('tile bounding box stays stable through drag threshold; moves with pointer', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });

    const layout = page.getByTestId('portfolio-grid-layout');
    const grid = page.locator('.portfolio-grid');
    const tile = grid.locator('[data-tile-type-id="orange-flag"]').first();
    await expect(tile).toBeVisible({ timeout: 90_000 });
    await expect(layout).toBeVisible();
    await expect(grid).toBeVisible();

    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toBeVisible();

    const rectIdle = await tile.boundingBox();
    expect(rectIdle, 'idle bounding box').not.toBeNull();

    const startX = rectIdle!.x + rectIdle!.width / 2;
    const startY = rectIdle!.y + rectIdle!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();

    const rectAfterDown = await tile.boundingBox();
    expect(rectAfterDown).not.toBeNull();
    expect(
      centerDistance(rectIdle!, rectAfterDown!),
      'no large jump on mousedown before threshold'
    ).toBeLessThanOrEqual(4);

    const dragDx = 200;
    const dragDy = 200;
    await page.mouse.move(startX + dragDx, startY + dragDy, { steps: 12 });
    await page.waitForTimeout(50);

    const rectAfterDrag = await tile.boundingBox();
    expect(rectAfterDrag).not.toBeNull();

    expect(
      centerDistance(rectIdle!, rectAfterDrag!),
      'tile center should move after drag (grid may snap farther than pointer)'
    ).toBeGreaterThan(40);

    await page.mouse.up();
    await page.waitForTimeout(200);
    await expect(tile).toBeVisible();
  });

  test('dragging a drawer tile onto the grid creates a new instance and grows the overlay', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });

    const layout = page.getByTestId('portfolio-grid-layout');
    const grid = page.locator('.portfolio-grid');
    await expect(layout).toBeVisible({ timeout: 90_000 });
    await expect(grid).toBeVisible();

    const typeSelector = '[data-tile-type-id="orange-flag"]';
    await expect(grid.locator(typeSelector).first()).toBeVisible();

    const beforeCount = await grid.locator(typeSelector).count();
    const beforeGridItemCount = await grid.locator('.react-grid-item').count();
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    await page.getByLabel('Open drawer').click();
    await page.waitForTimeout(250);

    const thumb = page.locator('[data-drawer-tile-type="orange-flag"]');
    const { overlay, thumbBox } = await startDrawerTileDrag(page, thumb);
    const overlayBox = await overlay.boundingBox();
    const gridRootBox = await page.getByTestId('portfolio-grid-root').boundingBox();

    expect(overlayBox).not.toBeNull();
    expect(gridRootBox).not.toBeNull();
    expect(overlayBox!.width).toBeGreaterThan(thumbBox.width + 100);
    expect(overlayBox!.height).toBeGreaterThan(thumbBox.height + 100);
    expect(Math.abs(overlayBox!.width - gridRootBox!.width / 2)).toBeLessThanOrEqual(8);
    expect(Math.abs(overlayBox!.height - gridRootBox!.width / 2)).toBeLessThanOrEqual(8);

    await page.mouse.move(gridRootBox!.x + 220, gridRootBox!.y + 220, { steps: 14 });
    await expect
      .poll(async () => grid.locator('.react-grid-item').count())
      .toBeGreaterThan(beforeGridItemCount);
    await page.mouse.up();
    await page.waitForTimeout(200);

    await expect(grid.locator(typeSelector)).toHaveCount(beforeCount + 1);
    await expect(overlay).toHaveCount(0);
  });

  test('releasing a drawer tile outside the grid springs back without adding an instance', async ({
    page
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });

    const grid = page.locator('.portfolio-grid');
    await expect(grid).toBeVisible({ timeout: 90_000 });

    const typeSelector = '[data-tile-type-id="orange-flag"]';
    const beforeCount = await grid.locator(typeSelector).count();

    await page.getByLabel('Open drawer').click();
    await page.waitForTimeout(250);

    const thumb = page.locator('[data-drawer-tile-type="orange-flag"]');
    const { overlay } = await startDrawerTileDrag(page, thumb);
    const overlayBoxBeforeCancel = await overlay.boundingBox();
    expect(overlayBoxBeforeCancel).not.toBeNull();

    await page.mouse.move(120, 180, { steps: 10 });
    await page.mouse.up();

    await expect(grid.locator(typeSelector)).toHaveCount(beforeCount);
    await expect(overlay).toBeVisible();
    await expect(thumb).toBeVisible();
    await page.waitForTimeout(120);
    const overlayBoxDuringCancel = await overlay.boundingBox();
    expect(overlayBoxDuringCancel).not.toBeNull();
    expect(overlayBoxDuringCancel!.width).toBeLessThan(overlayBoxBeforeCancel!.width - 20);
    await page.waitForTimeout(600);
    await expect(overlay).toHaveCount(0);
  });
});
