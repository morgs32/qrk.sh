import { expect, test } from "@playwright/test";

test("selects, drags, and restores distinct catalogs with identical dimensions", async ({
  page,
}) => {
  // Add fixtures only to this browser's group response, never the production group.
  await page.route("**/groupsHash.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}
        const fixtureContent = groupsHash.swatch.catalogs.default;
        const fixtureBrick = fixtureContent;
        groupsHash.swatch.catalogs.summary = {
          ...fixtureContent, label: "Summary",
          def: { ...fixtureBrick.def, catalogId: "summary", label: "Summary" },
          component: () => "Summary fixture content",
        };
        groupsHash.swatch.catalogs.activity = {
          ...fixtureContent, label: "Activity",
          def: { ...fixtureBrick.def, catalogId: "activity", label: "Activity" },
          component: () => "Activity fixture content",
        };
      `,
    });
  });
  await page.goto("/groups/swatch?catalog=summary");
  const preview = page.locator("[data-catalog-brick]");
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
        groupId: "swatch",
        catalogId: "summary",
        xs: expect.objectContaining({
          gridItem: expect.objectContaining({ w: 2, h: 2 }),
        }),
      }),
      expect.objectContaining({
        groupId: "swatch",
        catalogId: "activity",
        xs: expect.objectContaining({
          gridItem: expect.objectContaining({ w: 2, h: 2 }),
        }),
      }),
    ]),
  );
  for (const brick of Object.values(saved.state.bricksById))
    expect(brick).not.toHaveProperty("size");
});

test("uses catalog queries and standalone catalog routes", async ({ page }) => {
  await page.goto("/groups/github?catalog=repo");
  await expect(page.locator("[data-catalog-brick]")).toHaveAttribute(
    "data-catalog-brick",
    "github/repo",
  );
  await page.goto("/bricks/github/repo");
  await expect(page.getByText("Catalog", { exact: true })).toBeVisible();
  await expect(page.getByText("View", { exact: true })).toHaveCount(0);
});

test("drags over SVG content, resizes at the default corner, and preserves editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 3000, height: 1100 });
  await page.goto("/groups/icon");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const preview = page.locator("[data-catalog-brick]");
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
