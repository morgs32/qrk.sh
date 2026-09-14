import { expect, test, type Page } from "@playwright/test";

const pageBase = "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, collectionName: string, content: string, view: string) {
  return page.locator(
    `[data-brick-drawer-brick-slot][data-brick-drawer-collection-name="${collectionName}"][data-brick-drawer-content="${content}"][data-brick-drawer-view="${view}"]`,
  );
}

test.describe("BrickCatalog", () => {
  test("Text brick drawer shows only 2x2 and 4x1 views", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    await expect(page.getByLabel("Workspace drawer")).toBeVisible();

    await expect(drawerBrickPreviewSlot(page, "text", "default", "4x4")).toHaveCount(1);
    await expect(drawerBrickPreviewSlot(page, "text", "default", "8x2")).toHaveCount(1);
    await expect(drawerBrickPreviewSlot(page, "text", "default", "1x1")).toHaveCount(0);
  });
});
