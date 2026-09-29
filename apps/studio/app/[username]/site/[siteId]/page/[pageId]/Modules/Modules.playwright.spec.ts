import { expect, test, type Page } from "@playwright/test";

const pageBase = process.env.PLAYWRIGHT_EDITOR_PATH ?? "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, moduleId: string) {
  return page.locator(`[data-brick-drawer-brick-slot][data-brick-drawer-module-id="${moduleId}"]`);
}

test.describe("Modules", () => {
  test("Text brick drawer shows one resizable catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/modules`, { waitUntil: "load" });

    await expect(drawerBrickPreviewSlot(page, "text")).toHaveCount(1);
    await expect(page.locator("[data-brick-drawer-view]")).toHaveCount(0);
  });
});
