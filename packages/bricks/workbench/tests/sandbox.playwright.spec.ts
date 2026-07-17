import { expect, test } from "@playwright/test";

test("catalog links every collection and preserves two-part brick URLs", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-collection-link]")).toHaveCount(18);

  await page.locator('[data-collection-link="orange-flag"]').click();
  await expect(page.locator("[data-brick-link]")).toHaveCount(3);
  await expect(page.locator('[data-brick-link="orange-flag/2x2"]')).toHaveAttribute(
    "href",
    "/bricks/orange-flag/2x2",
  );
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
