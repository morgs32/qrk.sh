import { expect, test } from '@playwright/test';

test.describe('Drawer background interaction', () => {
  test('grid column can still scroll while drawer is open', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });

    const rightColumn = page.locator('[data-home-right-scroll]');
    await expect(rightColumn).toBeVisible({ timeout: 90_000 });

    // Ensure it is scrollable by scrolling once.
    const startScrollTop = await rightColumn.evaluate((el) => (el as HTMLElement).scrollTop);
    const box = await rightColumn.boundingBox();
    expect(box).not.toBeNull();
    await rightColumn.evaluate((el) => (el as HTMLElement).scrollBy({ top: 600 }));
    const afterFirstWheel = await rightColumn.evaluate((el) => (el as HTMLElement).scrollTop);
    expect(afterFirstWheel).toBeGreaterThan(startScrollTop);
    const maxScrollTop = await rightColumn.evaluate((el) => {
      const node = el as HTMLElement;
      return node.scrollHeight - node.clientHeight;
    });
    expect(maxScrollTop).toBeGreaterThan(afterFirstWheel + 50);

    await page.getByLabel('Open drawer').click();
    await expect(page.getByLabel('Workspace drawer')).toBeVisible();

    const beforeDrawerWheel = await rightColumn.evaluate((el) => (el as HTMLElement).scrollTop);
    const maxScrollTopAfterDrawer = await rightColumn.evaluate((el) => {
      const node = el as HTMLElement;
      return node.scrollHeight - node.clientHeight;
    });
    expect(maxScrollTopAfterDrawer).toBeGreaterThan(beforeDrawerWheel + 50);
    await rightColumn.evaluate((el) => (el as HTMLElement).scrollBy({ top: 600 }));
    const afterDrawerWheel = await rightColumn.evaluate((el) => (el as HTMLElement).scrollTop);

    expect(afterDrawerWheel).toBeGreaterThan(beforeDrawerWheel);
  });
});

