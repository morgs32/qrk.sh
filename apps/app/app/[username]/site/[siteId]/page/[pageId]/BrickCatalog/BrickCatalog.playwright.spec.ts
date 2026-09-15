import { expect, test, type Page } from "@playwright/test";

const pageBase = "/e2e/site/e2e/page/home";

function drawerBrickPreviewSlot(page: Page, catalogName: string, registry: string) {
  return page.locator(
    `[data-brick-drawer-brick-slot][data-brick-drawer-catalog-name="${catalogName}"][data-brick-drawer-registry="${registry}"]`,
  );
}

test.describe("BrickCatalog", () => {
  test("Text brick drawer shows one resizable registry", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    await expect(drawerBrickPreviewSlot(page, "text", "default")).toHaveCount(1);
    await expect(page.locator("[data-brick-drawer-view]")).toHaveCount(0);
  });
});
