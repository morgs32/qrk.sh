# Rename Studio's brick-group catalog to modules

Status: implemented and archived at user direction; authenticated Playwright verification remains in [TODOs](../../../TODOS.md).

## Implementation

1. Hard rename the current `(drawer)/(bricks)` catalog routes to `/modules` and `/modules/[moduleId]`. Preserve schema validation and the existing module-not-found behavior. Old catalog URLs become not found without redirects.
2. Rename `BrickGroup` to `Modules`, including its directory and matching Studio test. Move the existing metadata helpers with it; rename the detail functions to `ModuleRoute` and `ModuleRouteBody`.
3. Update toolbar, catalog, breadcrumb, and Studio test links. Use the raw route parameter as `routeModuleId` in the breadcrumb layout, keeping validated `moduleId` distinct. Rename the catalog breadcrumb to **Modules**; retain **Add bricks**.
4. Update Studio's README, architecture references, and plan 007's pending suite reference. Preserve the uncommitted shared-drawer work, brick routes and identity, schemas, drag payloads, previews, and layout behavior. Add no redirects, abstractions, named types, or migrations.

## Annotated examples

```tsx
// 1. Alias raw URL input; the existing schema still validates it before lookup.
const {
  username,
  siteId,
  pageId,
  moduleId: routeModuleId,
  brickId,
} = useParams<{
  username: string;
  siteId: string;
  pageId: string;
  moduleId?: string;
  brickId?: string;
}>();

// 2. The catalog contains modules; the action that opens it remains Add bricks.
<Link href={`${base}/modules`} scroll={false}>
  Modules
</Link>;
```

1. **Add bricks → Modules → Swatch and Icon** opens the catalog, then `/modules/swatch-and-icon`, within the same drawer shell.
2. **Placed brick → module breadcrumb** still starts at `/brick/[brickId]` and returns to the corresponding module detail.
3. **Old catalog URL → Page not found** rejects both the old catalog and its detail URLs, without redirecting.

## Verification

1. Update existing Studio catalog, detail, drawer, grid, and history checks. Extend shell checks for the new URLs, encoded detail segments, and both removed URL forms.
2. Regenerate Next route types; run Studio typecheck and lint through `pnpm nx`, plus affected formatting and diff checks.
3. Run affected Studio Playwright checks with valid authentication and an existing editor. Manually verify Add bricks, module detail, breadcrumb return, and close. Record missing fixtures and unrelated runtime failures as blockers.
4. Search active source and documentation for stale names, allowing intentional old-URL rejection checks and this rename record. Do not modify or run Library tests. Outstanding authenticated verification is tracked in [TODOs](../../../TODOS.md).

## Verification results, 2026-09-29

1. Passed: Next route type generation, Studio typecheck, and Studio lint. Removed one stale generated declaration under `.next/dev/types` for the deleted catalog route before rerunning typecheck.
2. Passed: all 12 server-shell checks across Firefox, WebKit, and Chromium against the running Studio server. New catalog/detail routes, encoded segments, and both rejected old URL forms are covered.
3. Passed manually in the existing authenticated Chrome profile: Add bricks opens `/modules`; Swatch and Icon opens its module detail; Modules returns to the catalog; Close drawer returns to the editor and restores Add bricks.
4. Passed: scoped formatting checks and `git diff --check`. Plan 007 already had formatting differences before this change; its single suite-name edit preserves the surrounding formatting. Active source/documentation contains no stale names outside intentional old-URL rejection checks and this rename record.
5. Blocked: authenticated Studio Playwright drawer, catalog, detail, grid, and history checks were not run because `PLAYWRIGHT_STORAGE_STATE` is not configured. Manual navigation used the existing Session verification disposable editor; placed-brick navigation and automated shell-identity/history assertions remain unverified. No Library tests were modified or run.
