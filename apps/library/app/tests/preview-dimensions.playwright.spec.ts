import { expect, test } from "@playwright/test";

for (const [moduleId, w, h] of [
  ["swatch", 2, 2],
  ["github-profile", 4, 4],
  ["link", 4, 2],
] satisfies Array<[string, number, number]>) {
  test(`${moduleId} module preview matches placed dimensions`, async ({ page }) => {
    const viewportHeight = 1100;
    await page.setViewportSize({ width: 3000, height: viewportHeight });
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
      const fullW = Math.round((width / 8) * w);
      const fullH = Math.round((width / 8) * h);
      const maxH = viewportHeight * 0.25;
      const expectedH = Math.min(fullH, maxH);
      const expectedW = Math.min(fullW, (w * maxH) / h);
      await expect(source).toHaveCSS("width", `${Math.round(expectedW)}px`);
      await expect(source).toHaveCSS("height", `${Math.round(expectedH)}px`);
      // The grid can trim a pixel at positioned edges to prevent seams.
      await expect
        .poll(async () => {
          const bounds = await placed.boundingBox();
          return Math.abs((bounds?.width ?? 0) - fullW);
        })
        .toBeLessThanOrEqual(1);
      await expect
        .poll(async () => {
          const bounds = await placed.boundingBox();
          return Math.abs((bounds?.height ?? 0) - fullH);
        })
        .toBeLessThanOrEqual(1);
    }
    await page.getByRole("button", { name: "375px grid width", exact: true }).click();
    await placed.dblclick();
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

test("module filmstrip caps preview height at 25vh and scrolls horizontally", async ({ page }) => {
  const viewportHeight = 900;
  await page.setViewportSize({ width: 1600, height: viewportHeight });
  await page.goto("/");
  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();

  const filmstrip = drawer.getByLabel("Brick modules");
  const github = filmstrip.locator('[data-module-entry="github-profile"]');
  const preview = github.locator('[data-module-representative="github-profile"]');

  // Selected grid width at 1600 is 1440 → profile 4×4 would be 720px, but height caps at 25vh.
  const capped = Math.round(viewportHeight * 0.25);
  await expect(preview).toHaveCSS("height", `${capped}px`);
  await expect(preview).toHaveCSS("width", `${capped}px`);
  expect(
    await filmstrip.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);

  // Trackpads send vertical deltas; the filmstrip must map those to scrollLeft.
  await github.hover();
  await page.mouse.wheel(0, 400);
  await expect
    .poll(async () => filmstrip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
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
