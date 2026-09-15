import { expect, test } from "@playwright/test";

test("selects, drags, and restores distinct views with identical dimensions", async ({ page }) => {
  // Add fixtures only to this browser's catalog response, never the production catalog.
  await page.route("**/src/catalogsHash.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const fixtureContent = catalogsHash.swatch.contents.default;
        const fixtureBrick = fixtureContent.views["2x2"];
        fixtureContent.views.summary = {
          def: { ...fixtureBrick.def, view: "summary", label: "Summary" },
          component: () => "Summary fixture content",
        };
        fixtureContent.views.activity = {
          def: { ...fixtureBrick.def, view: "activity", label: "Activity" },
          component: () => "Activity fixture content",
        };
      `,
    });
  });
  await page.goto("/catalogs/swatch?content=default&view=summary");
  const preview = page.locator("[data-content-view-brick]");
  const summary = page.getByRole("link", { name: "Summary", exact: true });
  const activity = page.getByRole("link", { name: "Activity", exact: true });
  await expect(summary).toHaveAttribute("aria-current", "true");
  await expect(summary).toHaveCSS("font-weight", "700");
  await expect(preview).toHaveText("Summary fixture content");
  const grid = page.getByLabel("Brick grid");
  await preview.locator(".brick-drag-handle").dragTo(grid.locator(".react-grid-layout"), {
    targetPosition: { x: 20, y: 20 },
  });
  await expect(grid).toContainText("Summary fixture content");
  await activity.click();
  await expect(activity).toHaveAttribute("aria-current", "true");
  await expect(summary).not.toHaveAttribute("aria-current", "true");
  await expect(preview).toHaveText("Activity fixture content");
  await preview.locator(".brick-drag-handle").dragTo(grid.locator(".react-grid-layout"), {
    targetPosition: { x: 180, y: 20 },
  });
  await expect(grid).toContainText("Activity fixture content");
  await page.reload();
  await expect(grid).toContainText("Summary fixture content");
  await expect(grid).toContainText("Activity fixture content");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2") ?? "{}"),
  );
  expect(Object.values(saved.state.bricksById)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        viewId: "summary",
        xs: expect.objectContaining({ gridItem: expect.objectContaining({ w: 2, h: 2 }) }),
      }),
      expect.objectContaining({
        viewId: "activity",
        xs: expect.objectContaining({ gridItem: expect.objectContaining({ w: 2, h: 2 }) }),
      }),
    ]),
  );
  for (const brick of Object.values(saved.state.bricksById))
    expect(brick).not.toHaveProperty("size");
});

test("uses view queries and ignores the old size query", async ({ page }) => {
  await page.goto("/catalogs/swatch?content=default&size=8x2");
  await expect(page.locator("[data-content-view-brick]")).toHaveAttribute(
    "data-content-view-brick",
    "swatch/default/2x2",
  );
  await page.goto("/catalogs/swatch?content=default&view=8x2");
  await expect(page.locator("[data-content-view-brick]")).toHaveAttribute(
    "data-content-view-brick",
    "swatch/default/8x2",
  );
  await page.goto("/bricks/swatch/default/8x2");
  await expect(page.getByText("View", { exact: true })).toBeVisible();
});

test("uses content and view queries and ignores old catalog query names", async ({ page }) => {
  await page.goto("/catalogs/github?variant=repo&layout=4x2");
  await expect(page.locator("[data-content-view-brick]")).toHaveAttribute(
    "data-content-view-brick",
    "github/profile/4x4",
  );
  await page.goto("/catalogs/github?content=repo&view=4x2");
  await expect(page.locator("[data-content-view-brick]")).toHaveAttribute(
    "data-content-view-brick",
    "github/repo/4x2",
  );
});
