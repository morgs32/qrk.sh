import { expect, test } from "@playwright/test";

const base = process.env.PLAYWRIGHT_EDITOR_PATH ?? "/e2e/site/e2e/page/home";

test("editor retains drawer identity, params, history, toolbar, and grid", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/brick-group");
  const left = page.locator('[data-drawer="left"]');
  await expect(left).toBeVisible();
  const shell = await left.elementHandle();
  const grid = await page.getByTestId("grid-layout").elementHandle();
  // Use the existing base toolbar after closing, then navigate through real links.
  await left.getByRole("button", { name: "Close drawer" }).click();
  await expect(left).toHaveCount(0);
  await page.getByRole("link", { name: "Add bricks" }).click();
  await expect(left).toBeVisible();
  await page.goBack();
  await expect(left).toHaveCount(0);
  await page.goForward();
  await expect(left).toBeVisible();
  expect(await grid!.evaluate((element) => element.isConnected)).toBe(true);
  // A direct deep link and refresh must preserve decoded brick identity.
  await page.goto(base + "/brick/brick%20one");
  await expect(page.getByTestId("brick-detail-title")).toHaveText("brick one");
  await page.reload();
  await expect(page.getByTestId("brick-detail-title")).toHaveText("brick one");
  const detailShell = await left.elementHandle();
  // Activate the toolbar beneath the left drawer with the keyboard.
  await page.getByRole("link", { name: "Add bricks" }).press("Enter");
  await expect(page).toHaveURL(base + "/brick-group");
  await expect(left).toBeVisible();
  expect(
    await detailShell!.evaluate(
      (element) => element === document.querySelector('[data-drawer="left"]'),
    ),
  ).toBe(true);
  await page.goBack();
  await expect(page.getByTestId("brick-detail-title")).toHaveText("brick one");
  // The left drawer overlaps this toolbar link; keyboard activation exercises the route change.
  await page.getByRole("link", { name: "Page settings", exact: true }).press("Enter");
  const bottom = page.locator('[data-drawer="bottom"]');
  await expect(bottom).toBeVisible();
  await bottom.getByRole("button", { name: "Close drawer", exact: true }).click();
  await expect(bottom).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add bricks", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compose", exact: true })).toHaveCount(0);
  await page.goto(base + "/compose");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(errors).toEqual([]);
  await shell!.dispose();
});

test("interrupted history navigation settles with one drawer and preserves bottom shell", async ({
  page,
}) => {
  await page.goto(base);
  await page.getByRole("link", { name: "Page settings", exact: true }).click();
  await page
    .locator('[data-drawer="bottom"]')
    .getByRole("button", { name: "Close drawer", exact: true })
    .click();
  await page.getByRole("link", { name: "Site settings", exact: true }).click();
  await expect(page).toHaveURL(base + "/site-settings");
  const bottom = await page.locator('[data-drawer="bottom"]').elementHandle();
  // Schedule the second Back in the browser's next frame, before the 300 ms exit ends.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener(
          "popstate",
          () => {
            requestAnimationFrame(() => {
              window.addEventListener("popstate", () => resolve(), { once: true });
              history.back();
            });
          },
          { once: true },
        );
        history.back();
      }),
  );
  await expect(page.getByRole("heading", { name: "Page Settings", exact: true })).toBeVisible();
  expect(
    await bottom!.evaluate(
      (element) => element === document.querySelector('[data-drawer="bottom"]'),
    ),
  ).toBe(true);
  for (let index = 0; index < 3; index++) {
    await page.goForward();
    await page.goForward();
    await page.goBack();
    await page.goBack();
  }
  await expect(page.locator("[data-drawer]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Page Settings", exact: true })).toBeVisible();
});
