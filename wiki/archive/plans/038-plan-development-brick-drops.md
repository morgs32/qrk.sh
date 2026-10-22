# New-brick drops in the development preview

**Status:** complete and verified, October 21, 2026. QRK changes remain uncommitted.

## Summary and scope

1. Add palette-to-Wall drag and drop to the development preview at `/<username>/site/<siteId>/dev/page/<pageId>/<breakpoint>`. New default-variant Bricks can join a compatible Row, create a Row inside a Stack, or create a Section at the Wall bottom.
2. Existing Bricks remain undraggable. Leave `movePlacement`, production-editor movement, side-Stack creation, and insertion between Sections untouched.
3. Use the existing initialized `UserUI` session and ordinary `addBrick` command. No SQL/model schema changes, command-payload changes, dependencies, storage resets, automatic repair, or upstream Zerospin release.
4. Preserve unrelated WIP and leave changes uncommitted. Existing mixed Rows remain renderable; this slice prevents new incompatible additions through `addBrick` only.
5. On October 21 the user explicitly authorized a bounded exception to the no-upstream-release scope: restore the omitted `findFirstOrThrow` API in a new Zerospin patch release, update QRK, and finish verification. The upstream source/release commit retains the API for future releases; the QRK feature remains uncommitted.
6. The user subsequently authorized simplifying `deleteBrick` to read only affected Placements, ancestors, and siblings. This replaces its whole-Page hierarchy read so the retained verification deletion can finish. Keep the repair in QRK; no further upstream patch is part of this change.

## Agreed behavior

1. Render a compact palette with current module labels, icons, and drag grips. Keep the selected breakpoint's canonical preview width. Drop zones span the Wall's full width. The empty preview fills available vertical space with a 320px minimum; a populated Wall retains a bottom drop zone with a 320px minimum.
2. Choose the destination under the pointer in this order, without searching elsewhere on the Wall:

   | Pointer location | Result |
   | --- | --- |
   | Compatible Row | Append the Placement to that Row |
   | Incompatible Row | Create a Row immediately below it in the same Stack |
   | Blank Stack space | Append a Row to that Stack |
   | Wall bottom | Create a Section containing a Stack and Row |

3. For insertion below a Row, use the next sibling's stable ID as `beforeRowId`; `null` appends. A fixed-height variant can join a Row when none of its contents is variable-height and the combined minimum widths fit the rendered Row. Different fixed heights can share. A variable-height variant can occupy an empty Row but cannot share.
4. Reuse the Section and empty Stack already seeded on a new Page. A truly empty Wall creates all missing parents. Avoid redundant empty containers.
5. Highlight the compatible Row, insertion line below an incompatible Row, or bottom zone using the resolved destination. Recompute the destination from current data and dimensions on drop. Cancelled, foreign-Wall, malformed, or stale drops create nothing.
6. Stage one command per successful drop. Remain on the development page; do not navigate to the production editor or open a Brick form. Local staging Success is optimistic success, not proof of canonical execution.

### Annotated examples

```text
360px Row: [160px Icon] + new 160px Icon
→ Same Row.                              # 1. Combined minimum widths fit.

360px Row: [320px Map] + new 160px Icon
→ New Row immediately below.             # 2. Minimums exceed available width.

Row: [Article] + new Icon
→ New Row immediately below.             # 3. Variable-height content cannot share.

Populated Wall: drop on bottom zone
→ New Section → new Stack → new Row.     # 4. Explicit bottom insertion.
```

## Implementation

1. Move the current `defaultWidth`, `minWidth`, `defaultHeight`, and optional `minHeight` values into shared `makeModuleVersion` variant definitions, preserving every value. React `makeModuleView` retains components, placeholders, and generators and consumes the shared sizing. Remove duplicated sizing declarations; add no persisted Row flags or Article-specific branch.
2. Add shared `canShareRow`, used by the development resolver and `addBrick`. Use inline or inferred shapes, with `props` destructured first:

   ```ts
   // 1. An empty Row accepts either kind of variant.
   if (existingVariants.length === 0) return true;

   // 2. Incoming variable-height content needs its own Row.
   if (incomingVariant.defaultHeight === null) return false;

   // 3. Existing variable-height content also excludes sharing.
   return existingVariants.every(
     (variant) => variant.defaultHeight !== null,
   );
   ```

3. Keep `resolveBrickDrop` in the owning route. Read the current Wall, incoming variant, hovered Row/Stack, and measured Row width; return an existing insertion-target shape or `null`. Keep it free of DOM mutation, ID allocation, navigation, and command submission. Match the behavior table with named local values and early returns. Width fitting remains a browser calculation:

   ```ts
   // 1. Query ordering supplies Placement order.
   const occupiedWidth = existingVariants.reduce(
     (width, variant) => width + variant.minWidth,
     0,
   );

   // 2. Fit is independent of fixed-height differences.
   const fits = occupiedWidth + incomingVariant.minWidth <= rowWidth;
   ```

