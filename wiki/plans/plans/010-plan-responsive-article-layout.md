# Responsive article layout implementation plan

**Date:** 2026-09-29

**Status:** Superseded by [011 — Inline Text editing](011-plan-text-brick-editing.md); not completed.

**Design:** [`../archived/010-spec-responsive-article-layout.md`](../archived/010-spec-responsive-article-layout.md)

## Goal and boundaries

Make article visibility page-wide, make article placement independently editable at md/lg/xl, and preview the complete page at 360/720/1080/1440px. Resolve brick geometry and brick previews from the wall's measured width. Preserve the page's existing article document, `pageType` scrolling preference, Save/Cancel behavior, wall session, and standalone Library behavior.

Use the existing page model, page settings command, page draft, Studio editor layout, and viewport provider. Add no layout resource, duplicate persisted copy, new package dependency, named type, barrel, or unrelated draft-store consolidation. The app currently uses Compose; do not follow the older removal plan.

## Ordered implementation

1. **Version the page-owned fields and their command path.** Add `PageV2.ts` next to `PageV1.ts` with `upgradeModelVersion` and version `2.0.0`. Add a boolean `articleVisible` whose model default is `true`. Add one page-owned `articlePosition` JSON value with a schema for exactly `md`, `lg`, and `xl`, each `"top"` or `"left"`; use a nullable storage default for historical rows because the JSON primitive does not support an object default. Normalize that historical null to `{ md: "left", lg: "left", xl: "left" }` at page read/draft initialization, and make new page creation write the full object. Do not persist `sm`; it is always Top. Keep `article` and `pageType` on the page without changing their meaning.

   Upgrade `createPage` and `updatePageSettings` in their own V2 files, retaining V1 declarations for historical commands. The current `createPage` payload need not gain user-facing layout fields: the V2 create program writes the defaults. The V2 settings payload carries visibility and all three positions alongside title and description. Its V1-to-V2 adapter marks the two new settings as **unchanged**, and its program omits those attributes when that marker is present; it never translates a historical title update into default layout values. A nullable command-only value can represent unchanged, but no null reaches the page's effective position choices or is persisted as a new setting. Current Studio Save always sends concrete visibility and all three positions. Reuse the V1 ownership guard's checks at the same command boundary and strictly reject invalid non-null position values or extra position keys.

   ```ts
   // Illustrative V1 → V2 adapter: old commands changed only title/description.
   up: Effect.fn("updatePageSettingsV2.up")(function* (props) {
     const { payload } = props;
     return { ...payload, articleVisible: null, articlePosition: null };
   }),

   // Illustrative V2 mutation: null is a command-only "leave unchanged" marker.
   attributes: {
     title: payload.title,
     description: payload.description,
     ...(payload.articleVisible === null ? {} : { articleVisible: payload.articleVisible }),
     ...(payload.articlePosition === null ? {} : { articlePosition: payload.articlePosition }),
   },
   ```

   Add `userActorV2.ts` and `UserV2.ts` with version `2.0.0`; update `system.ts` to register both aggregate versions and `userSessionDefinition.ts` to select the V2 actor, aggregate, model, and contracts. Keep the 1.0.0 aggregate registered for historical data. Version any other page-mutating contract that must emit PageV2 mutations, particularly `updatePageArticle`, without changing its payload or article autosave behavior. Follow the repository's one-versioned-declaration-per-file pattern and exact model identity checks. Recheck all direct PageV1 imports in Studio and backend; switch only current readers and bindings that require the latest page model.

2. **Extend the existing page draft and settings transaction.** In `pageStore.ts`, add visibility and the three position choices to the page draft and direct setters. In `SiteLayout.tsx`, seed those values from the current page row, using the historical default when `articlePosition` is null. Preserve the current rule that an open draft is not reinitialized on title or other live resource updates; reinitialize only for a different page identity. Do not put these settings in `sitePageDraftStore.ts`, which currently owns separate local site/page and grid drafts.

   In `PageSettings.tsx`, include the new fields in the baseline, dirty comparison, Save payload, and Cancel restoration. Keep `article` out of that comparison. Add an accessible **Show article** control. When visible, show a Top/Left control for the selected **page** breakpoint; at sm, display fixed Top with a short explanation. When hidden, hide the position control but keep all three draft choices. Save updates the baseline only after successful command staging; a failed stage keeps the dirty draft. Cancel restores every settings field from the baseline and closes the drawer. A breakpoint click changes only preview selection, never dirty state.

   ```tsx
   // The control edits one draft choice; switching widths preserves the others.
   const pageBreakpoint = activeBreakpoint ?? "sm";
   const position = pageBreakpoint === "sm" ? "top" : pageDraft.articlePosition[pageBreakpoint];
   // At sm, render fixed Top; at md/lg/xl, update only articlePosition[pageBreakpoint].
   ```

