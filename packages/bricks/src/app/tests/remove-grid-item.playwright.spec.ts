import { expect, test } from "@playwright/test";

test("items follow the pointer outside, can return, and persist removal on release", async ({
  page,
}) => {
  await page.goto("/catalogs/swatch");
  const preview = page.locator("[data-registry-brick]");
  await preview

    .dragTo(page.getByLabel("Brick grid").locator(".react-grid-layout"), {
      targetPosition: { x: 20, y: 20 },
    });
  const grid = page.getByLabel("Brick grid");
  const item = grid.locator("[data-brick-id]");
  await expect(item).toBeVisible();
  const bounds = await grid.boundingBox();
  const start = await item.boundingBox();
  if (!bounds || !start) throw new Error("Missing grid bounds");
  const handle = await item.boundingBox();
  if (!handle) throw new Error("Missing drag handle");
  const startX = handle.x + handle.width / 2;
  const startY = handle.y + handle.height / 2;
  const outsideX = bounds.x - 100;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(outsideX, startY, { steps: 10 });
  await expect(page.getByRole("status")).toHaveText("Release to remove");
  const dragged = await item.boundingBox();
  expect(dragged?.x).toBeCloseTo(outsideX - (startX - start.x), 0);
  expect(
    await item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      );
    }),
  ).toBe(true);
  await page.mouse.move(startX, startY, { steps: 10 });
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.mouse.up();
  await expect(item).toBeVisible();
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(outsideX, startY, { steps: 10 });
  await page.mouse.up();
  await expect(item).toHaveCount(0);
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
  await page.reload();
  await expect(grid.locator("[data-brick-id]")).toHaveCount(0);
  await expect(item).toHaveCount(0);
});
