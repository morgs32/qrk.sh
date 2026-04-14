import { ArrayMatcher, RoutePattern } from "@remix-run/route-pattern";

const editBricksPattern = new RoutePattern("site/:siteId/edit-bricks");
const brickDetailPattern = new RoutePattern("site/:siteId/brick/:brickId");
const editTextPattern = new RoutePattern("site/:siteId/edit-text");

/**
 * Pathname-only URLs for matching (host is ignored; origin is stable for tests).
 */
const DRAWER_MATCH_ORIGIN = "http://qrk.invalid";

export type DrawerPathData = "edit-bricks" | "brick-detail" | "edit-text";

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

pathMatcher.add(editBricksPattern, "edit-bricks");
pathMatcher.add(brickDetailPattern, "brick-detail");
pathMatcher.add(editTextPattern, "edit-text");

export function Drawers() {}
