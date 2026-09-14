import { expect, test } from "@playwright/test";

test("configures only the selected brick and persists its data", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const catalogPath = "/src/collectionsHash.ts";
    const storePath = "/src/app/useGridStore.ts";
    const { collectionsHash } = await import(catalogPath);
    const { useGridStore } = await import(storePath);
    const brick = collectionsHash.github.variants.profile.sizes["4x4"];
    useGridStore.setState({
      bricksById: {
        first: { ...brick.def, data: { ...brick.def.data, login: "selected" } },
        second: brick.def,
      },
      layout: [
        { i: "first", x: 0, y: 0, w: 4, h: 4 },
        { i: "second", x: 4, y: 0, w: 4, h: 4 },
      ],
    });
  });
  await page.goto("/collections/github/brick/first");
  await expect(page.getByTestId("variant-data-result")).toContainText("selected");
  await page.evaluate(async () => {
    const catalogPath = "/src/collectionsHash.ts";
    const { collectionsHash } = await import(catalogPath);
    const variant = collectionsHash.github.variants.profile;
    variant.configuration.fetcher = async ({ setData }: { setData: (data: unknown) => void }) => {
      setData({ ...variant.defaultData, login: "configured" });
      return { _tag: "Right", right: undefined };
    };
  });
  await page.locator('[data-brick-id="second"]').click();
  await page.locator('[data-brick-id="first"]').click();
  await page.getByLabel("url", { exact: true }).fill("https://github.com/configured");
  await expect(page.getByTestId("variant-data-result")).toContainText("configured");
  await expect(page.getByTestId("selected-brick-preview")).toContainText("@configured");
  await expect(page.locator('[data-brick-id="first"]')).toContainText("@configured");
  await expect(page.locator('[data-brick-id="second"]')).toContainText("@morgs32");
  await page.reload();
  await expect(page.getByTestId("variant-data-result")).toContainText("configured");
  await expect(page.getByTestId("selected-brick-preview")).toContainText("@configured");
});

test("drops configured icon snapshots and restores them after reload", async ({ page }) => {
  await page.goto("/collections/icon?variant=default");
  await expect(page.locator("[data-variant-size-brick]")).toBeVisible();
  await page.evaluate(async () => {
    const storePath = performance.getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/app/useVariantData.ts")?.name;
    if (!storePath) throw new Error("Variant data module was not loaded");
    const { useVariantDataStore } = await import(storePath);
    useVariantDataStore.getState().setVariantData("icon", "default", {
      name: "First icon",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
    });
  });
  const preview = page.locator("[data-variant-size-brick]");
  const grid = page.getByLabel("Brick grid");
  await expect(preview.locator('img[alt="First icon"]')).toBeVisible();
  await preview.dragTo(grid.locator(".react-grid-layout"), { targetPosition: { x: 20, y: 20 } });
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await page.evaluate(async () => {
    const storePath = performance.getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/app/useVariantData.ts")?.name;
    if (!storePath) throw new Error("Variant data module was not loaded");
    const { useVariantDataStore } = await import(storePath);
    useVariantDataStore.getState().setVariantData("icon", "default", {
      name: "Second icon",
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    });
  });
  await expect(preview.locator('img[alt="Second icon"]')).toBeVisible();
  await preview.dragTo(grid.locator(".react-grid-layout"), { targetPosition: { x: 180, y: 20 } });
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await expect(grid.getByRole("img", { name: "Second icon" })).toBeVisible();
  await page.reload();
  await expect(grid.getByRole("img", { name: "First icon" })).toBeVisible();
  await expect(grid.getByRole("img", { name: "Second icon" })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("qrk-bricks-sandbox-single-grid") ?? "{}"),
  );
  expect(saved.state).not.toHaveProperty("dataByBrickId");
  expect(Object.values(saved.state.bricksById)).toEqual(expect.arrayContaining([
    expect.objectContaining({ data: expect.objectContaining({ name: "First icon" }) }),
    expect.objectContaining({ data: expect.objectContaining({ name: "Second icon" }) }),
  ]));
});

test("preserves legacy saved brick data and fills missing defaults", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const catalogPath = "/src/collectionsHash.ts";
    const { collectionsHash } = await import(catalogPath);
    const { data, ...legacyDef } = collectionsHash.icon.variants.default.sizes["2x2"].def;
    localStorage.setItem("qrk-bricks-sandbox-single-grid", JSON.stringify({
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
    }));
  });
  await page.reload();
  const grid = page.getByLabel("Brick grid");
  await expect(grid.getByRole("img", { name: "Saved icon" })).toBeVisible();
  await expect(grid.getByRole("img", { name: "Asterisk" })).toBeVisible();
  await page.reload();
  await expect(grid.getByRole("img", { name: "Saved icon" })).toBeVisible();
});
