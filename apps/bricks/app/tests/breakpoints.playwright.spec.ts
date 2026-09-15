import { expect, test } from "@playwright/test";

test("group breakpoints follow the shared grid container at every boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  await page.getByRole("toolbar", { name: "Grid controls" }).getByRole("button", { name: "Bricks", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Bricks", exact: true })).toBeVisible();
  const group = page.locator('[data-group-entry="github"]');
  const preview = group.locator('[data-group-representative="github/profile"]');
  const responsive = preview.locator('[data-slot="card"]');

  for (const [width, breakpoint] of [
    [639, "xs"],
    [640, "sm"],
    [767, "sm"],
    [768, "sm"],
    [1023, "sm"],
    [1024, "lg"],
    [1279, "lg"],
    [1280, "xl"],
    [1535, "xl"],
    [1536, "xl"],
  ] satisfies Array<[number, string]>) {
    // Resize only the measured grid container; the group stays at its own width.
    await page
      .getByLabel("Brick grid", { exact: true })
      .locator("..")
      .evaluate((element, width) => {
        element.style.width = `${width}px`;
      }, width);
    await expect(responsive).toHaveCSS(
      "padding-top",
      breakpoint === "xs" || breakpoint === "sm" ? "8px" : "12px",
    );
    await expect(preview.getByText("@morgs32")).toBeVisible();
  }
});

test("standalone slider retains the profile through responsive presentations", async ({ page }) => {
  await page.goto("/bricks/github/profile");
  const preview = page.getByTestId("brick-preview");
  for (const [unit, breakpoint] of [
    [40, "xs"],
    [80, "sm"],
    [128, "lg"],
    [160, "xl"],
  ]) {
    await page.getByLabel("Grid unit:", { exact: false }).fill(String(unit));
    await expect(preview.locator('[data-slot="card"]')).toHaveCSS(
      "padding-top",
      breakpoint === "xs" || breakpoint === "sm" ? "8px" : "12px",
    );
    await expect(preview.getByText("@morgs32")).toBeVisible();
  }
});

test("placed bricks respond to presets and keep their data and positions", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 1000 });
  await page.goto("/groups/github?catalog=profile");
  const source = page.locator('[data-catalog-brick="github/profile"]');
  await expect(source.locator('[data-slot="card"]')).toHaveCSS("padding-top", "12px");
  const grid = page.getByLabel("Brick grid", { exact: true });
  await source.dragTo(grid.locator(".react-grid-layout"), {
    targetPosition: { x: 20, y: 200 },
  });
  const placed = grid.locator('[data-brick="github/profile"]');
  await expect(placed).toHaveCount(1);
  const original = await placed.evaluate((element) => ({
    id: element.getAttribute("data-brick-id"),
    x: element.getAttribute("data-grid-x"),
    y: element.getAttribute("data-grid-y"),
  }));
  const node = await placed.elementHandle();
  for (const [width, breakpoint] of [
    [375, "xs"],
    [640, "sm"],
    [1024, "lg"],
    [1440, "xl"],
  ] satisfies Array<[number, string]>) {
    await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
    await expect(placed.locator('[data-slot="card"]')).toHaveCSS(
      "padding-top",
      breakpoint === "xs" || breakpoint === "sm" ? "8px" : "12px",
    );
    await expect(source.locator('[data-slot="card"]')).toHaveCSS(
      "padding-top",
      breakpoint === "xs" || breakpoint === "sm" ? "8px" : "12px",
    );
    await expect(placed.getByText("@morgs32")).toBeVisible();
    expect(
      await placed.evaluate((element) => ({
        id: element.getAttribute("data-brick-id"),
        x: element.getAttribute("data-grid-x"),
        y: element.getAttribute("data-grid-y"),
      })),
    ).toEqual(original);
  }
  expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
  await expect(page.getByTestId("selected-brick-preview").locator('[data-slot="card"]')).toHaveCSS(
    "padding-top",
    "8px",
  );
});

test("lg and xl overrides persist and restore nearest smaller inheritance", async ({ page }) => {
  await page.setViewportSize({ width: 3400, height: 1100 });
  await page.goto("/groups/figma");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const grid = page.getByLabel("Brick grid").locator(".react-grid-layout");
  await page.locator("[data-catalog-brick]").dragTo(grid, {
    targetPosition: { x: 20, y: 20 },
  });
  const placed = grid.locator("[data-brick-id]");
  await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
  await page.getByRole("button", { name: "1024px grid width", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inherit from xs", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Left", exact: true }).click();
  await page.getByRole("button", { name: "1440px grid width", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inherit from lg", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Right", exact: true }).click();
  await page.reload();
  await expect(placed.locator("img")).toHaveCSS("object-position", "100% 50%");
  await page.getByRole("button", { name: "Inherit from lg", exact: true }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  await page.getByRole("button", { name: "1024px grid width", exact: true }).click();
  await page.getByRole("button", { name: "Hide brick", exact: true }).click();
  await page.getByRole("button", { name: "1440px grid width", exact: true }).click();
  await expect(placed).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Show brick", exact: true }).click();
  await expect(placed.locator("img")).toHaveCSS("object-position", "0% 50%");
  await page.getByRole("button", { name: "1024px grid width", exact: true }).click();
  await expect(placed).toHaveCount(0);
});
