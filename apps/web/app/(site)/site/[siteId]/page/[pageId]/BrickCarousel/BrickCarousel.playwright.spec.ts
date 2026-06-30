import { expect, test } from "@playwright/test";

const pageBase = "/site/e2e/page/home";

/** Matches BrickCarousel slide minHeight: calc(def.h * 50vw / 8) (half viewport / 8 cols). */
function expectedSlideMinHeightPx(viewportWidth: number, gridH: number): number {
  return (gridH * viewportWidth * 0.5) / 8;
}

test.describe("BrickCarousel preview slide min-height", () => {
  test("carousel slides resolve min-height from def.h", async ({ page }) => {
    const viewportWidth = 1440;
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await page.goto(`${pageBase}/brick-catalog`, { waitUntil: "load" });

    const drawer = page.getByRole("dialog", { name: "Workspace drawer" });
    await expect(drawer).toBeVisible({ timeout: 90_000 });

    const result = await drawer.evaluate((root) => {
      const host = root as HTMLElement;
      const carousel = host.querySelector<HTMLElement>('[data-slot="carousel"]');
      if (!carousel) {
        return { ok: false as const, reason: 'no [data-slot="carousel"] in drawer' };
      }

      const slides = Array.from(
        carousel.querySelectorAll<HTMLElement>('[data-slot="carousel-item"]'),
      );
      if (slides.length === 0) {
        return { ok: false as const, reason: "no carousel slides" };
      }

      const slideGridHs = slides.map((el) =>
        Number.parseFloat(el.getAttribute("data-brick-drawer-slide-grid-h") ?? ""),
      );
      if (slideGridHs.some((h) => !Number.isFinite(h) || h <= 0)) {
        return { ok: false as const, reason: "bad data-brick-drawer-slide-grid-h on slide" };
      }

      const minHeights = slides.map((el) => parseFloat(getComputedStyle(el).minHeight));
      return { ok: true as const, slideGridHs, minHeights };
    });

    expect(result.ok, result.ok ? "" : (result as { reason: string }).reason).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.minHeights.length,
      "at least one collection with bricks should render slides",
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
