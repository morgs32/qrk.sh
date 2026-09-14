import { expect, test } from "@playwright/test";

test("items follow the pointer outside, can return, and persist removal on release", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  const grid = page.getByLabel("Brick grid");
  const item = grid.getByTestId("grid-fixture-1");
  await expect(item).toBeVisible();
  const bounds = await grid.boundingBox();
  const start = await item.boundingBox();
  if (!bounds || !start) throw new Error("Missing grid bounds");
  const startX = start.x + start.width / 2;
  const startY = start.y + start.height / 2;
  const outsideX = bounds.x - 100;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(outsideX, startY, { steps: 10 });
  await expect(page.getByRole("status")).toHaveText("Release to remove");
  const dragged = await item.boundingBox();
  expect(dragged?.x).toBeCloseTo(outsideX - start.width / 2, 0);
  expect(
    await item.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
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
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(3);
  await page.reload();
  await expect(grid.getByTestId(/grid-fixture-/)).toHaveCount(3);
  await expect(item).toHaveCount(0);
});
