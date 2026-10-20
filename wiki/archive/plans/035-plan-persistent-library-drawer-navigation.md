# Persistent Library drawer navigation

Status: complete and archived on 2026-10-20. The user removed the unavailable brick-detail/form-cancellation check from this change's acceptance criteria.

## Agreed behavior

1. Keep Library's full drawer navigation visible at the bottom when closed; raise it above the content when opened. Studio adoption is a separate step.
2. Use a fixed 56px, single-line bar with horizontal scrolling when needed. Keep breadcrumbs, Cards, and Display placeholders usable in both states; show Close drawer only when open.
3. Bricks always opens the catalog, including when the catalog URL is already current. Remove Bricks and its separator from the floating toolbar, leaving breakpoint controls.
4. Preserve the open drawer's total 50dvh height, 300ms transition, reduced-motion behavior, frame sizing, scroll anchoring, routing, session lifetime, and form cancellation.

## Implementation

1. Add optional `persistentHeader?: ReactNode` to the existing shared Drawer. For controlled bottom drawers, retain this slot through closing; restrict closed-body inertness and accessibility hiding to the body. Preserve callers that omit the slot.
2. Keep the closed bar accessible without dialog semantics. Release body content after exit, handle interrupted closes, and restore focus to the opener or persistent Bricks link when appropriate.
3. Move Library navigation into the slot. Retain its route-owned breadcrumbs and state; explicitly open the drawer from Bricks, rather than toggling it.
4. Add optional `closedDrawerHeight?: number`, default 0, to WallPreviewViewport. Library supplies 56. Reserve that many trailing pixels while closed and position the toolbar 24px above the bar; retain 50dvh open spacing.
5. Add no measurement observer, dependencies, named types, component abstraction, automated suites, or check gates. The fixed-height choice avoids measurement coordination; horizontal scrolling handles narrow navigation.

Files (`~` modified, `+` created):

```text
qrk.sh/
├── apps/library/
│   ├── app/LibraryLayout.tsx                 ~
│   ├── lib/Drawer.tsx                        ~
│   ├── lib/WallPreviewViewport.tsx           ~
│   └── README.md                            ~
└── wiki/archive/plans/
    └── 035-plan-persistent-library-drawer-navigation.md +
```

## Annotated integration

```tsx
// 1. Closed navigation occupies 56px; the toolbar clears it.
<WallPreviewViewport
  drawerOpen={drawerOpen}
  closedDrawerHeight={56}
  toolbar={toolbar}
>
  {/* Existing preview panes retain their size and identity. */}
</WallPreviewViewport>

// 2. Navigation survives closing; route content retains its exit lifecycle.
<Drawer side="bottom" open={drawerOpen} persistentHeader={drawerNavigation}>
  {/* Existing drawer body remains here. */}
</Drawer>
```

1. Closing the catalog leaves its URL unchanged. Clicking the persistent Bricks link reopens that same catalog.
2. Closing a brick form retains the existing route cleanup and draft cancellation. Bricks subsequently opens the catalog, rather than restoring an unsaved form.
3. At narrow widths, navigation stays 56px tall and scrolls horizontally; the breakpoint toolbar remains above its visible edge.

## Verification

1. Manually exercise root, catalog, and module routes; close/reopen the same URL and navigate via breadcrumbs.
2. Verify both toggles while closed, conditional X, and breakpoint-only floating controls.
3. Check desktop and narrow geometry, horizontal reachability, fixed height, toolbar clearance, and middle/bottom scroll anchoring.
4. Check keyboard focus, hidden-body tab exclusion, reduced motion, and rapid close/reopen.
5. Confirm Studio's existing default behavior. Do not introduce automated suites or check gates.
6. Brick-detail and form-cancellation verification is excluded following the user's explicit acceptance-criteria change on 2026-10-20: "Remove that check and finish this change."

## Post-implementation documentation

1. Update Library's README with implemented navigation, fixed height, spacing, and optional shared APIs.
2. Reconcile the existing glossary only if implemented terminology changes its meaning. Create an ADR only for an implemented decision that is hard to reverse, surprising without context, and the result of a real trade-off.
3. Record verification, set Remaining work to None, and archive this plan after implementation and manual verification are complete.

## Implementation outcome

1. Implemented the persistent header slot, fixed 56px bar, closed-body accessibility and cleanup, catalog opener, breakpoint-only toolbar, and optional closed viewport reservation. Closed navigation leaves right-side space for the existing DevTools launcher so it does not cover the last control.
2. Updated Library's README. No new domain terminology changes the existing glossary; this reversible UI choice does not warrant an ADR. Studio's source and session/form behavior were not modified.

## Verification results

1. Verified Library root, catalog, and module navigation in Chrome and the in-app browser. Closing the catalog retains its URL; keyboard activation of Bricks reopens that same URL. Both toggles remain usable while closed and were restored to their original values.
2. At 1476×1314, the closed bar measured exactly 56px and the toolbar gap measured exactly 24px. Closed body content was released, marked inert and aria-hidden, and the shell had no dialog role. Keyboard focus returned to Bricks; tabbing visited the two toggles and skipped body controls.
3. At 390×844, the open drawer measured 422px (50dvh), its navigation measured 56px, and the module navigation overflowed horizontally rather than wrapping. Keyboard access reached the offscreen checkbox. Temporary viewport overrides were reset.
4. A keyboard close/reopen sequence completed within 74ms and retained the reopened catalog. With Chrome Rendering's prefers-reduced-motion emulation, drawer transition duration was 0s, toolbar transition was none, and closing immediately released the body. Media emulation was restored to No emulation and Chrome DevTools was closed.
5. Verified scroll preservation: a middle offset of 24px stayed 24px through open/close; a bottom offset followed maxima from 56px closed to 632px open and back to 56px. Preview frame size stayed unchanged.
6. Reviewed Studio's existing Drawer and WallPreviewViewport call sites and the shared default branches. Studio omits both new options; its original full-hide/inert/cleanup behavior and zero closed reservation are retained. No authenticated Studio runtime verification is claimed.
7. Both browsers' existing Library brick tables were empty in Zerospin DevTools. The catalog is browse-only, so no existing brick-detail form could be opened to exercise cancellation. The user explicitly removed this check from the acceptance criteria on 2026-10-20; it was not performed. No fixture data or backend behavior was added.
8. Formatted only the three changed TypeScript source files with the existing formatter. No automated test suites or check gates were added or run. Unrelated concurrent Article edits were preserved.

## Remaining work

None.
