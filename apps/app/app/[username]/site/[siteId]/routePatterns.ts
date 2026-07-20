import { ArrayMatcher, RoutePattern } from "@remix-run/route-pattern";

/**
 * Site workspace route patterns (`@remix-run/route-pattern`).
 *
 * - Build pathnames / hrefs: `pattern.href(params[, searchParams])` (throws `HrefError` if params are missing).
 * - Match a URL: `pattern.match(url)` → `{ params, url, … } | null`.
 * - Pathname-only patterns here serialize with a leading `/` (e.g. `/:username/site/…`).
 *
 * `pagePattern` is the base workspace page; nested routes extend it with extra segments.
 */
export const pagePattern = new RoutePattern(":username/site/:siteId/page/:pageId");

/** Public published site URL (`https://www.qrk.sh/:username/:siteId`). */
export const publishedPattern = new RoutePattern(":username/:siteId");

export const brickCatalogPattern = new RoutePattern(
  ":username/site/:siteId/page/:pageId/brick-catalog",
);
export const brickDetailPattern = new RoutePattern(
  ":username/site/:siteId/page/:pageId/brick/:brickId",
);
export const composePattern = new RoutePattern(":username/site/:siteId/page/:pageId/compose");
export const pageSettingsPattern = new RoutePattern(
  ":username/site/:siteId/page/:pageId/page-settings",
);
export const siteSettingsPattern = new RoutePattern(
  ":username/site/:siteId/page/:pageId/site-settings",
);
export const breakpointsPattern = new RoutePattern(
  ":username/site/:siteId/page/:pageId/breakpoints",
);

const patterns = {
  brickCatalog: brickCatalogPattern,
  brickDetail: brickDetailPattern,
  compose: composePattern,
  pageSettings: pageSettingsPattern,
  siteSettings: siteSettingsPattern,
  breakpoints: breakpointsPattern,
} satisfies Record<string, RoutePattern>;

/**
 * Pathname-only URLs for matching (host is ignored; origin is stable for tests).
 */
export const PAGE_PATH_MATCH_ORIGIN = "http://qrk.invalid";

export function pathnameToMatchUrl(pathname: string) {
  return new URL(pathname, PAGE_PATH_MATCH_ORIGIN);
}

export const pathMatcher = new ArrayMatcher<keyof typeof patterns>();

Object.entries(patterns).forEach(([key, pattern]) => {
  pathMatcher.add(pattern, key as keyof typeof patterns);
});

export function matchPagePathname(pathname: string) {
  return pathMatcher.match(pathnameToMatchUrl(pathname));
}