3. **Move fixed preview sizing from Grid to the whole composition.** Keep the editor session and wall mounted in `EditorLayout.tsx`. Measure the available width of the complete editor composition there or in `MainColumns.tsx`, and attach the existing `WallViewportProvider`'s `regionRef` at that level. On Page Settings, bricks, and `/breakpoints`, center a composition box with width equal to the active 360/720/1080/1440px page preview. On other routes, use the actual composition width. Resolve the page breakpoint from that box's actual width when fluid. Preserve the selected page preview in the mounted provider while the route changes. If it no longer fits, display the largest fitting preview without erasing the stored selection; when it fits again, restore it. Below 360px, show the insufficient-width state for the complete composition.

   Extend the existing viewport provider only as needed to report a **separate measured wall width and wall breakpoint**; retain its current `activeBreakpoint` meaning for the page preview in Studio and its current behavior for standalone Library. Measure the actual wall region after article placement, then let `Grid.tsx` pass that width and `resolveBreakpoint(wallWidth)` to `BrickWall`. Remove Grid's route-specific fixed-width sizing. Update `Modules.tsx`, `BrickDetail.tsx`, and the module detail route to select brick previews from the wall breakpoint, while the toolbar and Page Settings continue to use the page breakpoint. Keep the wall's DOM/session identity stable across breakpoint and placement changes.

   ```text
   md page preview = 720px     # Provider selection sizes the composition.
   md article position = Left  # Two equal columns leave 360px for the wall.
   measured wall = 360px       # Grid and drawer previews choose sm bricks.

   md article position = Top   # One column gives the wall 720px.
   measured wall = 720px       # Grid and drawer previews choose md bricks.
   ```

4. **Render each article layout without replacing the wall.** Update `MainColumns.tsx` to read the current page's draft visibility and positions. Keep one stable composition tree containing one `Article` and one `Grid`; change CSS layout and scroll classes instead of switching between branches that recreate either component. Left keeps the existing equal columns and honors `split-scroll` versus `shared-scroll`. Top stacks article then wall in one vertical scroll flow. Article-off displays one full-width wall region. Preserve the correct brick scroll root for dragging in each layout. Hiding the article must not write `page.article`, reset its editor state, or unmount the wall. Check that any hidden article editor cannot be entered or interacted with until restored.

5. **Place controls and guard Compose.** Update `Toolbars.tsx` and `BreakpointsToolbar.tsx` so the breakpoint-only toolbar appears over the complete composition on Page Settings and bricks routes, 1.5rem above the open drawer. Keep existing labels, width tooltips, selected and disabled states, reduced-motion behavior, and the `/breakpoints` close action. Site Settings and Compose retain their current toolbar behavior. In `SiteToolbar.tsx`, omit Compose when the effective article visibility is off. In the persistent editor route/layout, redirect direct `/compose` navigation to the base page when visibility is off, before enabling article editing; do not issue a settings or article command. Re-enabling the article restores Compose. Do not change the article toolbar or autosave path otherwise.

6. **Update source-facing documentation.** Revise `apps/studio/README.md` to describe whole-page previews, distinct wall brick breakpoints, Page Settings controls, article-off Compose behavior, and the retained scrolling modes. Keep standalone Library documentation unchanged unless its public provider API documentation needs a narrow update.

## Verification and completion gates

1. Extend `apps/zerospin/src/siteContracts.workerd.spec.ts` for PageV2 defaults, newly saved settings, invalid or extra position values, and ownership rejection. Replay a V1 `createPage` and a V1 title/description `updatePageSettings` against the current aggregate; assert the latter leaves previously chosen layout fields intact and article content unchanged. Verify a historical page row with null position reads as all Left. Run `pnpm nx run @qrk.sh/zerospin:test:workerd` after the backend changes.
2. Extend the existing authenticated Studio checks in `Drawers.playwright.spec.ts` and `MainColumns.playwright.spec.ts` for Page Settings visibility, per-breakpoint draft choices, fixed sm Top, Save/Cancel, persisted reload, toolbar placement, narrow fit and recovery, reduced motion, and direct `/compose` routing. Assert the 720px Left wall uses sm geometry and the 720px Top wall uses md geometry; inspect the wall breakpoint or brick dimensions, not only toolbar `aria-pressed`. Check one wider Left case and article-off full-width behavior.
3. Reuse the existing stable-identity assertions in the drawer/grid checks for width and position changes. Confirm `Grid`, `BrickWall`, and the library session remain mounted; article document and choices survive off/on and reload. Verify brick catalog/detail previews follow the measured wall width on every bricks route.
4. Run affected Nx `tsc`/`typecheck` and `lint` targets for Studio and Zerospin, plus scoped formatting and `git diff --check`. Use `pnpm nx show project <project> --json` to confirm target names before execution. Do not write, run, restore, or maintain Library tests. If the viewport provider changes, run permitted Library typechecking/lint and manual standalone checks only. Report unrelated failures without expanding the change.
5. Keep this plan active until implementation and verification are complete; archive it only after the gates above pass. Record any blocked live browser check precisely instead of claiming it passed.

## Verification record

- Backend workerd checks: 3 files, 19 tests passed, including V2 defaults, saved positions, V1 command decoding, invalid positions, and ownership rejection.
- Studio build and typecheck, backend typecheck, Library typecheck, affected lint, scoped formatting, and `git diff --check` passed. No Library tests were run.
- Authenticated browser checks remain pending. The local Studio page reached `node-offline-identity-missing` in Chrome; this environment has no `PLAYWRIGHT_STORAGE_STATE` or `PLAYWRIGHT_EDITOR_PATH` configured. The plan stays active until the browser cases can run against a working identity and backend.

## Explicit non-goals

No adjustable column ratio, article-right or article-bottom placement, visibility per breakpoint, new article editing feature, article content migration, scrolling preference change, brick placement algorithm change, or standalone Library redesign. Preserve unrelated in-progress work.
