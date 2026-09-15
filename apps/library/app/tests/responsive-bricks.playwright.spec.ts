import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 3000, height: 1100 } });

test("independent Figma options, shared content, hidden inheritance and fresh persistence", async ({
  page,
}) => {
  let scraperRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/scraper-rpc")) scraperRequests += 1;
  });
  await page.goto("/modules/figma-thumbnail");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const preview = page.locator("[data-module-brick]");
  const image = preview.locator("[data-figma-thumbnail]");
  for (const width of [375, 640, 1024, 1440]) {
    await page.getByRole("button", { name: `${width}px grid width` }).click();
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "cover");
    await expect
      .poll(() =>
        image.evaluate((element: HTMLImageElement) => {
          const bounds = element.getBoundingClientRect();
          return (
            element.naturalWidth > 0 &&
            Math.abs(element.naturalWidth / element.naturalHeight - bounds.width / bounds.height) >
              0.1
          );
        }),
      )
      .toBe(true);
    for (const [label, position] of [
      ["Center", "50% 50%"],
      ["Left", "0% 50%"],
      ["Right", "100% 50%"],
      ["Top", "50% 0%"],
      ["Bottom", "50% 100%"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(image).toHaveCSS("object-position", position);
    }
  }
  await page.getByRole("button", { name: "375px grid width" }).click();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await expect(preview.locator("img")).toHaveCSS("object-position", "0% 50%");
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await preview.dragTo(grid, { targetPosition: { x: 20, y: 20 } });
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await preview.dragTo(grid, { targetPosition: { x: 210, y: 20 } });
  const bricks = grid.locator("[data-brick-id]");
  await expect(bricks).toHaveCount(2);
  const firstId = await bricks.first().getAttribute("data-brick-id");
  const secondId = await bricks.nth(1).getAttribute("data-brick-id");
  const first = grid.locator(`[data-brick-id="${firstId}"]`);
  const second = grid.locator(`[data-brick-id="${secondId}"]`);
  await expect(first.locator("img")).toHaveCSS("object-position", "0% 50%");
  await expect(second.locator("img")).toHaveCSS("object-position", "100% 50%");
  await page.evaluate(async (id) => {
    const storePath = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname === "/app/useGridStore.ts")
      .at(-1)?.name;
    if (!storePath) throw new Error("Grid store module was not loaded");
    const modulePath = "/modulesHash.ts";
    const { useGridStore } = await import(storePath);
    const { modulesHash } = await import(modulePath);
    useGridStore.setState((state: ReturnType<typeof useGridStore.getState>) => ({
      bricksById: {
        ...state.bricksById,
        [id!]: {
          ...state.bricksById[id!],
          data: {
            ...modulesHash['figma-thumbnail'].defaultData,
            title: "First content",
          },
        },
      },
    }));
  }, firstId);
  await expect(first).toContainText("First content");
  await expect(second).toContainText("Figma Thumbnail");
  await first.getByRole("link", { name: "Edit brick", exact: true }).click();
  await page.getByRole("button", { name: "640px grid width" }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "0% 50%");
  await page.getByRole("button", { name: "Bottom", exact: true }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "50% 100%");
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "50% 0%");
  await expect(first).toContainText("First content");
  await expect(second.locator("img")).toHaveCSS("object-position", "100% 50%");
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await expect(first).toHaveCount(0);
  await page.getByRole("button", { name: "1440px grid width" }).click();
  await expect(first).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show brick", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show brick", exact: true }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "50% 0%");
  await expect(first).toContainText("First content");
  await page.getByRole("button", { name: "375px grid width" }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "0% 50%");
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await expect(first).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v3") ?? "{}"),
  );
  expect(saved.state).not.toHaveProperty("layout");
  for (const brick of Object.values(saved.state.bricksById)) {
    expect(brick).not.toHaveProperty("moduleOptions");
    expect(brick).not.toHaveProperty("variantId");
    expect(brick).not.toHaveProperty("layoutId");
    expect(brick).toHaveProperty("moduleId");
    expect(brick).not.toHaveProperty("viewId");
  }
  expect(saved.state.bricksById[firstId!].data.title).toBe("First content");
  expect(saved.state.bricksById[secondId!].data.title).toBe("Figma Thumbnail");
  expect(saved.state.bricksById[firstId!].xs.appearanceOptions).toEqual({
    imagePosition: "left",
  });
  expect(saved.state.bricksById[firstId!].sm.appearanceOptions).toEqual({
    imagePosition: "bottom",
  });
  expect(saved.state.bricksById[firstId!].lg.gridItem).toBeNull();
  expect(saved.state.bricksById[firstId!].xl.gridItem).not.toBeNull();
  expect(saved.state.bricksById[secondId!].xs.appearanceOptions).toEqual({
    imagePosition: "right",
  });
  expect(scraperRequests).toBe(0);
});

