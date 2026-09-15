import { expect, test } from "@playwright/test";

for (const [group, catalog, w, h] of [
  ["swatch", "default", 2, 2],
  ["github", "profile", 4, 4],
  ["link", "default", 4, 2],
] satisfies Array<[string, string, number, number]>) {
  test(`${group} catalog preview matches placed dimensions`, async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 1100 });
    await page.goto(`/groups/${group}?catalog=${catalog}`);
    const source = page.locator(`[data-catalog-brick="${group}/${catalog}"]`);
    const grid = page.getByLabel("Brick grid", { exact: true });
    await source.dragTo(grid.locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 200 },
    });
    const placed = grid.locator(`[data-brick="${group}/${catalog}"]`);
    await expect(placed).toHaveCount(1);
    for (const width of [375, 640, 1024, 1440]) {
      await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
      await expect(source).toHaveCSS("width", `${Math.round((width / 8) * w)}px`);
      await expect(source).toHaveCSS("height", `${Math.round((width / 8) * h)}px`);
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
    await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
    await expect(page.getByTestId("selected-brick-preview")).toHaveCSS(
      "width",
      `${Math.round((375 / 8) * w)}px`,
    );
    await expect(page.getByTestId("selected-brick-preview")).toHaveCSS(
      "height",
      `${Math.round((375 / 8) * h)}px`,
    );
  });
}

test("group previews scroll rather than shrinking", async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 1000 });
  await page.goto("/");
  const swatch = page.locator('[data-group-entry="github"]');
  const preview = swatch.locator('[data-group-representative="github/profile"]');
  await expect(preview).toHaveCSS("width", "720px");
  await page.getByLabel("Bricks panel").evaluate((element) => {
    element.style.width = "400px";
  });
  await expect(preview).toHaveCSS("width", "720px");
  expect(
    await swatch
      .locator(":scope > .overflow-auto")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(preview).toHaveCSS("width", "320px");
});

test("standalone slider sizes the shared frame", async ({ page }) => {
  await page.goto("/bricks/github/profile");
  const preview = page.getByTestId("brick-preview");
  for (const unit of [40, 80, 128]) {
    await page.getByLabel("Grid unit:", { exact: false }).fill(String(unit));
    await expect(preview).toHaveCSS("width", `${unit * 4}px`);
    await expect(preview).toHaveCSS("height", `${unit * 4}px`);
  }
});
