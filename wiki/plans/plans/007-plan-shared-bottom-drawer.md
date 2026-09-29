# One shared Drawer, one Studio drawer route group

Status: implemented; verification remains partially blocked. Keep this plan active until the outstanding checks below pass.

## Implementation

1. Move Web's Drawer module unchanged to Library's `lib/Drawer.tsx`, preserving Drawer and DrawerPresence. Add `/Drawer` as an explicit package export and Vite library entry; externalize the existing framer-motion dependency. Remove the old Web export. Library imports its defining source; Studio imports the public subpath.
2. Consolidate Studio routes under `(drawer)`, retaining public URLs. The universal client layout owns the shared bottom surface and React ViewTransition. Its `(bricks)` child owns breadcrumbs and the single brick close link. Page/site settings retain their own Save/Cancel headers.
3. Reserve 50dvh for any drawer route, animate the grid rows for 300 ms, and keep MainColumns, session, article, and grid mounted. Disable row and view-transition movement under reduced motion. Remove the brick toolbar and obsolete left-transition CSS; keep breakpoints unchanged.
4. Update export/ownership documentation and affected Studio browser checks. Preserve unrelated article changes and Library/brick domain behavior.

## Annotated examples

```tsx
// Studio consumes a dedicated public entry, not a root barrel.
import { Drawer } from "@qrk.sh/library/Drawer";

// The shared surface has no Next routing or settings ownership.
<ViewTransition default="none" enter="drawer-bottom-in" exit="drawer-bottom-out">
  <Drawer side="bottom" layoutMode="flow" animated={false} aria-label="Workspace drawer">
    {children}
  </Drawer>
</ViewTransition>
```

1. Catalog → module → placed brick: the bottom shell persists; only breadcrumb/content changes. Existing brick identity and payloads remain intact.
2. Brick route → settings: the same `(drawer)` shell persists; settings own their actions, with no generic close link bypassing Cancel.
3. Close/Cancel → Back: the editor expands, then the earlier drawer route returns without replacing the editor session.

## Verification, 2026-09-29

1. Passed: Studio typecheck and lint; Web typecheck and lint; Library lint; scoped formatting and `git diff --check`. Next route types were regenerated and stale generated `(left)`/`(bottom)` declarations removed after moving the routes.
2. Passed: all four Chromium server-shell Playwright checks, including deep routes, assets, and not-found behavior.
3. Passed: Drawer JavaScript and declarations emitted; importing both Drawer and DrawerPresence from Studio's `@qrk.sh/library/Drawer` resolves. Library's complete build and typecheck fail on seven existing `queryDb` versus `db` contract-guard incompatibilities, outside this change.
4. Manually verified in the existing authenticated Chrome session: catalog opens at the bottom; module breadcrumb navigation and close work; page settings use the same half-height geometry; editing a temporary title shows Save/Cancel and Cancel returns to the editor. Catalog and settings measured 450 px tall at a 390×900 viewport and half-height at the normal desktop viewport. Temporary viewport override was cleared; the title draft was cancelled.
5. Blocked: upward module-preview drag reaches `addBrick` but its existing contract guard throws when reading `.query` from an undefined database argument. No brick was created. Successful placement and placed-brick navigation therefore remain unverified.
6. Blocked: the updated authenticated Studio suite reached the sign-in screen because no Playwright storage state was configured; it stopped on the first failure (12 checks not run). The existing Chrome login was used only for manual checks. Shell-identity assertions, interrupted history, reduced-motion, and unsupported-view-transition browser cases remain pending in that suite.
7. Blocked: Library's running app returns HTTP 500 at its root; manual Library drawer verification could not proceed. No Library tests were written or run.

## Remaining acceptance

1. Resolve the existing Library contract-guard API incompatibility in separate work; rerun Library build/typecheck and successful drag/placed-brick checks.
2. Supply valid Playwright authentication and an existing editor URL; rerun the affected Studio drawer, modules, and brick-detail suite across the configured browsers.
3. Restore Library app readiness and manually check its drawer. Archive this plan only after the remaining verification succeeds.
