import { expect, test } from "@playwright/test";

test("selects, drags, and restores distinct registries with identical dimensions", async ({
  page,
}) => {
  // Add fixtures only to this browser's catalog response, never the production catalog.
  await page.route("**/src/catalogsHash.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const fixtureContent = catalogsHash.swatch.registries.default;
        const fixtureBrick = fixtureContent;
        catalogsHash.swatch.registries.summary = {
          ...fixtureContent, registryName: "Summary",
          def: { ...fixtureBrick.def, registry: "summary", label: "Summary" },
          component: () => "Summary fixture content",
        };
        catalogsHash.swatch.registries.activity = {
          ...fixtureContent, registryName: "Activity",
          def: { ...fixtureBrick.def, registry: "activity", label: "Activity" },
          component: () => "Activity fixture content",
        };
      `,
    });
  });
  await page.goto("/catalogs/swatch?registry=summary");
  const preview = page.locator("[data-registry-brick]");
  const summary = page.getByRole("link", { name: "Summary", exact: true });
  const activity = page.getByRole("link", { name: "Activity", exact: true });
  await expect(summary).toHaveAttribute("aria-current", "true");
  await expect(summary).toHaveAttribute("aria-current", "true");
  await expect(preview).toHaveText("Summary fixture content");
  const grid = page.getByLabel("Brick grid");
  await preview.dragTo(grid.locator(".react-grid-layout"), {
    targetPosition: { x: 20, y: 20 },
  });
  await expect(grid).toContainText("Summary fixture content");
  await activity.click();
  await expect(activity).toHaveAttribute("aria-current", "true");
  await expect(summary).not.toHaveAttribute("aria-current", "true");
  await expect(preview).toHaveText("Activity fixture content");
  await preview.dragTo(grid.locator(".react-grid-layout"), {
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
        xs: expect.objectContaining({
          gridItem: expect.objectContaining({ w: 2, h: 2 }),
        }),
      }),
      expect.objectContaining({
        xs: expect.objectContaining({
          gridItem: expect.objectContaining({ w: 2, h: 2 }),
        }),
      }),
    ]),
  );
  for (const brick of Object.values(saved.state.bricksById))
    expect(brick).not.toHaveProperty("size");
});

test("uses registry queries and standalone registry routes", async ({ page }) => {
  await page.goto("/catalogs/github?registry=repo");
  await expect(page.locator("[data-registry-brick]")).toHaveAttribute(
    "data-registry-brick",
    "github/repo",
  );
  await page.goto("/bricks/github/repo");
  await expect(page.getByText("Registry", { exact: true })).toBeVisible();
  await expect(page.getByText("View", { exact: true })).toHaveCount(0);
});

test("drags over SVG content, resizes at the default corner, and preserves editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 3000, height: 1100 });
  await page.goto("/catalogs/icon");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const preview = page.locator("[data-registry-brick]");
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await expect(preview.getByRole("img", { name: "Asterisk" })).toHaveCSS("pointer-events", "none");
  await preview.dragTo(grid, { targetPosition: { x: 30, y: 30 } });
  const brick = grid.locator("[data-brick-id]");
  await expect(brick).toHaveCount(1);
  await expect(page.locator(".brick-drag-handle")).toHaveCount(0);
  await expect(brick.locator(".react-resizable-handle-se")).toHaveCount(1);
  const before = await brick.boundingBox();
  if (!before) throw new Error("Brick has no bounds");
  // Pointer starts over the SVG, whose events must reach the brick surface.
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + before.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(brick).not.toHaveAttribute("data-grid-x", "0");
  const xsX = await brick.getAttribute("data-grid-x");
  await page.getByRole("button", { name: "1024px grid width", exact: true }).click();
  await expect(brick).toHaveCSS("width", "256px");
  await brick.locator(".react-resizable-handle-se").hover();
  const handle = await brick.locator(".react-resizable-handle-se").boundingBox();
  if (!handle) throw new Error("Resize handle has no bounds");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 128, handle.y + handle.height / 2 + 128, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(brick).toHaveAttribute("data-grid-w", "3");
  await expect(brick).toHaveAttribute("data-grid-h", "3");
  await page.reload();
  await expect(brick).toHaveAttribute("data-grid-w", "3");
  await expect(brick).toHaveAttribute("data-grid-h", "3");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  await expect(brick).toHaveAttribute("data-grid-w", "2");
  await expect(brick).toHaveAttribute("data-grid-h", "2");
  await expect(brick).toHaveAttribute("data-grid-x", xsX!);
  await brick.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(brick).toHaveAttribute("data-grid-x", xsX!);
});
