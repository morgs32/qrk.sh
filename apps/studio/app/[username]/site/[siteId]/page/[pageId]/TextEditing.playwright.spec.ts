import { expect, test } from "@playwright/test";

const base = process.env.PLAYWRIGHT_EDITOR_PATH ?? "/e2e/site/e2e/page/home";

test("Text edits stay local, preserve their editor, resize naturally, and restore", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/modules`);
  const grid = page.locator('[data-wall-active="true"] [aria-label="Brick grid"]');
  await expect(grid).toBeVisible();
  const source = page
    .locator('[data-brick-drawer-brick-slot][data-brick-drawer-module-id="text"]')
    .first();
  await expect(source).toBeVisible();
  await source.dragTo(grid, { targetPosition: { x: 50, y: 70 }, steps: 20 });
  const brick = grid.locator('[data-brick="text"]').last();
  const id = await brick.getAttribute("data-brick-id");
  expect(id).not.toBeNull();
  await brick.getByRole("button", { name: "Edit text" }).click();
  await expect(page).toHaveURL(base);
  await expect(page.getByLabel("Workspace drawer")).toHaveCount(0);
  const content = brick.getByLabel("Text content");
  await expect(content).toHaveAttribute("contenteditable", "true");
  const originalEditor = await content.elementHandle();
  const serverWallWrites: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /updateBrickState|updateLayoutAtBreakpoint|updatePageArticle/.test(request.postData() ?? "")
    )
      serverWallWrites.push(request.url());
  });
  await content.fill("Local Text draft");
  await content.press("End");
  await page.getByLabel("Bold", { exact: true }).click();
  await content.pressSequentially(" bold");
  await expect(content.locator("strong")).toHaveText(" bold");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(content).toContainText("Local Text draft");
  expect(await originalEditor!.evaluate((element) => element.isConnected)).toBe(true);
  const startingRows = Number(await brick.getAttribute("data-grid-h"));
  await content.fill(Array.from({ length: 25 }, (_, i) => `Line ${i}`).join("\n"));
  await expect
    .poll(async () => Number(await brick.getAttribute("data-grid-h")))
    .toBeGreaterThan(startingRows);
  await content.fill("Final local Text draft");
  await expect
    .poll(async () => Number(await brick.getAttribute("data-grid-h")))
    .toBeLessThan(startingRows + 2);
  await content.press("Escape");
  await expect(content).toHaveAttribute("contenteditable", "false");
  expect(serverWallWrites).toEqual([]);
  // Wait on the existing session backup status rather than treating staging as durability.
  await expect(grid).toHaveAttribute("data-backup-status", "ready");
  await page.reload();
  await expect(
    page.locator(`[data-wall-active="true"] [data-brick-id="${id}"]`).getByLabel("Text content"),
  ).toContainText("Final local Text draft");
});

test("Text toolbar popovers and file picker retain editing; Escape ends it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/modules`);
  const grid = page.locator('[data-wall-active="true"] [aria-label="Brick grid"]');
  await expect(grid).toBeVisible();
  await page
    .locator('[data-brick-drawer-brick-slot][data-brick-drawer-module-id="text"]')
    .first()
    .dragTo(grid, { targetPosition: { x: 60, y: 80 }, steps: 20 });
  const brick = grid.locator('[data-brick="text"]').last();
  await brick.getByRole("button", { name: "Edit text" }).click();
  const content = brick.getByLabel("Text content");
  await content.fill("Choose a link");
  await page.getByLabel("Link", { exact: true }).click();
  await expect(page.locator(".tiptap-popover")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tiptap-popover")).toHaveCount(0);
  await expect(content).toHaveAttribute("contenteditable", "true");
  await page.getByRole("button", { name: "Add image", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await brick.getByText("Click to upload").click();
  await (await chooser).setFiles([]);
  await expect(content).toHaveAttribute("contenteditable", "true");
  await content.press("Escape");
  await expect(content).toHaveAttribute("contenteditable", "false");
});

test("Text block dragging and image resizing preserve editing; previews cannot edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto(`${base}/modules`);
  const source = page
    .locator('[data-brick-drawer-brick-slot][data-brick-drawer-module-id="text"]')
    .first();
  await expect(source.getByLabel("Text content")).toHaveAttribute("contenteditable", "false");
  await expect(source.getByRole("button", { name: "Edit text" })).toHaveCount(0);
  const grid = page.locator('[data-wall-active="true"] [aria-label="Brick grid"]');
  await source.dragTo(grid, { targetPosition: { x: 70, y: 90 }, steps: 20 });
  const brick = grid.locator('[data-brick="text"]').last();
  await brick.getByRole("button", { name: "Edit text" }).click();
  const content = brick.getByLabel("Text content");
  await content.fill("First block");
  await content.press("End");
  await content.press("Enter");
  await content.pressSequentially("Second block");
  await content.locator("p").first().hover();
  const grip = page.getByLabel("Drag block");
  await expect(grip).toBeVisible();
  const handle = await grip.boundingBox();
  const last = await content.locator("p").last().boundingBox();
  if (!handle || !last) throw new Error("Missing document block drag targets");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 40, last.y + last.height + 6, { steps: 20 });
  await page.mouse.up();
  await expect(content).toHaveAttribute("contenteditable", "true");
  await expect(content.locator("p")).toHaveText(["Second block", "First block"]);

  // Exercise the normal upload UI with a deterministic response, without writing an asset.
  await page.route("**/upload", async (route) => {
    await route.fulfill({ json: { url: "https://text-check.invalid/image.svg" } });
  });
  await page.route("https://text-check.invalid/image.svg", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="teal"/></svg>',
    });
  });
  await content.press("ControlOrMeta+End");
  await page.getByRole("button", { name: "Add image", exact: true }).click();
  await brick.getByLabel("Choose image").setInputFiles({
    name: "text-check.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"/>'),
  });
  const image = content.getByRole("img", { name: "text-check", exact: true });
  await expect(image).toBeVisible();
  await image.click();
  const resize = content.locator('[data-resize-image-ui="resize-handle"]').last();
  const corner = await resize.boundingBox();
  const before = await image.boundingBox();
  if (!corner || !before) throw new Error("Missing image resize handle");
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x - 80, corner.y, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await image.boundingBox())?.width ?? 0)
    .toBeLessThan(before.width - 40);
  await expect(content).toHaveAttribute("contenteditable", "true");
  await content.press("Escape");
  await image.click();
  await expect(content.locator("[data-resize-image-ui]")).toHaveCount(0);
  await expect(content).toHaveAttribute("contenteditable", "false");
});
