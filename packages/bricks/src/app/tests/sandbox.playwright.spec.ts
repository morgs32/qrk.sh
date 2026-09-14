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

  await expect(page.locator("[data-collection-link]")).toHaveCount(9);
  await expect(page.locator("[data-collection-entry]")).toHaveCount(9);
  await expect(page.locator("[data-collection-representative]")).toHaveCount(9);
  await expect(page.getByLabel("Brick collections")).toBeVisible();
  await expect(
    page
      .locator('[data-collection-entry="github"]')
      .locator('[data-collection-representative="github/profile/4x4"]')
      .getByText("@morgs32"),
  ).toBeVisible();

  const swatchCollection = page.locator('[data-collection-entry="swatch"]');
  await swatchCollection.getByRole("tab", { name: "8×2" }).click();
  await expect(
    swatchCollection.locator('[data-collection-representative="swatch/default/8x2"]'),
  ).toBeVisible();
  await expect(
    swatchCollection.locator('[data-collection-representative="swatch/default/2x2"]'),
  ).toHaveCount(0);
  await swatchCollection.getByRole("tab", { name: "2×2" }).click();

  const rootGrid = page.getByLabel("Brick grid");
  await expect(rootGrid).toBeVisible();
  await expect(rootGrid.getByTestId(/grid-fixture-/)).toHaveCount(4);
  const persistentGridElement = await rootGrid.elementHandle();
  expect(persistentGridElement).not.toBeNull();
  const rootGridLayout = rootGrid.locator(".react-grid-layout");

  await page
    .locator('[data-collection-representative="swatch/default/2x2"]')
    .locator(".brick-drag-handle")
    .dragTo(rootGridLayout, { targetPosition: { x: 20, y: 20 } });
  await page
    .locator('[data-collection-representative="icon/default/2x2"]')
    .locator(".brick-drag-handle")
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

  await swatchBrick.locator(".brick-drag-handle").dragTo(rootGridLayout, {
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
  await expect(page.locator("[data-brick-full-layout]")).toHaveCount(3);
  const brickSizes = await page
    .locator('[data-brick-full-layout="swatch/default/8x2"]')
    .evaluate((brickElement) => {
      const brick = brickElement.getBoundingClientRect();
      const pane = brickElement.parentElement?.getBoundingClientRect();
      return { brickWidth: brick.width, brickHeight: brick.height, paneWidth: pane?.width };
    });
  expect(brickSizes.brickWidth).toBe(brickSizes.paneWidth);
  expect(brickSizes.brickHeight).toBe(brickSizes.brickWidth / 4);

  const twoByTwoSize = await page
    .locator('[data-brick-full-layout="swatch/default/2x2"]')
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

test("renders static, image, and repository bricks", async ({ page }) => {
  await page.goto("/bricks/swatch/default/2x2");
  await expect(page.getByTestId("brick-preview").locator("svg")).toBeVisible();

  await page.goto("/bricks/image/default/4x4");
  await expect(page.getByTestId("brick-preview").locator("img")).toBeVisible();

  await page.goto("/bricks/github/repo/4x2");
  await expect(page.getByTestId("brick-preview").getByText("ink-steps")).toBeVisible();

  await page.goto("/bricks/github-profile/4x4");
  await expect(page.getByTestId("brick-preview")).toHaveCount(0);
});

test("renders the Link default 4x2 preview", async ({ page }) => {
  await page.goto("/bricks/link/default/4x2");

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
  await page.goto("/bricks/github/profile/4x4");

  await expect(page.getByTestId("brick-preview").locator('[data-slot="card"]')).toBeVisible();
  await expect(page.getByTestId("brick-preview").getByText("@morgs32")).toBeVisible();
});

test("loads a selected Google place into the Map preview", async ({ page }) => {
  await page.goto("/collections/map/place");

  const mapPreview = page.locator('[data-variant-layout-brick="map/place/4x4"]');
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

  const result = page.getByTestId("variant-data-result");
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
  await page.goto("/collections/icon/default");
  const previewImage = page.locator("[data-variant-layout-brick] img");
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
    .locator('[data-testid="variant-data-error"], [data-testid="variant-request-error"]')
    .allTextContents();
  expect(errors).toEqual([]);
  await expect(firstIcon).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

  const result = page.getByTestId("variant-data-result");
  await expect(result).toContainText("ico_");
  await expect(result).toContainText("<svg");
  await expect(previewImage).not.toHaveAttribute("src", initialSource);
  const selectedSource = await previewImage.getAttribute("src");
  if (selectedSource === null) throw new Error("Expected the selected icon image");
  await expect(page.getByTestId("variant-data-error")).toHaveCount(0);

  for (const layout of ["4x4", "8x2", "2x2"]) {
    await page.locator(`a[href="/collections/icon?variant=default&layout=${layout}"]`).click();
    await expect(
      page.locator(`[data-variant-layout-brick="icon/default/${layout}"] img`),
    ).toHaveAttribute("src", selectedSource);
    await expect(result).toContainText("ico_");
  }
});

test("renders the Map brick through preview, collection, Grid, and detail boundaries", async ({
  page,
}) => {
  await page.goto("/bricks/map/place/4x4");
  await expect(page.getByTestId("brick-preview").locator(".mapboxgl-canvas")).toBeVisible();

  await page.goto("/collections/map");
  const collectionMap = page.locator('[data-brick-full-layout="map/place/4x4"]');
  await expect(collectionMap.locator(".mapboxgl-canvas")).toBeVisible();

  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await collectionMap
    .locator(".brick-drag-handle")
    .dragTo(grid, { targetPosition: { x: 20, y: 20 } });

  const placedMap = page.locator('[data-brick="map/place/4x4"]');
  await expect(placedMap.locator(".mapboxgl-canvas")).toBeVisible();
  await placedMap.click({ position: { x: 2, y: 2 } });
  await expect(page).toHaveURL(/\/collections\/map\/brick\/[^/]+$/);
  await expect(
    page.getByTestId("selected-brick-preview").locator(".mapboxgl-canvas"),
  ).toBeVisible();
});

test("renders four distinct default Figma file variants", async ({ page }) => {
  await page.goto("/collections/figma");
  await page.waitForLoadState("networkidle");

  await expect(
    page.getByText("Live previews for Figma files, boards, slides, and prototypes."),
  ).toBeVisible();
  await expect(page.getByText("design", { exact: true })).toBeVisible();
  await expect(page.getByText("board", { exact: true })).toBeVisible();
  await expect(page.getByText("slides", { exact: true })).toBeVisible();
  await expect(page.getByText("prototype", { exact: true })).toBeVisible();

  const design = page.locator('[data-figma-card="design"]');
  await expect(design).toBeVisible();
  await expect(design).not.toHaveAttribute("href");
  await expect(design.locator('[data-figma-fallback="design"]')).toBeVisible();

  const board = page.locator('[data-figma-card="board"]');
  await expect(board).toBeVisible();
  await expect(board).not.toHaveAttribute("href");
  await expect(board.locator('[data-figma-fallback="board"]')).toBeVisible();

  const slides = page.locator('[data-figma-card="slides"]');
  await expect(slides).toBeVisible();
  await expect(slides).not.toHaveAttribute("href");
  await expect(slides.locator('[data-figma-fallback="slides"]')).toBeVisible();

  const prototype = page.locator('[data-figma-card="prototype"]');
  await expect(prototype).toBeVisible();
  await expect(prototype).not.toHaveAttribute("href");
  await expect(prototype.locator('[data-figma-fallback="prototype"]')).toBeVisible();
  await expect(prototype.getByLabel("Open prototype")).toBeVisible();
});

test("loads a Figma Design preview and retains it after a type mismatch", async ({ page }) => {
  await page.goto("/collections/figma/design");
  await page.waitForLoadState("networkidle");

  const designCard = page.locator('[data-figma-card="design"]');
  await expect(designCard).not.toHaveAttribute("href");

  const urlInput = page.getByLabel("url");
  await urlInput.fill("https://www.figma.com/design/x1KYuaPaEo89CE715oUD4I/qrk.sh?node-id=46-459");

  const canonicalUrl = "https://www.figma.com/design/x1KYuaPaEo89CE715oUD4I";
  const result = page.getByTestId("variant-data-result");
  await expect(result).toContainText(`url:"${canonicalUrl}"`);
  await expect(designCard).toHaveAttribute("href", canonicalUrl);
  await expect(designCard).toHaveAttribute("target", "_blank");
  await expect(designCard).toHaveAttribute("rel", "noopener noreferrer");
  await expect(designCard.locator('[data-figma-thumbnail="design"]')).toBeVisible();

  await urlInput.fill("https://www.figma.com/board/BcDeFgHiJkLmNoPqRsTuVw/Example-board");

  await expect(page.getByTestId("variant-data-error")).toContainText("file-type-mismatch");
  await expect(designCard).toHaveAttribute("href", canonicalUrl);
  await expect(designCard.locator('[data-figma-thumbnail="design"]')).toBeVisible();
  await expect(result).toContainText(`url:"${canonicalUrl}"`);
});

test("renders the GitHub profile activity layout", async ({ page }) => {
  await page.goto("/bricks/github/profile/4x2");

  await expect(
    page.getByTestId("brick-preview").locator("[data-github-profile-activity]"),
  ).toBeVisible();
});

test("authors Text collection content as Tiptap JSON", async ({ page }) => {
  await page.goto("/collections/text/default");
  await page.waitForLoadState("networkidle");

  const editor = page.getByLabel("Text content");
  await expect(editor).toBeVisible();
  await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);

  await editor.fill("Hello from Tiptap");
  await editor.selectText();
  await page.getByRole("button", { name: "Bold" }).click();

  const payload = page.getByTestId("variant-payload-result");
  await expect(payload).toContainText("Hello from Tiptap");
  await expect(payload).toContainText("bold");
});

test("shows brick config in a collection tab", async ({ page }) => {
  await page.goto("/collections/github");
  await page.waitForLoadState("networkidle");

  const profilePreview = page.getByLabel("4×4 preview");
  await expect(profilePreview.getByRole("tab", { name: "4×4" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.locator('[data-brick-full-layout="github/profile/4x4"]').getByText("@morgs32"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Configure" }).first().click();
  await expect(page).toHaveURL(/\/collections\/github\/profile$/);
  const variantConfigurationPane = page.getByTestId("variant-configuration-pane");
  await expect(variantConfigurationPane).toBeVisible();
  await expect(page.getByLabel("Brick grid")).toHaveCount(1);
  const variantConfigurationWidths = await variantConfigurationPane.evaluate((element) => ({
    pane: element.getBoundingClientRect().width,
    document: document.documentElement.clientWidth,
  }));
  expect(variantConfigurationWidths.pane).toBe(variantConfigurationWidths.document);
  await expect(page.getByText("Variant name", { exact: true })).toBeVisible();
  await expect(page.getByText("Profile", { exact: true })).toBeVisible();
  await expect(page.getByText("Layout", { exact: true })).toHaveCount(2);
  await expect(page.locator('[data-variant-layout-brick="github/profile/4x4"]')).toBeVisible();
  await expect(page.locator('[data-variant-layout-brick="github/profile/4x2"]')).toBeVisible();
  await expect(
    page.locator('[data-variant-layout-brick="github/profile/4x4"]').getByText("@morgs32"),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-variant-layout-brick="github/profile/4x2"]')
      .locator("[data-github-profile-activity]"),
  ).toBeVisible();
  await expect(page.getByLabel("url")).toHaveValue("https://github.com/morgs32");
  await expect(page.getByRole("button", { name: "Get data" })).toHaveCount(0);
  const initialResult = page.getByTestId("variant-data-result");
  await expect(initialResult).toContainText("id:1364795");
  await expect(initialResult).toContainText('node_id:"MDQ6VXNlcjEzNjQ3OTU="');
  await expect(initialResult).toContainText('login:"morgs32"');

  await initialResult.getByText('"morgs32"', { exact: true }).dblclick();
  await initialResult.getByRole("textbox").fill("edited-default");
  await initialResult.getByRole("textbox").press("Enter");
  await expect(initialResult).toContainText('login:"edited-default"');
  await expect(
    page.locator('[data-variant-layout-brick="github/profile/4x4"]').getByText("@edited-default"),
  ).toBeVisible();
});

test("updates the GitHub profile preview and retains the last success after an error", async ({
  page,
}) => {
  await page.goto("/collections/github/profile");
  await page.waitForLoadState("networkidle");

  const urlInput = page.getByLabel("url");
  await expect(urlInput).toHaveValue("https://github.com/morgs32");
  await urlInput.fill("https://github.com/octocat");

  const result = page.getByTestId("variant-data-result");
  await expect(result).toBeVisible();
  await expect(result).toContainText('login:"octocat"');
  await expect(
    page.locator('[data-variant-layout-brick="github/profile/4x4"]').getByText("@octocat"),
  ).toBeVisible();

  await result.getByText('"octocat"', { exact: true }).dblclick();
  await result.getByRole("textbox").fill("edited-fetched");
  await result.getByRole("textbox").press("Enter");
  await expect(result).toContainText('login:"edited-fetched"');
  await expect(
    page.locator('[data-variant-layout-brick="github/profile/4x4"]').getByText("@edited-fetched"),
  ).toBeVisible();

  await page.getByLabel("url").fill("https://github.com/topics/effect");

  const error = page.getByTestId("variant-data-error");
  await expect(error).toBeVisible();
  await expect(error).toContainText("invalid-scrape-request");
  await expect(error).toContainText("GitHub scrapes require https://github.com/<login>");
  await expect(result).toContainText('login:"edited-fetched"');
  await expect(
    page.locator('[data-variant-layout-brick="github/profile/4x4"]').getByText("@edited-fetched"),
  ).toBeVisible();
});

test("renders every layout on a variant page", async ({ page }) => {
  await page.goto("/collections/swatch/default");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Layout", { exact: true })).toHaveCount(3);
  await expect(page.locator('[data-variant-layout-brick="swatch/default/2x2"]')).toBeVisible();
  await expect(page.locator('[data-variant-layout-brick="swatch/default/4x4"]')).toBeVisible();
  await expect(page.locator('[data-variant-layout-brick="swatch/default/8x2"]')).toBeVisible();
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
