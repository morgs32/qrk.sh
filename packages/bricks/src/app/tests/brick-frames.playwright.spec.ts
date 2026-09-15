import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 2200, height: 1100 } });

for (const [collection, content, view] of [
  ["github", "profile", "4x4"],
  ["swatch", "default", "2x2"],
]) {
  test(`${collection} frames inherit, persist, and contain working controls`, async ({
    page,
  }, testInfo) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/scraper-rpc")) requests++;
    });
    await page.goto(`/collections/${collection}?content=${content}&view=${view}`);
    await page.getByRole("button", { name: "375px grid width" }).click();
    await expect(page.getByRole("switch", { name: "Card frame" })).toHaveCount(0);
    const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
    await page
      .locator("[data-content-view-brick] .brick-drag-handle")
      .dragTo(grid, { targetPosition: { x: 20, y: 20 } });
    const placed = grid.locator("[data-brick-id]");
    await expect(placed).toHaveCount(1);
    await placed.getByRole("link", { name: "Edit brick" }).click();
    const toggle = page.getByRole("switch", { name: "Card frame" });
    await expect(toggle).not.toBeChecked();
    const actions = page.getByRole("button", { name: "Hide brick", exact: true }).locator("..");
    await expect(actions.getByRole("switch", { name: "Card frame" })).toBeVisible();
    const preview = page.getByTestId("selected-brick-preview");
    const requestsBefore = requests;
    for (const width of [375, 1024]) {
      await page.getByRole("button", { name: `${width}px grid width` }).click();
      await expect(placed).toHaveCSS(
        "width",
        `${Math.round((width * Number(view.split("x")[0])) / 8)}px`,
      );
      const before = await placed.boundingBox();
      await toggle.setChecked(true);
      const card = placed.locator('[data-brick-frame="card"]');
      await expect(card).toHaveCSS("padding-top", "8px");
      await expect(card).toHaveCSS("padding-left", "8px");
      await expect(card).not.toHaveCSS("box-shadow", "none");
      await expect(preview.locator('[data-brick-frame="card"]')).toBeVisible();
      expect(await placed.boundingBox()).toEqual(before);
      const bounds = await card.boundingBox();
      for (const control of [
        card.getByRole("link", { name: "Edit brick" }),
        card.getByRole("button", { name: "Drag brick" }),
      ]) {
        const rect = await control.boundingBox();
        expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
        expect(rect!.y).toBeGreaterThanOrEqual(bounds!.y);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
      }
      const inner = await card.locator(".brick-drag-content").boundingBox();
      expect(inner!.width).toBeGreaterThan(0);
      expect(inner!.height).toBeGreaterThan(0);
      // Padding is inside the Card's one-pixel border.
      expect(inner!.x - bounds!.x).toBe(9);
      expect(inner!.y - bounds!.y).toBe(9);
      await page.screenshot({ path: testInfo.outputPath(`card-${width}.png`) });
      await toggle.setChecked(false);
    }
    await page.getByRole("button", { name: "375px grid width" }).click();
    await toggle.setChecked(true);
    await page.getByRole("button", { name: "1024px grid width" }).click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Inherit from xs" }).click();
    await expect(toggle).toBeChecked();
    await page.getByRole("button", { name: "Hide brick", exact: true }).click();
    await toggle.setChecked(false);
    await expect(placed).toHaveCount(0);
    await page.getByRole("button", { name: "Show brick", exact: true }).click();
    await expect(placed.locator('[data-brick-frame="default"]')).toBeVisible();
    await toggle.setChecked(true);
    await page.reload();
    await expect(toggle).toBeChecked();
    await expect(placed.locator('[data-brick-frame="card"]')).toBeVisible();
    // Rearrange via the existing handle now nested inside the Card.
    const handle = await placed.getByRole("button", { name: "Drag brick" }).boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2 + 128, handle!.y + handle!.height / 2, {
      steps: 12,
    });
    await page.mouse.up();
    await expect(placed).toHaveAttribute("data-grid-x", "1");
    await expect(placed.locator('[data-brick-frame="card"]')).toBeVisible();
    await page.getByRole("link", { name: "Brick collections", exact: true }).click();
    await placed.getByRole("link", { name: "Edit brick" }).click();
    await expect(toggle).toBeChecked();
    expect(requests).toBe(requestsBefore);
  });
}

test("upgrades legacy entries without carrying cardView forward or resetting other values", async ({
  page,
}) => {
  await page.goto("/collections/github?content=profile&view=4x4");
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
    delete brick.xs.frame;
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
    frame: "default",
  });
  expect(saved.bricksById[id]).not.toHaveProperty("md");
  expect(saved.bricksById[id]).not.toHaveProperty("2xl");
  expect(saved.bricksById[id].lg.frame).toBe("card");
  expect(saved.bricksById[id]).not.toHaveProperty("sm");
  expect(saved.bricksById[id].data).toEqual(expected.data);
  expect(saved.selectedWidth).toBe(expected.selectedWidth);
});
