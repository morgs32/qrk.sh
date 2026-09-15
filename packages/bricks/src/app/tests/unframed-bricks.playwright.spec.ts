import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 2200, height: 1100 } });

test("removes legacy card frames without resetting bricks or breaking controls", async ({
  page,
}) => {
  await page.goto("/catalogs/github?content=profile&view=4x4");
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await page
    .locator("[data-content-view-brick] .brick-drag-handle")
    .dragTo(grid, { targetPosition: { x: 20, y: 20 } });
  const id = await grid.locator("[data-brick-id]").getAttribute("data-brick-id");
  if (!id) throw new Error("Missing placed brick");
  const expected = await page.evaluate((brickId) => {
    const key = "qrk-bricks-sandbox-responsive-bricks-v2";
    const saved = JSON.parse(localStorage.getItem(key)!);
    const brick = saved.state.bricksById[brickId];
    brick.xs.frame = "card";
    brick.xs.viewOptions = { cardView: true, untouched: "keep" };
    delete brick.sm;
    brick.md = {
      gridItem: null,
      viewOptions: { cardView: false, untouched: "hidden" },
    };
    brick["2xl"] = { ...brick.md };
    brick.lg = { ...brick.xs, frame: "card", viewOptions: {} };
    localStorage.setItem(key, JSON.stringify(saved));
    return {
      data: brick.data,
      gridItem: brick.xs.gridItem,
      selectedWidth: saved.state.selectedWidth,
    };
  }, id);
  await page.reload();
  await expect(grid.locator("[data-brick-id]")).toHaveCount(1);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2")!).state,
  );
  expect(saved.bricksById[id].xs).toEqual({
    gridItem: expected.gridItem,
    viewOptions: { untouched: "keep" },
  });
  expect(saved.bricksById[id]).not.toHaveProperty("md");
  expect(saved.bricksById[id]).not.toHaveProperty("2xl");
  expect(saved.bricksById[id].lg).not.toHaveProperty("frame");
  await expect(page.getByRole("switch", { name: "Card frame" })).toHaveCount(0);
  const placed = grid.locator("[data-brick-id]");
  await placed.getByRole("link", { name: "Edit brick" }).click();
  await expect(page.getByRole("switch", { name: "Card frame" })).toHaveCount(0);
  await expect(placed.getByRole("button", { name: "Drag brick" })).toBeVisible();
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await expect(placed).toHaveCount(0);
  await page.getByRole("button", { name: "Show brick", exact: true }).click();
  await expect(placed).toBeVisible();
  expect(saved.bricksById[id]).not.toHaveProperty("sm");
  expect(saved.bricksById[id].data).toEqual(expected.data);
  expect(saved.selectedWidth).toBe(expected.selectedWidth);
});
