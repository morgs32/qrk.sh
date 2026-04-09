import { expect, test } from '@playwright/test';

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

  test('dragging a drawer tile onto the grid creates a new instance (duplicates allowed)', async ({
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
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    await page.getByLabel('Open drawer').click();
    await page.waitForTimeout(250);
    const thumb = page.getByRole('button', { name: 'Drag Orange flag' });
    await expect(thumb).toBeVisible();
    await thumb.scrollIntoViewIfNeeded();
    await grid.scrollIntoViewIfNeeded();

    const layoutBox = await grid.boundingBox();
    expect(layoutBox).not.toBeNull();

    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await thumb.dispatchEvent('dragstart', { dataTransfer });
    await grid.dispatchEvent('dragenter', {
      dataTransfer,
      clientX: layoutBox!.x + 200,
      clientY: layoutBox!.y + 200
    });
    await grid.dispatchEvent('dragover', {
      dataTransfer,
      clientX: layoutBox!.x + 200,
      clientY: layoutBox!.y + 200
    });
    await grid.dispatchEvent('drop', {
      dataTransfer,
      clientX: layoutBox!.x + 200,
      clientY: layoutBox!.y + 200
    });
    await page.waitForTimeout(200);

    await expect(grid.locator(typeSelector)).toHaveCount(beforeCount + 1);
  });
});
