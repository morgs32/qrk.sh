import { expect, test } from "@playwright/test";

test("lists distinct modules and opens module configuration", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-module-entry="swatch"]')).toBeVisible();
  await expect(page.locator('[data-module-entry="github-profile"]')).toBeVisible();
  await expect(page.locator('[data-module-entry="github-repo"]')).toBeVisible();

  await page.goto("/modules/github-repo");
  await expect(page.getByTestId("module-configuration-pane")).toBeVisible();
  await expect(page.getByText("GitHub Repo", { exact: true }).first()).toBeVisible();
});

test("opens icon module configuration", async ({ page }) => {
  await page.goto("/modules/icon");
  await expect(page.getByTestId("module-configuration-pane")).toBeVisible();
});
