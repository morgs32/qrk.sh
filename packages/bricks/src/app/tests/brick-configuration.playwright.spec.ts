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
      bricksById: { first: brick.def, second: brick.def },
      dataByBrickId: {
        first: { ...collectionsHash.github.variants.profile.defaultData, login: "selected" },
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
