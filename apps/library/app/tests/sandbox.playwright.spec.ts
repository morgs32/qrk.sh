import { expect, test } from "@playwright/test";

test("shares one persisted grid across the root, group, and detail routes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("qrk-bricks-sandbox-grid");
    window.localStorage.removeItem("qrk-bricks-sandbox-responsive-bricks-v2");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const toolbar = page.getByRole("toolbar", { name: "Grid controls" });
  const drawer = page.getByRole("dialog", { name: "Bricks", exact: true });
  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();

  await expect(drawer.locator("[data-group-link]")).toHaveCount(10);
  await expect(drawer.locator("[data-group-entry]")).toHaveCount(10);
  await expect(drawer.locator("[data-group-representative]")).toHaveCount(10);
  await expect(drawer.getByLabel("Brick groups")).toBeVisible();
  await expect(
    drawer
      .locator('[data-group-entry="github"]')
      .locator('[data-group-representative="github/profile"]')
      .getByText("@morgs32"),
  ).toBeVisible();

  const swatchGroup = drawer.locator('[data-group-entry="swatch"]');
  await swatchGroup.scrollIntoViewIfNeeded();

  const rootGrid = page.getByLabel("Brick grid");
  await expect(rootGrid).toBeVisible();
  await expect(rootGrid.getByTestId(/grid-fixture-/)).toHaveCount(0);
  const persistentGridElement = await rootGrid.elementHandle();
  expect(persistentGridElement).not.toBeNull();
  const rootGridLayout = rootGrid.locator(".react-grid-layout");

  await drawer
    .locator('[data-group-representative="swatch/default"]')
    .dragTo(rootGridLayout, { targetPosition: { x: 20, y: 20 } });
  await drawer
    .locator('[data-group-representative="icon/default"]')
    .dragTo(rootGridLayout, { targetPosition: { x: 180, y: 20 } });

  const swatchBrick = page.locator('[data-brick="swatch/default"]');
  const iconBrick = page.locator('[data-brick="icon/default"]');
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();

  await drawer.getByRole("button", { name: "Close drawer" }).click();
  await expect(drawer).not.toBeVisible();

  const originalSwatchBrickBox = await swatchBrick.boundingBox();
  const rootGridLayoutBox = await rootGridLayout.boundingBox();
  expect(originalSwatchBrickBox).not.toBeNull();
  expect(rootGridLayoutBox).not.toBeNull();
  if (!originalSwatchBrickBox || !rootGridLayoutBox) {
    throw new Error("Expected the root grid and swatch brick to have browser layout boxes");
  }

  await swatchBrick.dragTo(rootGridLayout, {
    targetPosition: {
      x: rootGridLayoutBox.width - 20,
      y: rootGridLayoutBox.height - 20,
    },
  });
  await expect
    .poll(async () => (await swatchBrick.boundingBox())?.x)
    .not.toBe(originalSwatchBrickBox.x);
  const movedGridX = await swatchBrick.getAttribute("data-grid-x");
  const movedGridY = await swatchBrick.getAttribute("data-grid-y");
  expect(movedGridX).not.toBeNull();
  expect(movedGridY).not.toBeNull();

  await toolbar.getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-group-link="swatch"]').click();
  await page.waitForLoadState("networkidle");
  expect(await persistentGridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(drawer.locator("[data-catalog-brick]")).toHaveCount(1);
  await expect(drawer.locator('[data-catalog-brick="swatch/default"]')).toBeVisible();

  const groupGrid = page.getByLabel("Brick grid");
  await expect(groupGrid.getByTestId(/grid-fixture-/)).toHaveCount(0);
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();
  await expect(swatchBrick).toHaveAttribute("data-grid-x", movedGridX ?? "");
  await expect(swatchBrick).toHaveAttribute("data-grid-y", movedGridY ?? "");

  await drawer.getByRole("link", { name: "Bricks", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await persistentGridElement?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(swatchBrick).toBeVisible();
  await expect(iconBrick).toBeVisible();
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-group-link="swatch"]').click();

  const swatchBrickId = await swatchBrick.getAttribute("data-brick-id");
  expect(swatchBrickId).not.toBeNull();
  await swatchBrick.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/swatch\/brick\/[^/]+$/);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview")).toBeVisible();
  const brickDetailUrl = page.url();

  await page.reload();
  await expect(page).toHaveURL(brickDetailUrl);
  await expect(page.getByTestId("brick-detail-pane")).toBeVisible();
  await expect(page.getByTestId("selected-brick-preview")).toBeVisible();
  const restoredSwatchBrick = page.locator('[data-brick="swatch/default"]');
  await expect(restoredSwatchBrick).toBeVisible();
  await expect(page.locator('[data-brick="icon/default"]')).toBeVisible();
  await expect(page.getByLabel("Brick grid").getByTestId(/grid-fixture-/)).toHaveCount(0);
  await expect(restoredSwatchBrick).toHaveAttribute("data-grid-x", movedGridX ?? "");
  await expect(restoredSwatchBrick).toHaveAttribute("data-grid-y", movedGridY ?? "");

  await page.goto("/groups/swatch/brick/missing-brick");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await expect(page.getByLabel("Brick grid")).toBeVisible();

  await page.goto(`/groups/icon/brick/${swatchBrickId}`);
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
  await expect(page.locator('[data-brick="swatch/default"]')).toBeVisible();
  await expect(page.locator('[data-brick="icon/default"]')).toBeVisible();
});

