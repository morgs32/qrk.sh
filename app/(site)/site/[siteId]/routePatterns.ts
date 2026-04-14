import { ArrayMatcher, RoutePattern } from "@remix-run/route-pattern";

/** Default `[pageId]` for the primary site workspace (`/site/:siteId/page/:pageId`). */
export const DEFAULT_SITE_PAGE_ID = "home" as const;

export const pagePattern = new RoutePattern("site/:siteId/page/:pageId");

export const brickCatalogPattern = new RoutePattern("site/:siteId/page/:pageId/brick-catalog");
export const brickDetailPattern = new RoutePattern("site/:siteId/page/:pageId/brick/:brickId");
export const composePattern = new RoutePattern("site/:siteId/page/:pageId/compose");

const patterns = {
  brickCatalog: brickCatalogPattern,
  brickDetail: brickDetailPattern,
  compose: composePattern,
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