test("moves with default resize handles and reloads each breakpoint", async ({ page }) => {
  await page.goto("/modules/figma-thumbnail");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  const preview = page.locator("[data-module-brick]");
  await preview.dragTo(grid, { targetPosition: { x: 20, y: 20 } });
  await preview.dragTo(grid, { targetPosition: { x: 210, y: 20 } });
  const first = grid.locator("[data-brick-id]").first();
  const xsX = await first.getAttribute("data-grid-x");
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await expect(grid.locator(".react-resizable-handle-se")).toHaveCount(2);
  const width = await first.getAttribute("data-grid-w");
  await first.dragTo(grid, { targetPosition: { x: 650, y: 180 } });
  const movedX = await first.getAttribute("data-grid-x");
  await page.reload();
  await expect(first).toHaveAttribute("data-grid-w", width!);
  await expect(first).toHaveAttribute("data-grid-x", movedX!);
  await page.getByRole("button", { name: "375px grid width" }).click();
  await expect(first).toHaveAttribute("data-grid-w", "4");
  await expect(first).toHaveAttribute("data-grid-x", xsX!);
});

test("ignores the old responsive persistence key without modifying it", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "qrk-bricks-sandbox-responsive-bricks-v1",
      JSON.stringify({
        state: {
          bricksById: {
            old: {
              moduleId: "figma",
              variantId: "thumbnail",
              layoutId: "4x4",
              xs: {
                gridItem: { i: "old", x: 0, y: 0, w: 4, h: 4 },
                layoutOptions: {},
              },
            },
          },
        },
      }),
    );
  });
  await page.goto("/modules/figma-thumbnail");
  await expect(page.getByLabel("Brick grid").locator("[data-brick-id]")).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v1") ?? "{}").state
          .bricksById.old.variantId,
    ),
  ).toBe("thumbnail");
});

test("removing an override restores whole-entry inheritance", async ({ page }) => {
  await page.goto("/modules/figma-thumbnail");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await page.locator("[data-module-brick]").dragTo(grid, {
    targetPosition: { x: 20, y: 20 },
  });
  const placed = grid.locator("[data-brick-id]");
  const brickId = await placed.getAttribute("data-brick-id");
  await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page.getByRole("button", { name: /Inherit from/ })).toHaveCount(0);
  await page.getByRole("button", { name: "640px grid width" }).click();
  await expect(page.getByRole("button", { name: "Inherit from xs" })).toBeDisabled();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await page.getByRole("button", { name: "Bottom", exact: true }).click();
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await expect(placed).toHaveCount(0);
  await page.getByRole("button", { name: "Inherit from sm" }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  await expect(page.getByRole("button", { name: "Inherit from sm" })).toBeDisabled();
  await page.reload();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v3") ?? "{}"),
  );
  expect(saved.state.bricksById[brickId!]).not.toHaveProperty("lg");
  expect(saved.state.bricksById[brickId!].sm.gridItem).toEqual(
    saved.state.bricksById[brickId!].xs.gridItem,
  );
  await page.getByRole("button", { name: "640px grid width" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "50% 0%");
  await page.getByRole("button", { name: "1440px grid width" }).click();
  await expect(page.getByRole("button", { name: "Inherit from sm" })).toBeDisabled();
});

test("group configuration ends with the current brick definition", async ({ page }) => {
  await page.goto("/modules/swatch");
  const pane = page.getByTestId("module-configuration-pane");
  await expect(pane.getByRole("heading")).toHaveText([
    "Swatch",
    "Configuration",
    "Brick Definition",
  ]);
  await expect(pane.getByRole("table")).toBeVisible();
  await expect(pane.getByRole("button", { name: /Inherit from|Hide brick/ })).toHaveCount(0);
  const formContainer = pane.getByRole("textbox", { name: "Hex color" }).locator("../..");
  await expect(formContainer).toHaveCSS("padding-left", "16px");
  await page.getByRole("textbox", { name: "Hex color" }).fill("#ff0000");
  const definition = pane.getByTestId("module-data-result");
  await expect(definition).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(definition).toContainText("swatch");
  await definition
    .getByRole("treeitem", { name: /^expand JSONdata:/ })
    .getByRole("button", { name: "expand JSON", exact: true })
    .click();
  await expect(definition).toContainText("#ff0000");
  await page.goto("/modules/figma-thumbnail");
  await expect(pane.getByRole("heading")).toHaveText([
    "Figma",
    "Figma Thumbnail",
    "Configuration",
    "Appearance options",
    "Brick Definition",
  ]);
  const viewFormContainer = pane.getByRole("group", { name: "Image position" }).locator("..");
  await expect(viewFormContainer).toHaveCSS("padding-left", "16px");
  await expect(viewFormContainer).toHaveCSS("padding-top", "20px");
  await expect(viewFormContainer).toHaveCSS("padding-bottom", "20px");
  const viewHeading = pane.getByRole("heading", { name: "Appearance options", exact: true });
  await viewHeading.scrollIntoViewIfNeeded();
  const viewHeadingBox = await viewHeading.boundingBox();
  const legend = await pane.locator("legend").boundingBox();
  expect(legend!.y).toBeGreaterThan(viewHeadingBox!.y + viewHeadingBox!.height);
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await definition.getByRole("button", { name: "expand JSON", exact: true }).last().click();
  await expect(definition).toContainText("right");
});
