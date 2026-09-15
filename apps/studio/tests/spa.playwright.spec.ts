import { expect, test } from "@playwright/test";

test("SPA deep-link fallback and isolated assets", async ({ request }) => {
  const deep = await request.get("/test/site/test/page/test/brick/encoded%20brick");
  expect(deep.status()).toBe(200);
  expect(deep.headers()["content-type"]).toContain("text/html");
  expect(await deep.text()).toContain("Loading workspace");
  for (const [path, contentType] of [
    ["/assets/site-settings-social-preview.png", "image/png"],
    ["/assets/favicon.ico", "image/"],
    ["/__zerospin/backup-worker.js", "javascript"],
    ["/__zerospin/wa-sqlite-async.wasm", "application/wasm"],
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(contentType);
  }
});

test("not-found route hydrates with bundled fonts and no uncaught errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/unknown/path/that/does/not/exist?retained=yes");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("retained")).toBe("yes");
  const fonts = await page.evaluate(async () => {
    await document.fonts.load('16px "Geist Variable"');
    await document.fonts.load('16px "Space Mono"');
    return [
      document.fonts.check('16px "Geist Variable"'),
      document.fonts.check('16px "Space Mono"'),
    ];
  });
  expect(fonts).toEqual([true, true]);
  expect(errors).toEqual([]);
});
