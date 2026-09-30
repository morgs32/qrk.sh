# 013 — Shared fixed-width breakpoint walls

**Date:** 2026-09-29

**Status:** Implemented and archived at user direction; browser acceptance checks are tracked in [TODOs](../../../TODOS.md).

**Source:** [Approved design](../specs/013-spec-fixed-width-breakpoint-walls.md).

## Outcome and constraints

1. Display centered Studio walls at sm 360px, md 720px, lg 1080px, and xl 1440px on every editor route. Retain selection when drawers close; fall back to the largest fitting breakpoint and restore the selection when space returns.
2. Share Library's directional animation pane. Keep four Studio walls mounted with stable breakpoint ownership and one existing editor session.
3. In both apps, defer displayed breakpoint changes during catalog drags, existing-brick drags, and resizing. Record the latest selection and width immediately, then resolve once the gesture ends. Temporary clipping is accepted.
4. Preserve the current persistent overlay drawers, trailing drawer space, scroll anchoring, placeholder controls, toolbar placement, session keys, uploads, and unrelated WIP. The current drawer implementation has advanced since the original discussion; do not restore the former split-height layout.
5. Add no URL persistence, navigation blocking, dependency patches, new stores, named types, or abstractions beyond the approved `WallBreakpointPane`. Read the applicable Next.js documentation before changing route-related code. Use the existing pattern and Nx skills during implementation and verification.

## Ordered implementation

1. **Make the existing viewport store own the displayed breakpoint.**

   Extend the inline state in `apps/library/lib/WallViewportProvider.tsx` with `activeBreakpoint`, `gridGesture`, and `catalogDragActive`, plus setters for the two gesture signals. Keep `selectedBreakpoint` as the latest requested value; null still means automatic selection. Initialize the active breakpoint to null until available width is known.

   Update selection and width atomically with active-breakpoint resolution whenever neither gesture signal is active. Starting a gesture retains the current active breakpoint. Ending one signal resolves only if the other is also false. Keep the existing resolver and its selected-when-fitting/largest-fitting rules. Do not add a queue, duplicate pending selection, or persist transient gesture/active state.

   ```ts
   // 1 — Every request is recorded, even while the wall is frozen.
   setSelectedBreakpoint: (selectedBreakpoint) =>
     set((state) => ({
       selectedBreakpoint,
       // 2 — Only the displayed breakpoint waits for the gesture to finish.
       activeBreakpoint:
         state.gridGesture || state.catalogDragActive
           ? state.activeBreakpoint
           : resolveActiveBreakpoint(selectedBreakpoint, state.availableWidth),
     })),
   ```

   Apply the same rule to available-width updates and gesture-ending setters, using the latest store snapshot. Expose the stored active breakpoint through `useWallViewport`; keep placeholder controls and selection persistence unchanged. Remove the fluid wall observer/state only after all its Studio consumers have migrated and a scoped search confirms no remaining consumers. Leave unrelated breakpoint utilities intact.

2. **Wire both gesture sources and their completion ordering.**

   Subscribe to the existing `brickDragStore` from the viewport provider and synchronously forward whether `brickDef` is non-null into `catalogDragActive`. Synchronize the initial value when subscribing and unsubscribe on provider teardown. Do not change the payload model or rename the store. Synchronous forwarding ensures a selection or width update cannot slip through between drag start and the next React effect.

   Pass the viewport store's stable `setGridGesture` action to `BrickWall.onGestureChange` in Studio and Library. Replace Library's duplicate local grid-gesture state with the store value while retaining its current Compact gating. Preserve the explicit exclusion of RGL's external-drop placeholder from internal-grid gesture tracking: external drops finish through the catalog signal, not `onDragStop`.

   Complete existing layout/drop commands before clearing their gesture signal. Restore scroll overflow and position, clear local drag/resize state, and release measurement suppression before resolving the pending breakpoint. Use completion cleanup on failure paths as well, preserving current error reporting. Unmount cleanup releases only an actually active gesture; inactive panes must not clear another pane's signal. Do not attempt an imperative RGL abort or remount a wall.

   Cover every existing catalog source: `DraggableBrick`, Library's breakpoint preview row, and Studio's module-detail preview. Retain normal dragend/drop cleanup and add source-unmount cleanup that clears only the payload that source started. Track the exact published payload reference locally so an old source's cleanup cannot clear a newer drag. Repeated drop/dragend cleanup must be harmless. Do not clear catalog state merely because the pointer leaves the grid; the drag can return.

   ```text
   1 — Start dragging md: active=md, selected=md, gridGesture=true.
   2 — Request lg, then sm: active=md, selected=sm.
   3 — Width becomes 600px: active=md; availableWidth still updates.
   4 — Stage the md gesture result and restore scrolling.
   5 — Release gridGesture: resolve selected=sm at 600px, then display sm.
   ```

