# Remove Compose from Studio

**Date:** 2026-09-29
**Status:** Implemented; live browser verification pending

Remove the Compose feature completely: its bottom-toolbar button, `/compose` URL and route, right-hand drawer, feature components, draft state, and styles. Interpret “root” in the browser comment as the Compose route. The main article editor and brick grid remain, along with Add bricks, Set breakpoints, Page settings, and Site settings.

## Implementation

1. Remove the entry point in `apps/studio/app/[username]/site/[siteId]/Toolbars/SiteToolbar.tsx`.
   Delete the Compose `ToolbarButton`, the now-unused `Type` icon import, and one adjacent separator. Preserve one separator between Leave and Add bricks.

   Annotated resulting toolbar order:

   ```text
   Leave | Add bricks | Set breakpoints | Page settings | Site settings
         ^ One separator remains where Compose previously appeared.
   ```

2. Remove the complete pathless `RightDrawerLayout` branch from `apps/studio/app/routes.ts`, including its `compose` child. Delete these exclusively owned files:

   - `apps/studio/app/routes/ComposeRoute.tsx`
   - `apps/studio/app/routes/RightDrawerLayout.tsx`
   - `apps/studio/app/[username]/site/[siteId]/Toolbars/ComposeToolbar.tsx`
   - `apps/studio/app/[username]/site/[siteId]/page/[pageId]/Compose/Compose.tsx`
   - `apps/studio/app/[username]/site/[siteId]/page/[pageId]/Compose/ComposeDrawerTiptap.tsx`
   - `apps/studio/app/[username]/site/[siteId]/page/[pageId]/Compose/ComposeDrawerTiptapBlock.tsx`

   Old `/compose` links should resolve through the existing catch-all to “Page not found.” Add no redirect or replacement route. The generic `Drawers` component derives its group from route handles and needs no change.

   Annotated navigation examples:

   ```text
   /morgs32/site/<siteId>/page/<pageId>
     -> Existing article editor and brick grid, with the shorter toolbar.
   /morgs32/site/<siteId>/page/<pageId>/compose
     -> Existing Page not found screen, including after a refresh.
   /morgs32/site/<siteId>/page/<pageId>/page-settings
     -> Existing bottom drawer; close returns to the editor.
   ```

3. Remove Compose-owned persistence from `apps/studio/app/[username]/site/[siteId]/sitePageDraftStore.ts`.
   Delete `IComposeBlock`, `IPageDraft.composeBlocks`, the corresponding persisted schema and seed field, and all declarations and implementations of `addComposeBlock`, `updateComposeBlock`, and `removeComposeBlock`.

   Keep the existing storage key and version. A version bump would invoke the current migration that resets every owner’s drafts. Keep the page-level excess-property handling so existing stored Compose fields are discarded during decoding while titles, descriptions, page types, and layouts survive. The next normal persistence write omits the removed data; do not clear the shared storage key.

   Annotated intended page shape:

   ```ts
   interface IPageDraft {
     readonly title: string; // Existing page settings survive hydration.
     readonly description: string;
     readonly pageType: "split-scroll" | "shared-scroll";
     readonly layout: ILayout; // Existing grid geometry survives hydration.
     // composeBlocks is removed, together with its actions and seed value.
   }
   ```

   Annotated schema boundary to retain:

   ```ts
   // Retain this annotation on the existing page-draft Schema.Struct.
   // It permits old stored composeBlocks to be stripped without rejecting
   // the rest of a previously saved page draft.
   .annotate({ parseOptions: { onExcessProperty: "ignore" } })
   ```

4. Delete the `.compose-preview` rules in `apps/studio/app/globals.css`. Keep the shared Tiptap implementation and dependencies used by the main article editor. Keep generic drawer support in `apps/web`, and the separate `examples/react-router-motion` demonstration. These are independently used code, not the Studio Compose feature.

5. Update affected Studio checks and documentation.
   In `Drawers/Drawers.playwright.spec.ts`, remove the Compose-specific persistence test and right-drawer navigation segment. Retain existing left/bottom drawer history and identity coverage, and change the post-close toolbar assertion to Add bricks. Include absence of the Compose link and the old URL’s not-found behavior in the focused routing checks. Update `apps/studio/README.md` to describe left and bottom shells and the removed Compose URL; remove the empty-compose-page prerequisite from its browser-test instructions. Do not modify unrelated Library, Studio, or vendor WIP.

## Verification

1. Search active Studio source for Compose route/component names, draft fields/actions, and `.compose-preview`; no feature references should remain outside intentional removal assertions/documentation. `useComposedRef` is an unrelated shared hook and remains.
2. Run `pnpm nx run @qrk.sh/studio:typecheck` and `pnpm nx run @qrk.sh/studio:lint`. Report unrelated failures without repairing them. Do not write or run Library tests.
3. Use the existing authenticated editor session to confirm the toolbar order, main text editor, brick grid, remaining drawers, and Back/Forward behavior. Visit the old `/compose` URL and refresh to verify the existing not-found screen.
4. Check hydration with an isolated copy of a pre-removal draft containing `composeBlocks`. Confirm other draft fields survive and decoded state omits Compose data; confirm a subsequent write omits it from persistence. Do not clear or overwrite the user's live drafts for this check.
5. Run the focused Studio drawer Playwright file when its existing authenticated test prerequisites are available, using the configured Nx target and an isolated test page. If authentication or stale unrelated assertions block execution, report that limitation and the manual results without claiming the suite passed.
6. Review the final diff for scoped deletions and preservation of pre-existing WIP. Archive this plan only after implementation and verification are complete.

## Implementation check

1. Studio typechecking and lint passed on 2026-09-29.
2. An isolated rehydration of a version 3 draft with `composeBlocks` retained its title, description, and layout, stripped the Compose field, and omitted it on the next persistence write.
3. The open editor showed the five remaining toolbar links and its article and brick grid after the source change. Further live navigation was blocked by a Vite import overlay for `ZerospinRouteErrorBoundary.css` while Nx rebuilt that vendor package. The CSS file was restored by the build, but the running dev server still showed the overlay after reload. The authenticated Playwright storage-state prerequisite is not set in this shell.
4. The plan stays active until the old `/compose` URL and remaining drawers are checked in the live browser or authenticated Playwright run.
