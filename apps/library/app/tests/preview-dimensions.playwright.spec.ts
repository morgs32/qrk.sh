import { expect, test } from "@playwright/test";

for (const [moduleId, w, h] of [
  ["swatch", 2, 2],
  ["github-profile", 4, 4],
  ["link", 4, 2],
] satisfies Array<[string, number, number]>) {
  test(`${moduleId} module preview matches placed dimensions`, async ({ page }) => {
    await page.setViewportSize({ width: 3000, height: 1100 });
    await page.goto(`/modules/${moduleId}`);
    const source = page.locator(`[data-module-brick="${moduleId}"]`);
    const grid = page.getByLabel("Brick grid", { exact: true });
    await source.dragTo(grid.locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 200 },
    });
    const placed = grid.locator(`[data-brick="${moduleId}"]`);
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

test("module filmstrip scrolls horizontally rather than shrinking previews", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();

  const filmstrip = drawer.getByLabel("Brick modules");
  const github = filmstrip.locator('[data-module-entry="github-profile"]');
  const preview = github.locator('[data-module-representative="github-profile"]');

  // Selected grid width at 1600 is 1440 → profile w=4 → 720px preview.
  // Column is w-max so it does not clip the preview; the filmstrip scrolls instead.
  await expect(preview).toHaveCSS("width", "720px");
  expect(
    await filmstrip.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(
    await github.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(720);
});

test("standalone slider sizes the shared frame", async ({ page }) => {
  await page.goto("/bricks/github-profile");
  const preview = page.getByTestId("brick-preview");
  for (const unit of [40, 80, 128]) {
    await page.getByLabel("Grid unit:", { exact: false }).fill(String(unit));
    await expect(preview).toHaveCSS("width", `${unit * 4}px`);
    await expect(preview).toHaveCSS("height", `${unit * 4}px`);
  }
});
