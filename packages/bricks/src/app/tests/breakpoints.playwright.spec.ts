import { expect, test } from "@playwright/test";

test("catalog breakpoints follow the shared grid container at every boundary", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  const collection = page.locator('[data-collection-entry="github"]');
  await collection.getByRole("button", { name: "4×2", exact: true }).first().click();
  const preview = collection.locator('[data-collection-representative="github/profile/4x2"]');
  const responsive = preview.locator("[data-brick-breakpoint]");
  const activity = preview.locator("[data-github-profile-activity]");
  const cells = activity.locator("rect[data-date]");
  await expect(cells).not.toHaveCount(0);
  const contributionCount = await cells.count();
  const firstCell = await cells.first().elementHandle();

  for (const [width, breakpoint] of [
    [639, "xs"],
    [640, "sm"],
    [767, "sm"],
    [768, "md"],
    [1023, "md"],
    [1024, "lg"],
  ] satisfies Array<[number, string]>) {
    // Resize only the measured grid container; the catalog stays at its own width.
    await page
      .getByLabel("Brick grid", { exact: true })
      .locator("..")
      .evaluate((element, width) => {
        element.style.width = `${width}px`;
      }, width);
    await expect(responsive).toHaveAttribute("data-brick-breakpoint", breakpoint);
    await expect(cells).toHaveCount(contributionCount);
    await expect(cells.first()).toHaveAttribute("width", breakpoint === "xs" ? "2" : "9");
    await expect(activity.locator("text")).toHaveCount(breakpoint === "xs" ? 0 : 15);
    await expect(activity.locator("footer")).toHaveCount(breakpoint === "xs" ? 0 : 1);
  }
  expect(await firstCell?.evaluate((element) => element.isConnected)).toBe(true);
});

test("standalone slider updates the compact view without losing contributions", async ({
  page,
}) => {
  await page.goto("/bricks/github/profile/4x2");
  const preview = page.getByTestId("brick-preview");
  const slider = page.getByLabel("Grid unit:", { exact: false });
  const activity = preview.locator("[data-github-profile-activity]");
  const cells = activity.locator("rect[data-date]");
  await expect(preview.locator("[data-brick-breakpoint]")).toHaveAttribute(
    "data-brick-breakpoint",
    "sm",
  );
  const count = await cells.count();
  await slider.fill("40");
  await expect(preview.locator("[data-brick-breakpoint]")).toHaveAttribute(
    "data-brick-breakpoint",
    "xs",
  );
  await expect(preview.getByText("@morgs32")).toBeVisible();
  await expect(cells.first()).toHaveAttribute("rx", "0");
  await expect(cells.first()).toHaveCSS("stroke", "none");
  const brickBounds = await preview.boundingBox();
  const activityBounds = await activity.boundingBox();
  const calendarBounds = await activity.locator("svg").boundingBox();
  expect(activityBounds?.width).toBe(brickBounds?.width);
  expect((activityBounds?.y ?? 0) + (activityBounds?.height ?? 0)).toBe(
    (brickBounds?.y ?? 0) + (brickBounds?.height ?? 0),
  );
  expect((calendarBounds?.y ?? 0) + (calendarBounds?.height ?? 0)).toBe(
    (brickBounds?.y ?? 0) + (brickBounds?.height ?? 0),
  );
  const dayBounds = await cells.evaluateAll((elements) =>
    elements.slice(0, 2).map((element) => {
      const bounds = element.getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    }),
  );
  expect(dayBounds[0].width).toBe(dayBounds[0].height);
  expect(dayBounds[1].top - dayBounds[0].bottom).toBeCloseTo(1, 4);
  await expect(activity).toHaveCSS("mask-image", "none");
  await expect(preview.locator("[data-brick-breakpoint]")).toHaveCSS("padding", "0px");
  await expect(cells).toHaveCount(count);
  await slider.fill("128");
  await expect(preview.locator("[data-brick-breakpoint]")).toHaveAttribute(
    "data-brick-breakpoint",
    "lg",
  );
  await expect(preview.getByText("@morgs32")).toBeVisible();
  await page.goto("/bricks/github/profile/4x4");
  await page.getByLabel("Grid unit:", { exact: false }).fill("40");
  await expect(page.getByTestId("brick-preview").getByText("@morgs32")).toBeVisible();
  await expect(
    page.getByTestId("brick-preview").locator("rect[data-date]").first(),
  ).toHaveAttribute("width", "9");
});

test("placed bricks respond to presets and keep their data and positions", async ({ page }) => {
  await page.setViewportSize({ width: 3000, height: 1000 });
  await page.goto("/collections/github?variant=profile&layout=4x2");
  const source = page.locator('[data-variant-layout-brick="github/profile/4x2"]');
  await expect(source.locator("[data-brick-breakpoint]")).toHaveAttribute(
    "data-brick-breakpoint",
    "lg",
  );
  const grid = page.getByLabel("Brick grid", { exact: true });
  await source.locator(".brick-drag-handle").dragTo(grid.locator(".react-grid-layout"), {
    targetPosition: { x: 20, y: 200 },
  });
  const placed = grid.locator('[data-brick="github/profile/4x2"]');
  await expect(placed).toHaveCount(1);
  const original = await placed.evaluate((element) => ({
    id: element.getAttribute("data-brick-id"),
    x: element.getAttribute("data-grid-x"),
    y: element.getAttribute("data-grid-y"),
  }));
  const node = await placed.elementHandle();
  const contributionCount = await placed.locator("rect[data-date]").count();
  for (const [width, breakpoint] of [
    [375, "xs"],
    [768, "md"],
    [1024, "lg"],
    [1440, "lg"],
  ] satisfies Array<[number, string]>) {
    await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
    await expect(placed.locator("[data-brick-breakpoint]")).toHaveAttribute(
      "data-brick-breakpoint",
      breakpoint,
    );
    await expect(source.locator("[data-brick-breakpoint]")).toHaveAttribute(
      "data-brick-breakpoint",
      breakpoint,
    );
    await expect(placed.locator("rect[data-date]")).toHaveCount(contributionCount);
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
  await placed.getByRole("link").click();
  await expect(
    page.getByTestId("selected-brick-preview").locator("[data-brick-breakpoint]"),
  ).toHaveAttribute("data-brick-breakpoint", "xs");
});
