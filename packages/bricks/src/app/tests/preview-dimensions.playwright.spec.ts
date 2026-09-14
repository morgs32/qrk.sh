import { expect, test } from "@playwright/test";

for (const [collection, content, view, w, h] of [
  ["swatch", "default", "2x2", 2, 2],
  ["github", "profile", "4x2", 4, 2],
  ["swatch", "default", "4x4", 4, 4],
  ["swatch", "default", "8x2", 8, 2],
] satisfies Array<[string, string, string, number, number]>) {
  test(`${collection} ${view} preview follows its pane while placed dimensions follow the grid`, async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 1100 });
    await page.goto(`/collections/${collection}?content=${content}&view=${view}`);
    const source = page.locator(`[data-content-view-brick="${collection}/${content}/${view}"]`);
    const grid = page.getByLabel("Brick grid", { exact: true });
    await source.locator(".brick-drag-handle").dragTo(grid.locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 200 },
    });
    const placed = grid.locator(`[data-brick="${collection}/${content}/${view}"]`);
    await expect(placed).toHaveCount(1);
    for (const width of [375, 768, 1024, 1440]) {
      await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
      const availableWidth = await source.evaluate((element) => {
        const container = element.parentElement?.parentElement;
        if (!container) throw new Error("Missing preview container");
        const style = getComputedStyle(container);
        return container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      await expect.poll(async () => {
        const bounds = await source.boundingBox();
        return Math.abs((bounds?.width ?? 0) - availableWidth * w / 8);
      }).toBeLessThan(1);
      await expect.poll(async () => {
        const bounds = await source.boundingBox();
        return Math.abs((bounds?.height ?? 0) - availableWidth * h / 8);
      }).toBeLessThan(1);
      // The grid can trim a pixel at positioned edges to prevent seams.
      await expect
        .poll(async () => {
          const bounds = await placed.boundingBox();
          return Math.abs((bounds?.width ?? 0) - Math.round((width / 8) * w));
        })
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => {
          const bounds = await placed.boundingBox();
          return Math.abs((bounds?.height ?? 0) - Math.round((width / 8) * h));
        })
        .toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "375px grid width", exact: true }).click();
    await placed.getByRole("link").click();
    const detail = page.getByTestId("selected-brick-preview");
    await expect(detail).toBeVisible();
    const availableWidth = await detail.evaluate((element) => {
      const container = element.parentElement?.parentElement;
      if (!container) throw new Error("Missing preview container");
      const style = getComputedStyle(container);
      return container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    });
    const detailBounds = await detail.boundingBox();
    expect(Math.abs((detailBounds?.width ?? 0) - availableWidth * w / 8)).toBeLessThan(1);
    expect(Math.abs((detailBounds?.height ?? 0) - availableWidth * h / 8)).toBeLessThan(1);
  });
}

test("wide catalog previews fill the available pane", async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 1000 });
  await page.goto("/");
  const swatch = page.locator('[data-collection-entry="swatch"]');
  await swatch.getByRole("button", { name: "8×2", exact: true }).click();
  const preview = swatch.locator('[data-collection-representative="swatch/default/8x2"]');
  for (const viewportWidth of [3000, 1600]) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    await expect.poll(async () => {
      const previewBounds = await preview.boundingBox();
      const paneWidth = await page.getByLabel("Bricks panel").evaluate((element) => element.clientWidth);
      return Math.abs((previewBounds?.width ?? 0) - paneWidth);
    }).toBeLessThan(1);
  }
});

test("standalone slider sizes the shared frame", async ({ page }) => {
  await page.goto("/bricks/github/profile/4x2");
  const preview = page.getByTestId("brick-preview");
  for (const unit of [40, 80, 128]) {
    await page.getByLabel("Grid unit:", { exact: false }).fill(String(unit));
    await expect(preview).toHaveCSS("width", `${unit * 4}px`);
    await expect(preview).toHaveCSS("height", `${unit * 2}px`);
  }
});
