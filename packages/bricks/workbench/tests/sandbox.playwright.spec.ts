import { expect, test } from "@playwright/test";

test("catalog opens collections with vertical, full-size bricks on the left", async ({ page }) => {
  await page.goto("/");

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
