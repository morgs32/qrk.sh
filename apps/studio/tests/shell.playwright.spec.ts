import { expect, test } from "@playwright/test";

// No browser database or authenticated fixture is needed to verify initial HTML.
test("server-rendered dashboard navbar survives without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto("/shell-check");
    const header = page.getByTestId("dashboard-navbar");
    await expect(header).toHaveCount(1);
    await expect(header.getByRole("link", { name: "Home" })).toHaveText("qrk.sh");
    await expect(header.getByLabel("Loading account")).toBeVisible();
    expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(64);
    await expect(page.getByText(/Loading\s+workspace/)).toHaveCount(0);
  } finally { await context.close(); }
});

test("deep editor URLs server-render the custom-wordmark skeleton", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const suffix of ["", "/brick-group", "/brick-group/module%20name", "/brick/brk_encoded%20brick", "/breakpoints", "/page-settings", "/site-settings"]) {
      const response = await page.goto(`/shell-check/site/sit_check/page/pag_check${suffix}?retained=yes`);
      expect(response?.status()).toBe(200);
      const header = page.getByTestId("site-navbar");
      await expect(header).toHaveCount(1);
      await expect(header.getByLabel("Loading site name")).toBeVisible();
      await expect(page.getByText(/Loading\s+workspace/)).toHaveCount(0);
      expect(await header.evaluate((element) => element.getBoundingClientRect().height)).toBe(64);
      expect(new URL(page.url()).searchParams.get("retained")).toBe("yes");
    }
    await page.reload();
    await expect(page.getByTestId("site-navbar")).toHaveCount(1);
  } finally { await context.close(); }
});

test("Next serves isolated assets and preserves backup worker URLs", async ({ request }) => {
  const response = await request.get("/shell-check");
  const html = await response.text();
  expect(html).toContain('data-testid="dashboard-navbar"');
  expect(html).toContain("/studio-static/_next/");
  const stylesheet = /href="([^" ]*\/studio-static\/_next\/static[^" ]*\.css[^" ]*)"/.exec(html)?.[1];
  expect(stylesheet).toBeDefined();
  if (!stylesheet) throw new Error("Missing server-linked stylesheet");
  const css = await request.get(stylesheet.replaceAll("&amp;", "&"));
  expect(css.status()).toBe(200);
  expect(css.headers()["content-type"]).toContain("text/css");
  for (const [path, contentType] of [
    ["/assets/site-settings-social-preview.png", "image/png"],
    ["/assets/favicon.ico", "image/"],
    ["/__zerospin/backup-worker.js", "javascript"],
    ["/__zerospin/wa-sqlite-async.wasm", "application/wasm"],
  ]) {
    const asset = await request.get(path);
    expect(asset.status(), path).toBe(200);
    expect(asset.headers()["content-type"], path).toContain(contentType);
  }
  expect((await request.get("/assets/missing.js")).status()).toBe(404);
});

test("removed and unknown routes remain not found", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const path of ["/unknown/path/that/does/not/exist", "/shell-check/site/sit_check/page/pag_check/compose"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
  } finally { await context.close(); }
});
