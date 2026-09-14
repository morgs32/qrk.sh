import { expect, test } from "@playwright/test";

test("configures only the selected brick and persists its data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const catalogPath = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname === "/src/collectionsHash.ts")
      .at(-1)?.name;
    if (!catalogPath) throw new Error("Catalog module was not loaded");
    const storePath = "/src/app/useGridStore.ts";
    const { collectionsHash } = await import(catalogPath);
    const { useGridStore } = await import(storePath);
    const brick = collectionsHash.github.contents.profile.views["4x4"];
    const layout = [
      { i: "first", x: 0, y: 0, w: 4, h: 4 },
      { i: "second", x: 4, y: 0, w: 4, h: 4 },
    ];
    useGridStore
      .getState()
      .addBrick(
        "first",
        { ...brick.def, data: { ...brick.def.data, login: "selected" } },
        layout,
        "xs",
      );
    useGridStore.getState().addBrick("second", brick.def, layout, "xs");
  });
  await page.goto("/collections/github/brick/first");
  await expect(page.getByTestId("selected-brick-preview")).toContainText("selected");
  await page.evaluate(async () => {
    const catalogPath = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname === "/src/collectionsHash.ts")
      .at(-1)?.name;
    if (!catalogPath) throw new Error("Catalog module was not loaded");
    const { collectionsHash } = await import(catalogPath);
    const content = collectionsHash.github.contents.profile;
    content.configuration.fetcher = async ({ setData }: { setData: (data: unknown) => void }) => {
      setData({ ...content.defaultData, login: "configured" });
      return { _tag: "Right", right: undefined };
    };
  });
  await page
    .locator('[data-brick-id="second"]')
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await page
    .locator('[data-brick-id="first"]')
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("URL", { exact: true }).fill("https://github.com/configured");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByTestId("selected-brick-preview")).toContainText("configured");
  await expect(page.getByTestId("selected-brick-preview")).toContainText("@configured");
  await expect(page.locator('[data-brick-id="first"]')).toContainText("@configured");
  await expect(page.locator('[data-brick-id="second"]')).toContainText("@morgs32");
  await page.reload();
  await expect(page.getByTestId("selected-brick-preview")).toContainText("configured");
  await expect(page.getByTestId("selected-brick-preview")).toContainText("@configured");
});

test("drops configured icon snapshots and restores them after reload", async ({ page }) => {
  await page.goto("/collections/icon?content=default");
  await expect(page.locator("[data-content-view-brick]")).toBeVisible();
  await page.evaluate(async () => {
    const storePath = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/app/useContentData.ts")?.name;
    if (!storePath) throw new Error("Content data module was not loaded");
    const { useContentDataStore } = await import(storePath);
    useContentDataStore.getState().setContentData("icon", "default", {
      name: "First icon",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
    });
  });
  const preview = page.locator("[data-content-view-brick]");
  const grid = page.getByLabel("Brick grid");
  await expect(preview.locator('img[alt="First icon"]')).toBeVisible();
  await preview
    .locator(".brick-drag-handle")
    .dragTo(grid.locator(".react-grid-layout"), { targetPosition: { x: 20, y: 20 } });
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await page.evaluate(async () => {
    const storePath = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/app/useContentData.ts")?.name;
    if (!storePath) throw new Error("Content data module was not loaded");
    const { useContentDataStore } = await import(storePath);
    useContentDataStore.getState().setContentData("icon", "default", {
      name: "Second icon",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    });
  });
  await expect(preview.locator('img[alt="Second icon"]')).toBeVisible();
  await preview
    .locator(".brick-drag-handle")
    .dragTo(grid.locator(".react-grid-layout"), { targetPosition: { x: 180, y: 20 } });
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await expect(grid.getByRole("img", { name: "Second icon" })).toBeVisible();
  await page.reload();
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await expect(grid.getByRole("img", { name: "Second icon" })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2") ?? "{}"),
  );
  expect(saved.state).not.toHaveProperty("dataByBrickId");
  expect(Object.values(saved.state.bricksById)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ name: "First icon" }) }),
      expect.objectContaining({ data: expect.objectContaining({ name: "Second icon" }) }),
    ]),
  );
});

test("starts fresh without migrating or deleting the old saved grid", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const catalogPath = performance
      .getEntriesByType("resource")
      .filter((entry) => new URL(entry.name).pathname === "/src/collectionsHash.ts")
      .at(-1)?.name;
    if (!catalogPath) throw new Error("Catalog module was not loaded");
    const { collectionsHash } = await import(catalogPath);
    const { data, ...legacyDef } = collectionsHash.icon.contents.default.views["2x2"].def;
    localStorage.setItem(
      "qrk-bricks-sandbox-single-grid",
      JSON.stringify({
        state: {
          bricksById: { configured: legacyDef, original: legacyDef },
          dataByBrickId: {
            configured: { ...data, name: "Saved icon" },
          },
          layout: [
            { i: "configured", x: 0, y: 0, w: 2, h: 2 },
            { i: "original", x: 2, y: 0, w: 2, h: 2 },
          ],
        },
        version: 0,
      }),
    );
  });
  await page.reload();
  const grid = page.getByLabel("Brick grid");
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("qrk-bricks-sandbox-single-grid")),
  ).toContain("Saved icon");
  await page.reload();
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
});
