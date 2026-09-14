import { expect, test } from "@playwright/test";

test("selects, drags, and restores distinct layouts with identical dimensions", async ({ page }) => {
  // Add fixtures only to this browser's catalog response, never the production catalog.
  await page.route("**/src/collectionsHash.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const fixtureVariant = collectionsHash.swatch.variants.default;
        const fixtureBrick = fixtureVariant.layouts["2x2"];
        fixtureVariant.layouts.summary = {
          def: { ...fixtureBrick.def, layout: "summary", label: "Summary" },
          component: () => "Summary fixture content",
        };
        fixtureVariant.layouts.activity = {
          def: { ...fixtureBrick.def, layout: "activity", label: "Activity" },
          component: () => "Activity fixture content",
        };
      `,
    });
  });
  await page.goto("/collections/swatch?variant=default&layout=summary");
  const preview = page.locator("[data-variant-layout-brick]");
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("qrk-bricks-sandbox-single-grid") ?? "{}"));
  expect(Object.values(saved.state.bricksById)).toEqual(expect.arrayContaining([
    expect.objectContaining({ layout: "summary", w: 2, h: 2 }),
    expect.objectContaining({ layout: "activity", w: 2, h: 2 }),
  ]));
  for (const brick of Object.values(saved.state.bricksById)) expect(brick).not.toHaveProperty("size");
});

test("uses layout queries and ignores the old size query", async ({ page }) => {
  await page.goto("/collections/swatch?variant=default&size=8x2");
  await expect(page.locator("[data-variant-layout-brick]")).toHaveAttribute("data-variant-layout-brick", "swatch/default/2x2");
  await page.goto("/collections/swatch?variant=default&layout=8x2");
  await expect(page.locator("[data-variant-layout-brick]")).toHaveAttribute("data-variant-layout-brick", "swatch/default/8x2");
  await page.goto("/bricks/swatch/default/8x2");
  await expect(page.getByText("Layout", { exact: true })).toBeVisible();
});
