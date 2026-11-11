# 062 — Brick-owned click and focus

**Status:** Implemented on `main`. Manual Studio verification pending.

Studio currently makes every placed Brick a click-to-edit surface through
`WallPlacement`. It also interprets an inline editor's `onFocus` callback
as a request to open Brick Details. Move click and focus decisions into the
Brick's React view. Studio supplies `openDetails()` through context and
owns the existing route transition. This adds zero module props.

[Plan 061](061-plan-sidebar-only-workspace.md) governs the sidebar layout.
This plan supersedes its inline-focus navigation behavior at every viewport
width. A click into an Article field edits the Article in place on desktop,
tablet, and mobile.

## Implementation

1. Define `BrickDetailsContext` and `BrickDetailsTrigger` in
   `apps/bricks/src/react/BrickDetailsTrigger.tsx`. Export that file directly
   through the Bricks package. The context holds a zero-argument action or
   `null`. In `WallEditor`, provide the action around the Brick's rendered
   content, bound to its ID through the existing `onEditBrick` callback.
   Catalog and published renders have no provider. Keep navigation in
   `PagePreview`, including its selected-Brick guard and breakpoint search.

   ```tsx
   // The package owns the contract. Studio supplies the placement-specific action.
   export const BrickDetailsContext = createContext<(() => void) | null>(null);

   // WallEditor, inside the existing placement render.
   <BrickDetailsContext.Provider value={() => onEditBrick(brick.id)}>
     {content}
   </BrickDetailsContext.Provider>
   ```

2. Move `WallPlacement`'s click and keyboard activation behavior into
   `BrickDetailsTrigger`. In Studio, the trigger renders a focusable surface
   with the module's accessible label and Enter/Space shortcuts. It honors the
   existing guards for modified clicks, prevented events, nested interactive
   elements, portal events, and active text selection. Keyboard activation
   runs only when the surface itself has focus. With no context action, return
   the children directly, with no extra DOM or tab stop.

3. Opt in explicitly in each current sidebar-form Brick's view definition.
   Cover Figma Thumbnail, GitHub Activity, GitHub Profile, GitHub Repo,
   Image, Instagram, Link, Map Place, and Swatch and Icon. Compose the trigger
   around each module's existing `Render` so configured content, placeholders,
   and empty states all offer the same edit path. Keep the shared view factory
   free of a new configuration option or default click policy.

   ```tsx
   // In githubRepoView.tsx, build the existing view as githubRepo.
   export const githubRepoView = {
     ...githubRepo,
     Render(props: Parameters<typeof githubRepo.Render>[0]) {
       const { state, spec, variantId } = props;
       return (
         // This module chooses the whole rendered card as its edit surface.
         <BrickDetailsTrigger label="Edit GitHub Repo">
           <githubRepo.Render state={state} spec={spec} variantId={variantId} />
         </BrickDetailsTrigger>
       );
     },
   };
   ```

4. Remove `onEditBrick` and the blanket activation handlers, focusability,
   and edit ARIA attributes from `WallPlacement`. Keep its layout,
   selection styling, actions menu, drag grip, and delete confirmation wiring.
   Remove the sidebar-related `onFocus` prop from the inline-editor type,
   factory adapter, Article editor, and call sites. Remove WallEditor's
   inline-focus source argument and PagePreview's source-specific viewport
   check. Preserve Article editing, save and flush wiring, and the catalog
   drop's existing navigation to the newly added Brick.

5. Update the active App editing docs and the glossary's **Selected Brick**
   entry to reflect module-owned interactions. Cross-link the implemented
   behavior from Plan 061's focus section if that plan is still active.
   Update affected Storybook fixtures to exercise the module-owned surface,
   especially the placement activation and Article editor stories.

## Planned files

`+` creates a file. `~` modifies a file.

```text
qrk.sh/
├── apps/
│   ├── app/
│   │   ├── ~ app/[username]/site/[siteId]/page/[pageId]/PagePreview.tsx
│   │   ├── components/WallEditor/
│   │   │   ├── ~ WallEditor.tsx
│   │   │   ├── ~ WallPlacement.tsx
│   │   │   └── ~ Scripted/ (affected placement and presentation stories)
│   │   └── modules/
│   │       ├── ~ README.md
│   │       └── ~ link/linkView.tsx
│   └── bricks/
│       ├── ~ package.json
│       └── src/
│           ├── react/
│           │   ├── + BrickDetailsTrigger.tsx
│           │   ├── ~ makeModuleView.tsx
│           │   └── ~ types.ts
│           ├── article/react/
│           │   ├── ~ ArticleEditor.tsx
│           │   └── ~ ArticleEditor.stories.tsx
│           └── ~ sidebar-form modules' React view definitions
└── wiki/
    ├── ~ glossary.md
    └── plans/
        ├── ~ 061-plan-sidebar-only-workspace.md (if active)
        └── + 062-plan-brick-owned-interactions.md
```

## Verification

1. Run `pnpm nx run @qrk.sh/app:build`, the App and Bricks
   `build-storybook` targets, and `git diff --check`.
2. Verify configured, placeholder, and empty card surfaces open their own
   Brick Details with click and Enter/Space. Test nested links and controls,
   text selection, and a click originating in a portaled menu. Verify only
   deliberate activation opens details, with the correct Brick ID.
3. Verify Article focus and typing leave a closed sidebar closed at desktop
   and mobile widths. Confirm autosave and draft flushing. Verify drag,
   delete, and catalog insertion still work. Check that published and catalog
   cards have no Studio edit surface or added tab stop.
4. Follow the day's recorded manual verification owner and keep this plan
   active until the required checks are complete.

## Results

1. The App production build and App and Bricks Storybook builds passed
   through Nx. The App build used an authorized temporary loopback listener
   for prerendering. The built Storybook indexes include the updated
   placement and Article stories. `git diff --check` passed.
2. Bricks TypeScript passed. App TypeScript reports the existing
   `WallPlacement` menu-trigger ref mismatch. The ref is typed as
   `HTMLElement` and Base UI requires `HTMLButtonElement`.

**Remaining work:** The user performs the Studio checks in steps 2 and 3.
Record the result before archiving this plan.
