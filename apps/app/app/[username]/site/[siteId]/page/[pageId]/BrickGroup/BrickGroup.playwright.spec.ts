import { expect, test, type Page } from "@playwright/test";

const pageBase = "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, groupName: string, catalog: string) {
  return page.locator(
    `[data-brick-drawer-brick-slot][data-brick-drawer-group-name="${groupName}"][data-brick-drawer-catalog="${catalog}"]`,
  );
}

test.describe("BrickGroup", () => {
  test("Text brick drawer shows one resizable catalog", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-group`, { waitUntil: "load" });

    await expect(drawerBrickPreviewSlot(page, "text", "default")).toHaveCount(1);
    await expect(page.locator("[data-brick-drawer-view]")).toHaveCount(0);
  });
});