test("renders static, image, and repository bricks", async ({ page }) => {
  await page.goto("/bricks/swatch/default");
  await expect(page.getByTestId("brick-preview").locator("svg")).toBeVisible();

  await page.goto("/bricks/image/default");
  await expect(page.getByTestId("brick-preview").locator("img")).toBeVisible();

  await page.goto("/bricks/github/repo");
  await expect(page.getByTestId("brick-preview").getByText("ink-steps")).toBeVisible();

  await page.goto("/bricks/github-profile");
  await expect(page.getByTestId("brick-preview")).toHaveCount(0);
});

test("renders the Link default 4x2 preview", async ({ page }) => {
  await page.goto("/bricks/link/default");

  const linkCard = page.getByTestId("brick-preview").locator('[data-link-card="default"]');
  await expect(linkCard).toBeVisible();
  await expect(linkCard).toHaveAttribute("href", "https://apps.apple.com/");
  await expect(
    linkCard.getByText("Celebrate our birthday & get Pro free for one year"),
  ).toBeVisible();
  await expect(linkCard.getByText("apps.apple.com")).toBeVisible();
  await expect(linkCard.locator("img")).toHaveCount(2);
});

test("renders default GitHub profile data in the direct preview", async ({ page }) => {
  await page.goto("/bricks/github/profile");

  await expect(page.getByTestId("brick-preview").locator('[data-slot="card"]')).toBeVisible();
  await expect(page.getByTestId("brick-preview").getByText("@morgs32")).toBeVisible();
});

test("loads a selected Google place into the Map preview", async ({ page }) => {
  await page.goto("/groups/map/place");

  const mapPreview = page.locator('[data-catalog-brick="map/place"]');
  await expect(
    mapPreview.locator('[data-map-place-id="ChIJ7cv00DwsDogRAMDACa2m4K8"]'),
  ).toBeVisible();
  await expect(mapPreview.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(
    mapPreview.locator('[data-map-marker-place-id="ChIJ7cv00DwsDogRAMDACa2m4K8"]'),
  ).toBeVisible();

  const placeLookup = page.getByLabel("googlePlaceId");
  await expect(placeLookup).toHaveValue(/Chicago/i);
  await placeLookup.fill("Millennium Park Chicago");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option").first()).toBeVisible();
  await placeLookup.press("ArrowDown");
  await placeLookup.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  const result = page.getByTestId("catalog-data-result");
  await expect(result).toContainText('name:"Millennium Park"');
  await expect(result).toContainText("latitude:");
  await expect(result).toContainText("longitude:");
  await expect
    .poll(() => mapPreview.locator("[data-map-place-id]").getAttribute("data-map-place-id"))
    .not.toBe("ChIJ7cv00DwsDogRAMDACa2m4K8");

  await page.getByRole("button", { name: "Clear place search" }).click();
  await expect(placeLookup).toHaveValue("");
});

test("searches Streamline and loads the selected SVG into every Icon preview", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/groups/icon/default");
  const previewImage = page.locator("[data-catalog-brick] img");
  await expect(previewImage).toBeVisible();
  const initialSource = await previewImage.getAttribute("src");
  if (initialSource === null) throw new Error("Expected an initial icon image");

  await page.getByLabel("Search icons").fill("home");
  const firstIcon = page
    .getByRole("listbox", { name: "Streamline icon results" })
    .getByRole("option")
    .first();
  await expect(firstIcon).toBeVisible();
  const svgResponse = page.waitForResponse((response) => response.url().endsWith("/scraper-rpc"));
  await firstIcon.click();
  await (await svgResponse).finished();
  await expect(page.getByRole("status")).toHaveCount(0);
  const errors = await page
    .locator('[data-testid="catalog-data-error"], [data-testid="catalog-request-error"]')
    .allTextContents();
  expect(errors).toEqual([]);
  await expect(firstIcon).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

  const result = page.getByTestId("catalog-data-result");
  await expect(result).toContainText("ico_");
  await expect(result).toContainText("<svg");
  await expect(previewImage).not.toHaveAttribute("src", initialSource);
  const selectedSource = await previewImage.getAttribute("src");
  if (selectedSource === null) throw new Error("Expected the selected icon image");
  await expect(page.getByTestId("catalog-data-error")).toHaveCount(0);

  await expect(previewImage).toHaveAttribute("src", selectedSource);
});

