import { expect, test } from "@playwright/test";

test("shares one persisted grid across the root, collection, and detail routes", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("qrk-bricks-sandbox-grid");
    window.localStorage.removeItem("qrk-bricks-sandbox-single-grid");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("[data-collection-link]")).toHaveCount(6);
  await expect(page.locator("[data-collection-entry]")).toHaveCount(6);
  await expect(page.locator("[data-collection-representative]")).toHaveCount(6);
  await expect(page.getByLabel("Brick collections")).toBeVisible();

  const swatchCollection = page.locator('[data-collection-entry="swatch"]');
  await swatchCollection.getByRole("tab", { name: "8x2" }).click();
  await expect(
    swatchCollection.locator('[data-collection-representative="swatch/default/8x2"]'),
  ).toBeVisible();
  await expect(
    swatchCollection.locator('[data-collection-representative="swatch/default/2x2"]'),
  ).toHaveCount(0);
  await swatchCollection.getByRole("tab", { name: "2x2" }).click();

  const rootGrid = page.getByLabel("Brick grid");
  await expect(rootGrid).toBeVisible();
  await expect(rootGrid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  const persistentGridElement = await rootGrid.elementHandle();
  expect(persistentGridElement).not.toBeNull();
  const rootGridLayout = rootGrid.locator(".react-grid-layout");

  await page
    .locator('[data-collection-representative="swatch/default/2x2"]')
    .dragTo(rootGridLayout, { targetPosition: { x: 20, y: 20 } });
  await page
    .locator('[data-collection-representative="icon/default/2x2"]')
    .dragTo(rootGridLayout, { targetPosition: { x: 180, y: 20 } });

  const swatchBrick = page.locator('[data-brick="swatch/default/2x2"]');
  const iconBrick = page.locator('[data-brick="icon/default/2x2"]');
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();

  const originalSwatchBrickBox = await swatchBrick.boundingBox();
  const rootGridLayoutBox = await rootGridLayout.boundingBox();
  expect(originalSwatchBrickBox).not.toBeNull();
  expect(rootGridLayoutBox).not.toBeNull();
  if (!originalSwatchBrickBox || !rootGridLayoutBox) {
    throw new Error("Expected the root grid and swatch brick to have browser layout boxes");
  }

  await swatchBrick.dragTo(rootGridLayout, {
    targetPosition: { x: rootGridLayoutBox.width - 20, y: rootGridLayoutBox.height - 20 },
  });
  await expect
    .poll(async () => (await swatchBrick.boundingBox())?.x)
    .not.toBe(originalSwatchBrickBox.x);
  const movedGridX = await swatchBrick.getAttribute("data-grid-x");
  const movedGridY = await swatchBrick.getAttribute("data-grid-y");
  expect(movedGridX).not.toBeNull();
  expect(movedGridY).not.toBeNull();

  await page.locator('[data-collection-link="swatch"]').click();
  await page.waitForLoadState("networkidle");
  expect(await persistentGridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator("[data-brick-full-size]")).toHaveCount(3);
  const brickSizes = await page
    .locator('[data-brick-full-size="swatch/default/8x2"]')
    .evaluate((brickElement) => {
      const brick = brickElement.getBoundingClientRect();
      const pane = brickElement.parentElement?.getBoundingClientRect();
      return { brickWidth: brick.width, brickHeight: brick.height, paneWidth: pane?.width };
    });
  expect(brickSizes.brickWidth).toBe(brickSizes.paneWidth);
  expect(brickSizes.brickHeight).toBe(brickSizes.brickWidth / 4);

  const twoByTwoSize = await page
    .locator('[data-brick-full-size="swatch/default/2x2"]')
    .evaluate((brickElement) => brickElement.getBoundingClientRect().width);
  expect(twoByTwoSize).toBe(brickSizes.brickWidth / 4);

  const collectionGrid = page.getByLabel("Brick grid");
  await expect(collectionGrid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();
  await expect(swatchBrick).toHaveAttribute("data-grid-x", movedGridX ?? "");
  await expect(swatchBrick).toHaveAttribute("data-grid-y", movedGridY ?? "");

  await page.getByRole("link", { name: "All collections" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await persistentGridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();
  await page.locator('[data-collection-link="swatch"]').click();

  const swatchBrickId = await swatchBrick.getAttribute("data-brick-id");
  expect(swatchBrickId).not.toBeNull();
  await swatchBrick.click();
  await expect(page).toHaveURL(/\/collections\/swatch\/brick\/[^/]+$/);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview").locator("svg")).toBeVisible();
  const brickDetailUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(brickDetailUrl);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview").locator("svg")).toBeVisible();
  const restoredSwatchBrick = page.locator('[data-brick="swatch/default/2x2"]');
  await expect(restoredSwatchBrick).toBeVisible();
  await expect(page.locator('[data-brick="icon/default/2x2"]')).toBeVisible();
  await expect(page.getByLabel("Brick grid").getByTestId(/grid-fixture-/)).toHaveCount(4);
  await expect(restoredSwatchBrick).toHaveAttribute("data-grid-x", movedGridX ?? "");
  await expect(restoredSwatchBrick).toHaveAttribute("data-grid-y", movedGridY ?? "");

  await page.goto("/collections/swatch/brick/missing-brick");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await expect(page.getByLabel("Brick grid")).toBeVisible();

  await page.goto(`/collections/icon/brick/${swatchBrickId}`);
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await expect(page.locator('[data-brick="swatch/default/2x2"]')).toBeVisible();
  await expect(page.locator('[data-brick="icon/default/2x2"]')).toBeVisible();
});

test("renders static, image, and GitHub bricks", async ({ page }) => {
  await page.goto("/bricks/swatch/default/2x2");
  await expect(page.getByTestId("brick-preview").locator("svg")).toBeVisible();

  await page.goto("/bricks/image/default/4x4");
  await expect(page.getByTestId("brick-preview").locator("img")).toBeVisible();

  await page.goto("/bricks/github/profile/4x4");
  await expect(page.getByTestId("brick-preview").locator('[data-slot="card"]')).toBeVisible();

  await page.goto("/bricks/github/repo/4x2");
  await expect(page.getByTestId("brick-preview").getByText("ink-steps")).toBeVisible();

  await page.goto("/bricks/github-profile/4x4");
  await expect(page.getByTestId("brick-preview")).toHaveCount(0);
});

test("shows brick config in a collection tab", async ({ page }) => {
  await page.goto("/collections/github");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "View data" }).click();
  await expect(page.getByText("Hello World", { exact: true })).toBeVisible();

  const profileView = page.getByLabel("4×4 view");
  await expect(profileView.getByRole("tab", { name: "Preview" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await profileView.getByRole("tab", { name: "View config" }).click();

  await expect(profileView.getByRole("tab", { name: "View config" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText('"collectionName": "github"', { exact: false })).toBeVisible();
});

test("resizes the preview proportionally and switches canvas theme", async ({ page }) => {
  await page.goto("/bricks/swatch/default/2x2");
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

  await page.goto("/bricks/swatch/default/not-a-brick");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
});
