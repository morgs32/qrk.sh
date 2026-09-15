import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 3000, height: 1100 } });

const repo = {
  name: "a-repository-name-that-is-much-too-long-for-this-card",
  description:
    "A description that is deliberately long enough to overflow the compact repository card.",
  stargazers_count: 123,
  forks_count: 2,
  language: "TypeScript",
  html_url: "https://github.com/morgs32/ink-steps",
};

test.beforeEach(async ({ page }) => {
  await page.route("https://api.github.com/repos/morgs32/ink-steps", (route) =>
    route.fulfill({ json: repo }),
  );
});

for (const [width, height] of [
  [375, 6],
  [640, 2],
  [1024, 2],
  [1440, 2],
]) {
  test(`repo previews, drag placeholder, and placement agree at ${width}px`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("toolbar", { name: "Grid controls" }).getByRole("button", { name: "Bricks", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Bricks", exact: true })).toBeVisible();
    await page.getByRole("button", { name: `${width}px grid width`, exact: true }).click();
    const group = page.locator('[data-group-entry="github"]');
    await group.getByRole("button", { name: "Repo", exact: true }).click();
    const representative = group.locator('[data-group-representative="github/repo"]');
    await expect(representative).toHaveCSS("width", `${Math.round((width / 8) * 4)}px`);
    await expect(representative).toHaveCSS("height", `${Math.round((width / 8) * height)}px`);
    await representative.getByRole("link", { name: "Configure catalog" }).click();
    const source = page.locator('[data-catalog-brick="github/repo"]');
    await expect(source).toHaveCSS("width", `${Math.round((width / 8) * 4)}px`);
    await expect(source).toHaveCSS("height", `${Math.round((width / 8) * height)}px`);
    const grid = page.getByLabel("Brick grid", { exact: true }).locator(".react-grid-layout");
    await grid.evaluate((element) => {
      // Capture the external dropping item before native drop replaces it with a placed brick.
      const observer = new MutationObserver(() => {
        const placeholder = element.querySelector(":scope > .react-grid-item:not([data-brick-id])");
        if (!(placeholder instanceof HTMLElement)) return;
        element.setAttribute("data-observed-placeholder-width", placeholder.style.width);
        element.setAttribute("data-observed-placeholder-height", placeholder.style.height);
      });
      observer.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
      element.addEventListener("drop", () => observer.disconnect(), { once: true });
    });
    await source.dragTo(grid, { targetPosition: { x: 20, y: 200 } });
    await expect(grid).toHaveAttribute(
      "data-observed-placeholder-width",
      `${Math.round((width / 8) * 4)}px`,
    );
    await expect(grid).toHaveAttribute(
      "data-observed-placeholder-height",
      `${Math.round((width / 8) * height)}px`,
    );
    const placed = grid.locator('[data-brick="github/repo"]');
    await expect(placed).toHaveAttribute("data-grid-w", "4");
    await expect(placed).toHaveAttribute("data-grid-h", String(height));
    await placed.getByRole("link", { name: "Edit brick", exact: true }).click();
    await expect(page.getByTestId("selected-brick-preview")).toHaveCSS(
      "height",
      `${Math.round((width / 8) * height)}px`,
    );
    await page.reload();
    await expect(placed).toHaveAttribute("data-grid-h", String(height));
    const otherWidth = width === 375 ? 640 : 375;
    await page.getByRole("button", { name: `${otherWidth}px grid width`, exact: true }).click();
    await expect(page.getByTestId("selected-brick-preview")).toHaveCSS(
      "height",
      `${Math.round((otherWidth / 8) * height)}px`,
    );
    await expect(placed).toHaveAttribute("data-grid-h", String(height));
  });
}

test("XS truncates text and anchors compact stats below the description", async ({ page }) => {
  await page.goto("/groups/github?catalog=repo");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const source = page.locator('[data-catalog-brick="github/repo"]');
  await expect(source).toHaveCSS("height", "281px");
  const title = source.getByRole("heading", { name: repo.name });
  const description = source.getByText(repo.description, { exact: true });
  await expect(title).toHaveCSS("font-size", "14px");
  await expect(description).toHaveCSS("font-size", "12px");
  for (const text of [title, description]) {
    await expect(text).toHaveCSS("text-overflow", "ellipsis");
    await expect(text).toHaveCSS("white-space", "nowrap");
    expect(await text.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  }
  await expect(source.locator(".lucide-monitor")).toHaveCSS("width", "14px");
  await expect(source.locator(".lucide-star")).toHaveCSS("width", "12px");
  const content = source.locator('[data-slot="card-content"]');
  const stats = content.locator(":scope > div").last();
  await expect(stats).toHaveCSS("font-size", "12px");
  await expect(stats).toContainText("123");
  await expect(stats).toContainText("2");
  await expect(stats).toContainText("TypeScript");
  const statsBounds = await stats.boundingBox();
  const contentBounds = await content.boundingBox();
  const descriptionBounds = await description.boundingBox();
  expect(statsBounds!.y).toBeGreaterThan(descriptionBounds!.y + descriptionBounds!.height);
  expect(
    Math.abs(contentBounds!.y + contentBounds!.height - statsBounds!.y - statsBounds!.height - 12),
  ).toBeLessThan(1);
  await expect(source.locator('a[target="_blank"]')).toHaveAttribute("href", repo.html_url);
  await source.screenshot({ path: test.info().outputPath("github-repo-xs.png") });
  await page.getByRole("button", { name: "640px grid width", exact: true }).click();
  await expect(title).toHaveCSS("font-size", "18px");
  await expect(source.locator(".lucide-monitor")).toHaveCSS("height", "20px");
});

test("XS preserves missing description and optional stats", async ({ page }) => {
  await page.route("https://api.github.com/repos/morgs32/ink-steps", (route) =>
    route.fulfill({ json: { ...repo, description: null, forks_count: 0, language: null } }),
  );
  await page.goto("/groups/github?catalog=repo");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const source = page.locator('[data-catalog-brick="github/repo"]');
  await expect(source.getByText("No description provided")).toBeVisible();
  await expect(source.locator(".lucide-git-fork")).toHaveCount(0);
  await expect(source.getByText("TypeScript")).toHaveCount(0);
  await expect(source.getByText("123", { exact: true })).toBeVisible();
});

test("XS loading and missing repository states stay inside the card", async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://api.github.com/repos/morgs32/ink-steps", async (route) => {
    await pending;
    await route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  await page.goto("/groups/github?catalog=repo");
  await page.getByRole("button", { name: "375px grid width", exact: true }).click();
  const source = page.locator('[data-catalog-brick="github/repo"]');
  await expect(source.locator(".animate-pulse")).toBeVisible();
  release();
  await expect(source.getByText("Repository not found")).toBeVisible();
  await expect(source.getByText("Repository not found")).toHaveCSS("font-size", "12px");
  await expect(source).toHaveCSS("height", "281px");
});

test("standalone repo preview follows its simulated grid breakpoint", async ({ page }) => {
  await page.goto("/bricks/github/repo");
  for (const [unit, height] of [
    [40, 6],
    [80, 2],
    [128, 2],
    [180, 2],
  ]) {
    await page.getByLabel("Grid unit:", { exact: false }).fill(String(unit));
    await expect(page.getByTestId("brick-preview")).toHaveCSS("width", `${unit * 4}px`);
    await expect(page.getByTestId("brick-preview")).toHaveCSS("height", `${unit * height}px`);
  }
});