4. Use the installed Pragmatic Drag and Drop library and palette grip pattern. Register Row, Stack, and bottom-zone targets with one Wall-level monitor. Use the same resolver for feedback and submission. Feedback state must not tear down registrations; dispose on route, breakpoint, or Wall replacement and unmount.
5. After resolving a valid destination, allocate a Brick ID and stage `addBrick` once. Let the live query render the result and use existing session failure presentation.
6. Before recording mutations into an existing Row, `addBrick` reads its Placements and Bricks and applies `canShareRow`. Refuse incompatibility through the existing `invalidLayout` failure without redirecting. Preserve ownership, module limits, stable anchors, atomic parent creation, and all-four-breakpoint behavior. Do not modify `movePlacement`.
7. Reconcile App/module documentation, layout conventions, and the existing glossary with the implementation. Explicitly record that movement enforcement is deferred. Create an ADR only if the implemented decision meets the repository's ADR criteria.
8. Simplify `deleteBrick` bottom-up: remove its Placements; prune affected Rows, Stacks, and Sections only when no children survive; compact the surviving sibling groups. Queries read pre-application state, so explicitly exclude planned removals. Preserve ownership, payloads, atomic recording, unrelated scaffolding, and `movePlacement`.

   ```text
   Row A: [deleted Icon, Link] → [Link at position 0]
   Row B: [deleted Icon] → remove Row B, then prune empty ancestors.
   Unrelated empty Stack C → keep C. # Deletion is not a Wall-wide cleanup.
   ```

### Planned file hierarchy

`+` means new; `~` means modified. Grouped module paths cover the existing concrete definitions and views.

```text
qrk.sh/
  apps/app/
    app/
      ~ globals.css
        # Include the owning development route in Tailwind's explicit sources.
    routes/
      ~ $username.site.$siteId.dev.page.$pageId.$breakpoint.tsx
        # Palette, drop resolver, feedback, and submission.
    modules/
      ~ make/makeModuleView.tsx
      ~ lib/types.ts
      ~ */*View.tsx
        # React views consume shared sizing.
    ~ README.md
    ~ modules/README.md
  apps/zerospin/src/
    modules/
      ~ make/makeModuleVersion.ts
      ~ */*V1.ts
      + lib/canShareRow.ts
    aggregates/user/contracts/wall/
      ~ AddBrickContractV1.ts
      ~ DeleteBrickContractV1.ts
  wiki/
    ~ brick-layout-conventions.md
    ~ glossary.md
    plans/
      + 038-plan-development-brick-drops.md
```

## Verification and completion

1. Manually verify first insertion into a seeded empty Wall and a truly empty Wall; no redundant parents should remain.
2. Verify fixed-width fitting and overflow, different fixed heights sharing, Article insertion, and refusal of additions beside variable-height content.
3. Verify insertion below a middle Row preserves sibling order, blank Stack space appends, and the bottom zone creates the full Section/Stack/Row hierarchy.
4. Verify cancellation, breakpoint replacement during dragging, malformed/foreign/stale destinations, module-limit refusals, and exactly one staged command per successful drop. Existing Bricks must have no drag affordance.
5. Verify ordering after synchronization and reload, including unchanged creation behavior at the other three breakpoint Walls. Distinguish local staging from canonical execution evidence.
6. Use existing build targets and manual application checks only. Add no test suites, fixtures, standalone check gates, or backend integration-test machinery.
7. Keep failed, blocked, unrun, and deferred required checks in Remaining work. Archive this plan only after implementation and required verification are complete.

## Verification evidence

