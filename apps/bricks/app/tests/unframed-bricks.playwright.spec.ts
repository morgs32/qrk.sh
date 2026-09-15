import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 2200, height: 1100 } });

test("resets legacy brick drafts while retaining width and unrelated storage", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "qrk-bricks-sandbox-responsive-bricks-v2",
      JSON.stringify({
        version: 0,
        state: {
          selectedWidth: 640,
          bricksById: {
            old: {
              catalogId: "github",
              contentId: "profile",
              viewId: "4x4",
              xs: {
                gridItem: { i: "old", x: 0, y: 0, w: 4, h: 4 },
                viewOptions: {},
              },
            },
          },
        },
      }),
    );
    localStorage.setItem("qrk-site-editor-drafts-v2", "preserved-site-draft");
  });
  await page.reload();
  await expect(page.getByLabel("Brick grid").locator(".react-grid-layout")).toBeVisible();
  await expect(page.getByLabel("Brick grid").locator("[data-brick-id]")).toHaveCount(0);
  const saved = await page.evaluate(() => ({
    workbench: JSON.parse(localStorage.getItem("qrk-bricks-sandbox-responsive-bricks-v2")!),
    site: localStorage.getItem("qrk-site-editor-drafts-v2"),
  }));
  expect(saved.workbench.version).toBe(2);
  expect(saved.workbench.state.bricksById).toEqual({});
  expect(saved.workbench.state.selectedWidth).toBe(640);
  expect(saved.site).toBe("preserved-site-draft");
});