test("renders the Map brick through preview, group, Grid, and detail boundaries", async ({
  page,
}) => {
  await page.goto("/bricks/map/place");
  await expect(page.getByTestId("brick-preview").locator(".mapboxgl-canvas")).toBeVisible();

  await page.goto("/groups/map");
  const groupMap = page.locator('[data-catalog-brick="map/place"]');
  await expect(groupMap.locator(".mapboxgl-canvas")).toBeVisible();

  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await groupMap.dragTo(grid, { targetPosition: { x: 20, y: 20 } });

  const placedMap = page.locator('[data-brick="map/place"]');
  await expect(placedMap.locator(".mapboxgl-canvas")).toBeVisible();
  await placedMap.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page).toHaveURL(/\/groups\/map\/brick\/[^/]+$/);
  await expect(
    page.getByTestId("selected-brick-preview").locator(".mapboxgl-canvas"),
  ).toBeVisible();
});

test("renders one Figma thumbnail content", async ({ page }) => {
  await page.goto("/groups/figma");
  await expect(page.getByRole("link", { name: "Thumbnail", exact: true })).toBeVisible();
  const card = page.locator('[data-figma-card="thumbnail"]');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute("href");
  await expect(card.locator('[data-figma-fallback="thumbnail"]')).toBeVisible();
});

test("renders the GitHub profile responsive presentation", async ({ page }) => {
  await page.goto("/bricks/github/profile");

  await expect(page.getByTestId("brick-preview").getByText("@morgs32")).toBeVisible();
});

test("authors Text group content as Tiptap JSON", async ({ page }) => {
  await page.goto("/groups/text/default");
  await page.waitForLoadState("networkidle");

  const editor = page.getByLabel("Text content");
  await expect(editor).toBeVisible();
  await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

  await editor.fill("Hello from Tiptap");
  await editor.selectText();
  await page.getByRole("button", { name: "Bold" }).click();

  const catalogOptions = page.getByTestId("catalog-data-result");
  await expect(catalogOptions).toContainText("Hello from Tiptap");
  await expect(catalogOptions).toContainText("bold");
});

test("shows one catalog configuration directly from the group", async ({ page }) => {
  await page.goto("/groups/github");
  const pane = page.getByTestId("catalog-configuration-pane");
  await expect(pane).toBeVisible();
  await expect(page.getByLabel("Brick grid")).toHaveCount(1);
  await expect(page.getByText("Catalog name", { exact: true })).toBeVisible();
  await expect(page.getByText("View", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-catalog-brick="github/profile"]')).toContainText("@morgs32");
  await expect(page.getByLabel("URL", { exact: true })).toHaveValue("https://github.com/morgs32");
});

test("updates the GitHub profile preview and retains the last success after an error", async ({
  page,
}) => {
  await page.goto("/groups/github/profile");
  await page.waitForLoadState("networkidle");

  const urlInput = page.getByLabel("url");
  await expect(urlInput).toHaveValue("https://github.com/morgs32");
  await urlInput.fill("https://github.com/octocat");

  const result = page.getByTestId("catalog-data-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText('login:"octocat"');
  await expect(
    page.locator('[data-catalog-brick="github/profile"]').getByText("@octocat"),
  ).toBeVisible();

  await result.getByText('"octocat"', { exact: true }).dblclick();
  await result.getByRole("textbox").fill("edited-fetched");
  await result.getByRole("textbox").press("Enter");
  await expect(result).toContainText('login:"edited-fetched"');
  await expect(
    page.locator('[data-catalog-brick="github/profile"]').getByText("@edited-fetched"),
  ).toBeVisible();

  await page.getByLabel("url").fill("https://github.com/topics/effect");

  const error = page.getByTestId("catalog-data-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("invalid-scrape-request");
  await expect(error).toContainText("GitHub scrapes require https://github.com/<login>");
  await expect(result).toContainText('login:"edited-fetched"');
  await expect(
    page.locator('[data-catalog-brick="github/profile"]').getByText("@edited-fetched"),
  ).toBeVisible();
});

test("renders one responsive presentation on a catalog page", async ({ page }) => {
  await page.goto("/groups/swatch/default");
  await expect(page.getByText("View", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-catalog-brick="swatch/default"]')).toHaveCount(1);
});

test("resizes the preview proportionally and switches canvas theme", async ({ page }) => {
  await page.goto("/bricks/swatch/default");
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
  await page.goto("/groups/not-a-group");
  await expect(page.getByTestId("group-not-found")).toBeVisible();

  await page.goto("/bricks/swatch/not-a-catalog");
  await expect(page.getByTestId("brick-not-found")).toBeVisible();
});