3. **Extract the shared animation pane and retain explicit transition ownership.**

   Move `LibraryWallPane` and its transition constant into `apps/library/lib/WallBreakpointPane.tsx`; rename the component and retain its existing inline props. Add the matching package subpath export, JavaScript build entry, and declaration output. Import the defining module directly from Library and the package subpath from Studio. No barrel or shared transition-controller hook.

   Keep outgoing panes absolute, active panes in normal flow, inactive panes hidden, and non-active panes inert. The pane's outer motion element spans the stage; its inner fixed-width wall is centered. Preserve 300ms, `[0, 0, 0.2, 1]`, larger-enter-right, and smaller-enter-left.

   Keep parent transition bookkeeping local to Library's `LayoutBody` and Studio's `Grid`, driven only by effective active-breakpoint changes. Update it before paint so an incoming wall does not flash at its destination before entering. Initial activation and recovery from null have direction zero and no outgoing pane. When active becomes null, clear previous/outgoing/direction state and immediately hide every pane without unmounting them.

   Ensure a pane cannot be both active and outgoing during a reversal. Cancel obsolete animation work on effect cleanup, including outstanding animation controls. Associate outgoing completion with the transition that started it; clear outgoing state only if that transition is still current. Rapid A → B → A and A → B → C changes must not allow an old completion to hide the latest wall. Reduced motion bypasses animation and clears outgoing state immediately.

4. **Render Studio's four fixed-width walls within the existing scroll layout.**

   Keep `MainColumns` full-width and preserve its existing scroll root, drawer spacer, and anchoring logic. Remove route-dependent fluid/preview sizing; place the fixed widths inside the individual panes in `Grid`. Retain the route-segment read used for drawer state. Keep the measured available region outside the fixed-width walls so selecting a smaller wall does not change its own available-width measurement.

   Render all breakpoint rows with stable keys, existing `WALL_ID`, and the same session from the current editor provider. Do not key the session, stage, or walls by selection, drawer route, or transition. Attach active-pane status to interactions, text editing, and height writes. Preserve upload and brick-activation callbacks for each pane.

   ```tsx
   // 1 — The stage and scroll root keep their full available width.
   // 2 — Every pane permanently owns one breakpoint and retains its wall.
   <WallBreakpointPane key={row.id} /* existing animation props */>
     <BrickWall
       session={session}                     // Shared editor session.
       wallId={WALL_ID}
       breakpoint={row.id}                    // Never retarget this instance.
       gridWidth={row.previewWidth}           // Fixed even on the base route.
       isActive={activeBreakpoint === row.id} // Only this wall may interact/measure.
     />
   </WallBreakpointPane>
   ```

   Show the existing insufficient-width message on every Studio editor route when width has been measured and effective active is null. Apply the same effective-active check to Library's message instead of its raw-width check, so it does not display alongside a wall retained during a gesture. Width zero before measurement shows no message or active wall. Once active becomes null, all panes remain mounted but hidden. Recovery displays immediately.

   Retain unique stage test identifiers. Put breakpoint identity and an explicit active marker on each fixed-width wall wrapper so checks can distinguish the active wall from the visible outgoing wall and the other mounted walls.

5. **Migrate consumers and retain editing semantics.**

   Switch Studio's Modules, module-detail route, BrickDetail, and Grid from measured `wallBreakpoint` to effective `activeBreakpoint`. Preserve the existing sm fallback for read-only drawer previews when no wall fits. Toolbar pressed state continues to describe the active wall; fit-based disabling continues to use current available width. Do not disable selection just because a gesture is active: changes must reach the request setter.

   Remove the text-edit wait for the fluid wall's measured width. On text activation, retain the requested brick/breakpoint through drawer-closing navigation and activate once the base route is current, provided that breakpoint is still active. Discard pending activation if it is no longer valid. Keep the route-close ordering without the width comparison or resize synchronization. Scope edit-end callbacks to their pane so a stale callback cannot clear another pane's edit.

   End text editing only when effective active changes, not merely when selected or available width changes during deferral. Preserve editor instance identity, upload cancellation on actual edit exit, and rejection of late upload insertion. Update the Studio and Library READMEs to explain fixed widths, selection restoration, gesture deferral, and immediate insufficient-width recovery; retain current drawer documentation.

## Browser acceptance and examples

