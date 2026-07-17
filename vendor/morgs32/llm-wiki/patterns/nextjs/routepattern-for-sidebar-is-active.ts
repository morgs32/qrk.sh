declare class RoutePattern {
  constructor(pattern: string);
  test(url: URL): boolean;
  href(params: Record<string, string>): string;
}

/**
 * Sidebar active state: `(/)` optional trailing slash on patterns; central `isActiveRoute` helper.
 *
 * @bad `pathname === membersPath || pathname === \`${membersPath}/\``.
 * @bad Regex or prefix match when `RoutePattern` covers the path.
 * @bad Repeating `pattern.test(new URL(pathname, 'http://n'))` at every call site.
 */
export function isActiveRoute(
  pathname: string,
  pattern: RoutePattern,
): boolean {
  return pattern.test(new URL(pathname, 'http://n'));
}

export const membersRoutePattern = new RoutePattern(
  '/dashboard/:organizationId/members(/)',
);

export const buildMembersNav = (pathname: string, organizationId: string) => {
  const onMembers = isActiveRoute(pathname, membersRoutePattern);
  const membersPath = membersRoutePattern.href({ organizationId });
  return { onMembers, membersPath };
};
