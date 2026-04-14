import { ArrayMatcher, RoutePattern } from "@remix-run/route-pattern";

/** Default `[pageId]` for the primary site workspace (`/site/:siteId/page/:pageId`). */
export const DEFAULT_SITE_PAGE_ID = "home" as const;

const brickCatalogPattern = new RoutePattern("site/:siteId/page/:pageId/brick-catalog");
const brickDetailPattern = new RoutePattern("site/:siteId/page/:pageId/brick/:brickId");
const composePattern = new RoutePattern("site/:siteId/page/:pageId/compose");

const patterns = {
  brickCatalog: brickCatalogPattern,
  brickDetail: brickDetailPattern,
  compose: composePattern,
} satisfies Record<string, RoutePattern>;

/**
 * Pathname-only URLs for matching (host is ignored; origin is stable for tests).
 */
const DRAWER_MATCH_ORIGIN = "http://qrk.invalid";

export const pathMatcher = new ArrayMatcher<keyof typeof patterns>();

Object.entries(patterns).forEach(([key, pattern]) => {
  pathMatcher.add(pattern, key as keyof typeof patterns);
});

export function matchDrawerPathname(pathname: string) {
  return pathMatcher.match(new URL(pathname, DRAWER_MATCH_ORIGIN));
}
