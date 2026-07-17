import { expect, test } from "@playwright/test";

test("catalog opens collections with vertical, full-size bricks on the left", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("qrk-bricks-sandbox-grid");
  });

  await expect(page.locator("[data-collection-link]")).toHaveCount(18);

  await page.locator('[data-collection-link="orange-flag"]').click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-brick-full-size]")).toHaveCount(3);
  const brickSizes = await page
    .locator('[data-brick-full-size="orange-flag/8x2"]')
    .evaluate((brickElement) => {
      const brick = brickElement.getBoundingClientRect();
      const pane = brickElement.parentElement?.getBoundingClientRect();
      return { brickWidth: brick.width, brickHeight: brick.height, paneWidth: pane?.width };
    });
  expect(brickSizes.brickWidth).toBe(brickSizes.paneWidth);
  expect(brickSizes.brickHeight).toBe(brickSizes.brickWidth / 4);

  const twoByTwoSize = await page
    .locator('[data-brick-full-size="orange-flag/2x2"]')
    .evaluate((brickElement) => brickElement.getBoundingClientRect().width);
  expect(twoByTwoSize).toBe(brickSizes.brickWidth / 4);

  const grid = page.getByLabel("Brick grid");
  await expect(grid).toBeVisible();
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  const gridFixtureSize = await page.getByTestId("grid-fixture-1").evaluate((fixtureElement) => {
    const fixture = fixtureElement.getBoundingClientRect();
    const grid = fixtureElement.parentElement?.parentElement?.getBoundingClientRect();
    return {
      fixtureWidth: fixture.width,
      fixtureHeight: fixture.height,
      gridWidth: grid?.width ?? 0,
    };
  });
  expect(gridFixtureSize.fixtureWidth).toBe(gridFixtureSize.gridWidth / 4);
  expect(gridFixtureSize.fixtureHeight).toBe(gridFixtureSize.fixtureWidth);

  const gridLayout = grid.locator(".react-grid-layout");
  await page
    .locator('[data-brick-full-size="orange-flag/2x2"]')
    .dragTo(gridLayout, { targetPosition: { x: 20, y: 20 } });

  const droppedBrick = page.locator('[data-grid-brick="orange-flag/2x2"]');
  await expect(droppedBrick).toBeVisible();
  await expect(droppedBrick.locator("svg")).toBeVisible();
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  const droppedBrickSize = await droppedBrick.evaluate((brickElement) => {
    const brick = brickElement.getBoundingClientRect();
    return { width: brick.width, height: brick.height };
  });
  expect(droppedBrickSize.width).toBe(gridFixtureSize.fixtureWidth);
  expect(droppedBrickSize.height).toBe(gridFixtureSize.fixtureHeight);

  const originalDroppedBrickBox = await droppedBrick.boundingBox();
  const gridLayoutBox = await gridLayout.boundingBox();
  expect(originalDroppedBrickBox).not.toBeNull();
  expect(gridLayoutBox).not.toBeNull();
  if (!originalDroppedBrickBox || !gridLayoutBox) {
    throw new Error("Expected the dropped brick and grid layout to have browser layout boxes");
  }

  await droppedBrick.dragTo(gridLayout, {
    targetPosition: { x: gridLayoutBox.width - 20, y: gridLayoutBox.height - 20 },
  });
  await expect
    .poll(async () => (await droppedBrick.boundingBox())?.x)
    .not.toBe(originalDroppedBrickBox.x);
  const movedDroppedBrickBox = await droppedBrick.boundingBox();
  expect(movedDroppedBrickBox).not.toBeNull();
  if (!movedDroppedBrickBox) {
    throw new Error("Expected the moved grid brick to have a browser layout box");
  }
  const movedGridX = await droppedBrick.getAttribute("data-grid-x");
  const movedGridY = await droppedBrick.getAttribute("data-grid-y");
  expect(movedGridX).not.toBeNull();
  expect(movedGridY).not.toBeNull();

  await droppedBrick.click();
  await expect(page).toHaveURL(/\/collections\/orange-flag\/gridBrick\/[^/]+$/);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview").locator("svg")).toBeVisible();
  const gridBrickDetailUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(gridBrickDetailUrl);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview").locator("svg")).toBeVisible();
  const restoredDroppedBrick = page.locator('[data-grid-brick="orange-flag/2x2"]');
  await expect(restoredDroppedBrick).toBeVisible();
  await expect(page.getByLabel("Brick grid").getByTestId(/grid-fixture-/)).toHaveCount(4);
  await expect(restoredDroppedBrick).toHaveAttribute("data-grid-x", movedGridX ?? "");
  await expect(restoredDroppedBrick).toHaveAttribute("data-grid-y", movedGridY ?? "");

  await page.goto("/collections/black-circle");
  await expect(page.getByLabel("Brick grid").getByTestId(/grid-fixture-/)).toHaveCount(4);
  await expect(page.locator('[data-grid-brick="orange-flag/2x2"]')).toHaveCount(0);

  await page.goto(gridBrickDetailUrl);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.locator('[data-grid-brick="orange-flag/2x2"]')).toBeVisible();

  await page.goto("/collections/orange-flag/gridBrick/missing-grid-brick");
  await expect(page.getByTestId("grid-brick-not-found")).toBeVisible();
  await expect(page.getByLabel("Brick grid")).toBeVisible();
  await expect(page.getByLabel("Brick grid").getByTestId(/grid-fixture-/)).toHaveCount(4);
});

test("renders static, image, and GitHub bricks", async ({ page }) => {
  await page.goto("/bricks/orange-flag/2x2");
  await expect(page.getByTestId("brick-preview").locator("svg")).toBeVisible();

  await page.goto("/bricks/image/4x4");
  await expect(page.getByTestId("brick-preview").locator("img")).toBeVisible();

  await page.goto("/bricks/github-cards/4x4");
  await expect(page.getByTestId("brick-preview").locator('[data-slot="card"]')).toBeVisible();
});

test("resizes the preview proportionally and switches canvas theme", async ({ page }) => {
  await page.goto("/bricks/orange-flag/2x2");
  await page.waitForLoadState("networkidle");

  const preview = page.getByTestId("brick-preview");
  await expect(preview).toHaveCSS("width", "160px");
  await expect(preview).toHaveCSS("height", "160px");

  const slider = page.getByLabel(/Grid unit/);
  const sliderBox = await slider.boundingBox();

  expect(sliderBox).not.toBeNull();
  if (!sliderBox) {
    throw new Error("Expected the grid-unit slider to have a browser layout box");
  }

  await page.mouse.click(sliderBox.x + sliderBox.width - 1, sliderBox.y + sliderBox.height / 2);
  await expect(preview).toHaveCSS("width", "320px");
  await expect(preview).toHaveCSS("height", "320px");

  await expect(page.getByTestId("brick-canvas")).toHaveAttribute("data-canvas-theme", "light");
  await page.getByRole("button", { name: "Use dark canvas" }).click();
  await expect(page.getByTestId("brick-canvas")).toHaveAttribute("data-canvas-theme", "dark");
});

test("shows explicit not-found states", async ({ page }) => {
  await page.goto("/collections/not-a-collection");
  await expect(page.getByTestId("collection-not-found")).toBeVisible();

  await page.goto("/bricks/orange-flag/not-a-brick");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
});