1. `pnpm nx run @qrk.sh/app:build` passed on October 21, 2026, including the rerun after the Tailwind source correction (4.5 seconds). No new dependencies, named interfaces, payload/schema changes, test suites, fixtures on disk, or check runners were added.
2. The existing Zerospin dev target reported `Ready on http://127.0.0.1:8788/ (system spec accepted)`. The authenticated dashboard created a local `Plan 038 verification` Site and Page through the normal UI.
3. The omitted `findFirstOrThrow` implementation was restored in Zerospin `24.0.2`, published as all 19 fixed-group packages, and adopted with exact QRK pins and lockfile resolutions. Upstream commit `5f2ee66d5d9c986443ab89e105bff2afc7d058ce` tracks the API and release. All 18 applicable library builds passed; the published core tarball contains JavaScript and declarations. The authenticated development route now renders.
4. Focused source review covered shared metadata preservation, pre-mutation `addBrick` refusal, Row/Stack priority, cancellation, stale/foreign targets, and feedback-independent registrations. `MovePlacementContractV1.ts` retains SHA-1 `6a012b0fe07c8d3c1ecad04c975bcfffe12eb479` from before this work. No storage was reset, and QRK changes remain uncommitted.
5. Browser drops on the `Plan 038 verification` Page verified seeded Stack reuse; two 160px Icons sharing a 360px Row; width overflow into a new Row; Article insertion; a new Icon below Article; stable insertion below a middle Row; and explicit bottom Section/Stack/Row creation. Canonical commands at aggregate indices 28–34 each finalized Success exactly once. The two middle insertions carried the expected next-sibling `beforeRowId`. Seven Bricks produced exactly 28 Placements across four Walls; the other Walls retained their existing one-new-Row-per-Brick behavior.
6. A second Article produced the existing Page-limit toast without a command or layout mutation. An outside drop created nothing. At `md`, an Icon with 90px fixed height and a Link with 180px fixed height shared the 720px Row; ordered Row identities and Placement counts survived reload. A separate valid Icon drop during keyboard-input simulation was retained as an ordinary successful drop, rather than counted as a cancelled operation. Actual native drag cancellation cleared feedback and produced no command.
7. Manual inspection exposed missing route-only utilities because Tailwind uses an explicit source list. Adding only this development route to that list fixed the sizing and feedback styles. The populated bottom zone now measures 320px minimum and the selected preview width remains unchanged. A held compatible drop showed the Row ring; an incompatible drop showed the insertion line.
8. A temporary stale Row DOM ID caused no highlight or command and was restored immediately. Temporary browser-only palette sources exercised a foreign Wall ID and malformed module data; both drops left the nine-Brick layout unchanged. Their registration and DOM were removed after the checks.
9. An in-app history navigation changed the breakpoint from `sm` to `md` while a palette drag was held. Releasing that old Wall's drag over the new Wall created nothing and cleared feedback. Full-document navigation during a held synthetic drag disconnected browser automation; in-app navigation completed the ownership check without that tooling limitation. `lg` and `xl` rendered all nine Placements in nine Rows at their exact 1080px and 1440px widths.
10. The ordinary production catalog was given an insertion target for the existing Article Row. Adding an Icon returned the existing `invalidLayout` presentation, “Variable-height Bricks require their own Row”, without adding a Brick. This exercises command enforcement independently of the development resolver.
11. A separate `Plan 038 empty Wall` Site/Page was created through the dashboard. After one Icon drop, the user authorized deleting that one verification Brick. The browser optimistically showed zero Sections/Stacks/Rows and a full-width 320px-minimum drop surface, but canonical `deleteBrick` command `cmd_NRsYyuVsmCnQpWYLP3qi-` at aggregate index 83 initially remained pending at materialization head 82. The existing nested actor-scoped Wall read threw `DrizzleQueryError`; the next drop was held until canonical deletion completed.
12. A temporary Workerd debugger observer captured the underlying error: `Expression tree is too large (maximum depth 100): SQLITE_ERROR`. The exact failed SELECT reproduces with desktop SQLite when its expression-depth limit is set to 100. Both materializing the actor CTEs and removing their outer projection wrappers still fail. No speculative query fix was applied. The debugger was restored, disabled, and disconnected after inspection.
13. The authorized `deleteBrick` repair replaces the whole-Page hierarchy query with flat reads of the Brick's Placements, affected ancestors, and sibling groups. Survivor calculations explicitly exclude planned removals before any operations are recorded. Empty `in` filters compile to SQL false in the installed Drizzle. Source review confirmed unrelated empty scaffolding remains untouched and only changed sibling positions are updated. The retained command at index 83 finalized Success under its original ID at `2026-10-21T21:44:11.647Z`, without restaging or a storage reset. Its recorded batch contains exactly 17 deletes: four Placements, four Rows, four Stacks, four Sections, and the approved Brick. All four verification Walls then had zero containers and Placements. The original nine-Brick Page was unchanged.
14. One palette Article drop into that canonically empty `sm` Wall finalized Success as command `cmd_GMI7Dnht2S2uIyqrvD-e_` at aggregate index 93. Brick `brk_3DB9CvkQdBQT7zh9mZIgD` has exactly one Section, Stack, Row, and Placement per breakpoint, all at position zero; there are no orphaned layout records. The new Row/Stack IDs survived browser reload, the bottom zone retained its 320px minimum and 360px selected width, and existing content had no drag affordance.
15. After the deletion change, the existing App build passed in 5.2 seconds. Its first sandboxed attempt could not bind the prerender preview port; rerunning with localhost access passed. The backend reported its accepted-system-spec readiness after reloading the command. `git diff --check` passed, `movePlacement` retained the recorded SHA-1, and affected App/backend/layout/glossary documentation was updated. No additional Zerospin patch, schema/payload change, test suite, standalone check gate, or storage reset was needed.
16. After the user rejected the focused repair's bookkeeping, `deleteBrick` was shortened from 209 to 155 lines. It now walks one Placement's ancestors at a time, excluding the recorded child removal from each sibling read and stopping at the first surviving parent. The existing deterministic Placement IDs and same-Wall movement guarantee independent paths; a read-only canonical inspection found zero duplicate Brick/Wall paths. Both relation reads have one hop. Source review found no correctness issues, formatting and whitespace checks passed, and the existing App build passed in 6.6 seconds. No additional destructive browser deletion was performed for this readability refactor; the canonical deletion and insertion evidence above predates it.

## Remaining work

None.
