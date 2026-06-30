import { expect, test, type Page } from "@playwright/test";

const pageBase = "/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, collectionName: string, brickName: string) {
  return page.locator(
    `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="${collectionName}"][data-brick-drawer-brick-name="${brickName}"]`,
  );
}

test.describe("BrickCatalog", () => {
  test("Text brick drawer shows only 2x2 and 4x1 variants", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    await expect(drawerBrickPreviewSlot(page, "text-brick", "4x4")).toHaveCount(1);
    await expect(drawerBrickPreviewSlot(page, "text-brick", "8x2")).toHaveCount(1);
    await expect(drawerBrickPreviewSlot(page, "text-brick", "1x1")).toHaveCount(0);
  });
});
