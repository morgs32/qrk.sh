import { expect, test } from "@playwright/test";

/**
 * Matches TileDrawer + TilePreview: `calc(def.h * 50vw / 4)` (half viewport ÷ 4 cols).
 */
function expectedSlideMinHeightPx(viewportWidth: number, gridH: number): number {
  return gridH * viewportWidth * 0.5 * 0.25;
}

test.describe("Tile drawer preview slide min-height", () => {
  test("carousel slides resolve min-height from collection max def.h", async ({ page }) => {
    const viewportWidth = 1440;
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await page.goto("/", { waitUntil: "load" });

    await page.getByRole("button", { name: "Edit tiles" }).click();

    const drawer = page.getByRole("dialog", { name: "Workspace drawer" });
    await expect(drawer).toBeVisible({ timeout: 90_000 });

    const result = await drawer.evaluate((root) => {
      const host = root as HTMLElement;
      const varHost = host.querySelector<HTMLElement>("[style*='--drawer-collection-max-h']");
      if (!varHost) {
        return { ok: false as const, reason: "no --drawer-collection-max-h host" };
      }
      const maxHStr = getComputedStyle(varHost)
        .getPropertyValue("--drawer-collection-max-h")
        .trim();
      const maxH = Number.parseFloat(maxHStr);
      if (!Number.isFinite(maxH) || maxH <= 0) {
        return {
          ok: false as const,
          reason: `bad --drawer-collection-max-h: ${JSON.stringify(maxHStr)}`,
        };
      }

      const slides = Array.from(
        varHost.querySelectorAll<HTMLElement>('[data-slot="carousel-item"]'),
      );
      if (slides.length === 0) {
        return { ok: false as const, reason: "no carousel slides" };
      }

      const slideGridHs = slides.map((el) =>
        Number.parseFloat(el.getAttribute("data-tile-drawer-slide-grid-h") ?? ""),
      );
      if (slideGridHs.some((h) => !Number.isFinite(h) || h <= 0)) {
        return { ok: false as const, reason: "bad data-tile-drawer-slide-grid-h on slide" };
      }

      const minHeights = slides.map((el) => parseFloat(getComputedStyle(el).minHeight));
      return { ok: true as const, maxH, slideGridHs, minHeights };
    });

    expect(result.ok, result.ok ? "" : (result as { reason: string }).reason).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.minHeights.length,
      "at least one collection with tiles should render slides",
    ).toBeGreaterThan(0);

    for (let i = 0; i < result.minHeights.length; i++) {
      const gridH = result.slideGridHs[i]!;
      const expected = expectedSlideMinHeightPx(viewportWidth, gridH);
      const actual = result.minHeights[i]!;
      expect(
        actual,
        `slide ${i} min-height (def.h=${gridH}, expected ~${expected}px)`,
      ).toBeGreaterThanOrEqual(expected - 2);
    }
  });
});
