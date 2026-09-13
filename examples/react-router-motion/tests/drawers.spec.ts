import { expect, test } from "@playwright/test";

test("retains shells, outgoing params, grid state, and settles interrupted navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("requestfailed", (request) => console.log("FAILED", request.url(), request.failure()));
  page.on("response", (response) => {
    if (response.status() >= 400) console.log("HTTP", response.status(), response.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("textbox", { name: "draft" }).fill("retained draft");
  await page.locator("[data-grid]").evaluate((element) => {
    element.scrollTop = 100;
  });
  await page.getByRole("link", { name: "/catalog", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Catalog", exact: true })).toBeVisible();
  const shell = await page.locator('[data-drawer="left"]').elementHandle();
  await page.getByRole("link", { name: "/brick/one", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Brick one" })).toBeVisible();
  expect(
    await shell!.evaluate((element) => element === document.querySelector('[data-drawer="left"]')),
  ).toBe(true);
  await page.getByRole("link", { name: "/", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Brick one" })).toBeAttached();
  await expect(page.locator("[data-drawer]")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Brick one" })).toBeVisible();
  await page.goForward();
  await expect(page.locator("[data-drawer]")).toHaveCount(0);
  // DOM clicks intentionally interrupt transitions without actionability waits.
  for (const to of ["/catalog", "/compose", "/brick/one", "/", "/compose"]) {
    await page
      .getByRole("link", { name: to, exact: true })
      .evaluate((element: HTMLAnchorElement) => element.click());
    await expect(page).toHaveURL(new RegExp(`${to === "/" ? "/" : to}$`));
  }
  await expect(page.locator("[data-drawer]")).toHaveCount(1);
  await expect(page.locator('[data-drawer="right"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compose" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "draft" })).toHaveValue("retained draft");
  expect(await page.locator("[data-grid]").evaluate((element) => element.scrollTop)).toBe(100);
  expect(errors).toEqual([]);
});