1. Extend the existing Studio Drawers, Grid, and TextEditing Playwright suites as the primary automated seam. Scope geometry and brick locators to the active wrapper; `:visible` alone is insufficient while the outgoing wall is still visible. Update the old expectation that drawer close restores the fluid width, and distinguish full-width stage geometry from fixed-width wall geometry.
2. Assert 360/720/1080/1440px walls and centering on base, modules, detail, settings, and breakpoint routes. Cover drawer close/open and browser history without remounting the editor. Capture all four wall element handles, switch away and back, and verify identity plus retained editor/session-backed content and backup behavior.
3. Sample real transforms during larger/smaller transitions; verify the outgoing pane is inert, the final transform is zero, and only the latest active pane remains displayed. Cover A → B → A and A → B → C before the 300ms duration finishes. Under reduced motion, assert immediate completion with no outgoing pane.
4. For each gesture kind, keep the gesture open while changing available width and requesting multiple fitting breakpoints. For a held pointer, invoke the existing toolbar button's click handler through its DOM element rather than releasing the pointer or adding a production test API. Assert retained wall width and breakpoint until completion, then exactly the latest fitting result. Use actual mouse drag/resize sequences and the existing catalog drag path; synthetic event coverage alone does not establish native cancellation behavior.
5. Verify a catalog drop writes before switching, Escape cancellation and dropping outside release deferral, drag-source teardown cannot leave a payload stuck, and leaving/re-entering an editor does not retain transient gesture state. Preserve ordinary remove-on-outside-drop behavior for existing bricks. Verify later gestures, measurements, and scrolling still work after these cases.
6. Cover selection fallback and restoration: md selected at 800px → 600px displays sm → 800px restores md. During a held gesture, the same width changes retain the original active pane until release.
7. Cover md → below 360px → gesture release → no active pane/message → recovery at 400px → sm immediately. Repeat crossing below 360px during an animation without a gesture; no outgoing wall may remain displayed and no stale completion may affect recovery.
8. Recheck drawer spacer/bottom anchoring, scroll restoration after drag, text activation through drawer close, text editing exit on active changes, and upload cancellation. Confirm hidden/outgoing panes do not write measured heights; exercise text growth after returning to a previously hidden pane.
9. Manually exercise the same deferral, cancellation, recovery, and animation contracts in Library. Do not add, modify, restore, or run Library tests.

## Verification and completion

1. Use the confirmed Nx targets, preserving their dependencies and caching. Build the shared package first so Studio consumes the new subpath, then run scoped checks:

   ```sh
   # 1 — Verify the package entry and generated declaration are emitted.
   pnpm nx run @qrk.sh/library:build
   # 2 — Let one graph schedule the apps' shared checking dependencies.
   pnpm nx run-many --targets=tsc,lint --projects=@qrk.sh/studio,@qrk.sh/library
   # 3 — Run only the affected Studio browser suites, across configured browsers.
   pnpm nx run @qrk.sh/studio:test:e2e -- 'Drawers.playwright.spec.ts' 'Grid.playwright.spec.ts' 'TextEditing.playwright.spec.ts'
   ```

2. Studio's Playwright configuration can build/start its production server, or use a verified existing server through its configured environment variables. Use actual Next/Vite readiness signals and an authenticated editor fixture. The existing suites contain e2e route defaults; reuse the configured editor route/storage state and align the affected suites where necessary. Do not claim success from a login page or unrelated shell tests, reset user storage, or repair unrelated auth/runtime failures.
3. Confirm the new JavaScript and declaration export resolves in Studio, check changed-file formatting and whitespace, and record results and blockers here. Run no Library test targets and no unrelated whole-repository quality pass.
4. Its source spec was archived after this plan was written. Outstanding verification was transferred to [TODOs](../../../TODOS.md) when this implemented plan was archived at user direction. No code changes or test execution were part of authoring this document.

## Verification record

1. Planning only: reviewed current viewport, animation, gesture, consumer, and browser-test seams; confirmed Nx target names and dependencies.
2. Implemented the shared viewport state, gesture ordering and cleanup, fixed-width pane export, four stable Studio walls, consumer migration, browser-suite updates, and README changes.
3. `pnpm nx run @qrk.sh/library:build` passed. `dist/WallBreakpointPane.js` and `dist/lib/WallBreakpointPane.d.ts` were emitted. `pnpm nx run-many --targets=tsc,lint --projects=@qrk.sh/studio,@qrk.sh/library` passed. `git diff --check` passed.
4. Attempted the three affected Studio Playwright suites across configured browsers. The production server started, but editor routes rendered the public QRK shell instead of the authenticated fixture; stopped after the initial failures. A separate check in the existing Chrome profile reached the editor route but returned `user-session-token-invalid` (401). No editor behavior was verified by those runs. Do not treat the browser suites as passing until a valid editor fixture/session is available.
5. In the running Library app, manually confirmed four mounted walls, fixed 360/720/1080/1440px widths, md selection fallback to sm at 600px, the insufficient-width message at 320px, and md restoration at 850px. Gesture cancellation, drop, resize, scroll, and animation contracts still need manual verification. No Library tests were run.
