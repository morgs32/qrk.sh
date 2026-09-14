import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 2200, height: 1100 } });

test("independent Figma options, shared content, hidden inheritance and fresh persistence", async ({
  page,
}) => {
  let scraperRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/scraper-rpc")) scraperRequests += 1;
  });
  await page.goto("/collections/figma");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const preview = page.locator("[data-content-view-brick]");
  const image = preview.locator("[data-figma-thumbnail]");
  for (const width of [375, 640, 768, 1024]) {
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
  await preview.locator(".brick-drag-handle").dragTo(grid, { targetPosition: { x: 20, y: 20 } });
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await preview.locator(".brick-drag-handle").dragTo(grid, { targetPosition: { x: 210, y: 20 } });
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
      .filter((entry) => new URL(entry.name).pathname === "/src/app/useGridStore.ts")
      .at(-1)?.name;
    if (!storePath) throw new Error("Grid store module was not loaded");
    const catalogPath = "/src/collectionsHash.ts";
    const { useGridStore } = await import(storePath);
    const { collectionsHash } = await import(catalogPath);
    useGridStore.setState((state: ReturnType<typeof useGridStore.getState>) => ({
      bricksById: {
        ...state.bricksById,
        [id!]: {
          ...state.bricksById[id!],
          data: { ...collectionsHash.figma.contents.thumbnail.defaultData, title: "First content" },
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
  await page.getByRole("button", { name: "768px grid width" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "50% 0%");
  await expect(first).toContainText("First content");
  await expect(second.locator("img")).toHaveCSS("object-position", "100% 50%");
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await expect(first).toHaveCount(0);
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await expect(first).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show brick", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show brick", exact: true }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "50% 0%");
  await expect(first).toContainText("First content");
  await page.getByRole("button", { name: "375px grid width" }).click();
  await expect(first.locator("img")).toHaveCSS("object-position", "0% 50%");
  await page.getByRole("button", { name: "768px grid width" }).click();
  await expect(first).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2") ?? "{}"),
  );
  expect(saved.state).not.toHaveProperty("layout");
  for (const brick of Object.values(saved.state.bricksById)) {
    expect(brick).not.toHaveProperty("contentOptions");
    expect(brick).not.toHaveProperty("variantId");
    expect(brick).not.toHaveProperty("layoutId");
    expect(brick).toHaveProperty("contentId");
    expect(brick).toHaveProperty("viewId");
  }
  expect(saved.state.bricksById[firstId!].data.title).toBe("First content");
  expect(saved.state.bricksById[secondId!].data.title).toBe("Figma Thumbnail");
  expect(saved.state.bricksById[firstId!].xs.viewOptions).toEqual({ imagePosition: "left" });
  expect(saved.state.bricksById[firstId!].sm.viewOptions).toEqual({ imagePosition: "bottom" });
  expect(saved.state.bricksById[firstId!].md.gridItem).toBeNull();
  expect(saved.state.bricksById[firstId!].lg.gridItem).not.toBeNull();
  expect(saved.state.bricksById[secondId!].xs.viewOptions).toEqual({ imagePosition: "right" });
  expect(scraperRequests).toBe(0);
});

test("moves without resize handles and reloads each breakpoint", async ({ page }) => {
  await page.goto("/collections/figma");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  const preview = page.locator("[data-content-view-brick]");
  await preview.locator(".brick-drag-handle").dragTo(grid, { targetPosition: { x: 20, y: 20 } });
  await preview.locator(".brick-drag-handle").dragTo(grid, { targetPosition: { x: 210, y: 20 } });
  const first = grid.locator("[data-brick-id]").first();
  const xsX = await first.getAttribute("data-grid-x");
  await page.getByRole("button", { name: "768px grid width" }).click();
  await expect(grid.locator(".react-resizable-handle")).toHaveCount(0);
  const width = await first.getAttribute("data-grid-w");
  await first.locator(".brick-drag-handle").dragTo(grid, { targetPosition: { x: 650, y: 180 } });
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
              collectionId: "figma",
              variantId: "thumbnail",
              layoutId: "4x4",
              xs: { gridItem: { i: "old", x: 0, y: 0, w: 4, h: 4 }, layoutOptions: {} },
            },
          },
        },
      }),
    );
  });
  await page.goto("/collections/figma");
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
  await page.goto("/collections/figma");
  await page.getByRole("button", { name: "375px grid width" }).click();
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await page.locator("[data-content-view-brick] .brick-drag-handle").dragTo(grid, {
    targetPosition: { x: 20, y: 20 },
  });
  const placed = grid.locator("[data-brick-id]");
  const brickId = await placed.getAttribute("data-brick-id");
  await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page.getByRole("button", { name: /Inherit from/ })).toHaveCount(0);
  await page.getByRole("button", { name: "640px grid width" }).click();
  await expect(page.getByRole("button", { name: "Inherit from xs" })).toBeDisabled();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await page.getByRole("button", { name: "768px grid width" }).click();
  await page.getByRole("button", { name: "Bottom", exact: true }).click();
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await expect(placed).toHaveCount(0);
  await page.getByRole("button", { name: "Inherit from sm" }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  await expect(page.getByRole("button", { name: "Inherit from sm" })).toBeDisabled();
  await page.reload();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2") ?? "{}"),
  );
  expect(saved.state.bricksById[brickId!]).not.toHaveProperty("md");
  expect(saved.state.bricksById[brickId!].sm.gridItem).toEqual(
    saved.state.bricksById[brickId!].xs.gridItem,
  );
  await page.getByRole("button", { name: "640px grid width" }).click();
  await page.getByRole("button", { name: "Top", exact: true }).click();
  await page.getByRole("button", { name: "768px grid width" }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "50% 0%");
  await page.getByRole("button", { name: "1024px grid width" }).click();
  await expect(page.getByRole("button", { name: "Inherit from sm" })).toBeDisabled();
});

test("catalog configuration ends with the current brick definition", async ({ page }) => {
  await page.goto("/collections/swatch?content=default&view=2x2");
  const pane = page.getByTestId("content-configuration-pane");
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
  const definition = pane.getByTestId("content-data-result");
  await expect(definition).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(definition).toContainText("swatch");
  await definition.getByRole("button", { name: "expand JSON", exact: true }).first().click();
  await expect(definition).toContainText("#ff0000");
  await page.goto("/collections/figma");
  await expect(pane.getByRole("heading")).toHaveText([
    "Figma",
    "Figma Thumbnail",
    "Configuration",
    "View options",
    "Brick Definition",
  ]);
  const viewFormContainer = pane.getByRole("group", { name: "Image position" }).locator("..");
  await expect(viewFormContainer).toHaveCSS("padding-left", "16px");
  await expect(viewFormContainer).toHaveCSS("padding-top", "20px");
  await expect(viewFormContainer).toHaveCSS("padding-bottom", "20px");
  const viewHeading = await pane
    .getByRole("heading", { name: "View options", exact: true })
    .boundingBox();
  const legend = await pane.locator("legend").boundingBox();
  expect(legend!.y - (viewHeading!.y + viewHeading!.height)).toBe(20);
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await definition.getByRole("button", { name: "expand JSON", exact: true }).last().click();
  await expect(definition).toContainText("right");
});
