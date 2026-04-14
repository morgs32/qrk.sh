import { ArrayMatcher, RoutePattern, type Match } from "@remix-run/route-pattern";

const editTilesPattern = new RoutePattern("site/:siteId/edit-tiles");
const tileDetailPattern = new RoutePattern("site/:siteId/tile/:tileId");
const editTextPattern = new RoutePattern("site/:siteId/edit-text");

/**
 * Pathname-only URLs for matching (host is ignored; origin is stable for tests).
 */
const DRAWER_MATCH_ORIGIN = "http://qrk.invalid";

export type DrawerPathData = "edit-tiles" | "tile-detail" | "edit-text";

export function drawerPathnameToUrl(pathname: string): URL {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalized, DRAWER_MATCH_ORIGIN);
}

/**
 * Single matcher for `@leftDrawer` / `@rightDrawer` routes under `/site/[siteId]/…`.
 *
 * @see https://github.com/remix-run/remix/tree/main/packages/route-pattern
 */
export const pathMatcher = new ArrayMatcher<DrawerPathData>();

pathMatcher.add(editTilesPattern, "edit-tiles");
pathMatcher.add(tileDetailPattern, "tile-detail");
pathMatcher.add(editTextPattern, "edit-text");

export function Drawers() {}
