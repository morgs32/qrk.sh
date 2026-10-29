# Plan 043: Stack selection and name editor

Status: Complete

## Agreed behavior

1. Clicking the keyboard-accessible name button in StackAction opens Stack Details
   in the existing drawer and replaces Brick selection. The URL owns selection.
2. A selected Stack has a persistent blue outline and a visible name tab. Active
   remains DOM focus; selecting a Stack does not create a second focus state.
3. Edit only the named Stack in the current breakpoint's Wall. Stack names and
   identities remain independent across breakpoints.
4. Save trims whitespace, refuses blank names, and keeps the drawer open. Save is
   disabled when the trimmed draft equals the saved name. Cancel restores the
   saved name without closing. Re-selecting the same Stack preserves its draft.
5. Switching breakpoints closes Stack Details and discards the draft. Ordinary
   drawer navigation also discards it. Back/Forward and reload restore selection
   from the route; missing or mismatched Stack IDs show Stack not found.

## Implementation

1. Add the drawer route `/…/page/$pageId/stack/$stackId?breakpoint=…` and a concrete
   StackDetails component. Query the Wall through the existing Page/Site scope.
2. Pass optional selectedStackId and onEditStack from PagePreview to WallEditor.
   Keep StackAction presentation-only. Apply selection paint without changing
   layout, focus, or drag geometry.
3. Add renameStack@1 with wallId, stackId, and name. Check user ownership, current
   Stack membership, and the trimmed nonempty name. Update only the embedded
   Stack name from the latest Wall layout, retaining IDs, Rows, and Placements.

   ```ts
   // An explicit Wall prevents renaming a similarly positioned Stack elsewhere.
   { wallId, stackId, name: draftName.trim() }
   ```

4. Register web actor V4, user owner V4, and matching browser bindings together.
   Retain V3 for history. Models stay unchanged; add no payload adapters and
   perform no storage resets.
5. Leave the Stack route on breakpoint-toolbar navigation. Other drawers retain
   their existing breakpoint navigation behavior.

## Planned files

Legend: `+` create; `~` modify.

```text
qrk.sh/
  apps/app/
    routes/
      + $username.site.$siteId.page.$pageId._drawer.stack.$stackId.tsx
    ~ routeTree.gen.ts                        # generated
    app/[username]/site/[siteId]/
      ~ Toolbars/BreakpointsToolbar.tsx
      ~ Toolbars/Toolbars.tsx                  # show controls on the Stack route
      page/[pageId]/
        ~ PagePreview.tsx
        ~ (drawer)/DrawerHeader.tsx
        + StackDetails/StackDetails.tsx
    modules/
      ~ README.md
      ~ components/StackAction.tsx
      ~ lib/wall/WallEditor.tsx
    ~ components/WallEditor.stories.tsx
    ~ zerospin/userSessionDefinition.ts
  apps/zerospin/
    src/
      ~ system.ts
      aggregates/user/
        + UserV4.ts
        + actors/userActorV4.ts
        + contracts/wall/RenameStackContractV1.ts
    + test/stackName.spec.ts
  wiki/
    + plans/043-plan-stack-name-editor.md
    ~ glossary.md
    ~ brick-layout-conventions.md
```

## Verification and completion

1. Use command-created fixtures with the actual System harness for successful
   rename and blank/missing/wrong-Wall rejection. Assert layout contents and
   other Walls remain unchanged.
2. Extend the existing Wall Editor story for selection, persistent feedback,
   Save, and Cancel. Verify the live editor's rename/reload, Brick/Stack switching,
   same-Stack draft retention, and breakpoint draft discard.
3. Run scoped formatting, backend tests, and the app build through Nx.
4. Reconcile Selected Stack, Selected Brick, and Active in the glossary and
   document the implemented behavior. No ADR is warranted for this reversible
   interaction. Archive this plan after all required verification passes.
5. Preserve unrelated WIP. Contents browsing, movement, deletion, and shared
   cross-breakpoint Stack identity remain outside this change.

## Outcome

1. Implemented the route-owned name editor, persistent Stack feedback,
   renameStack@1, V4 bindings, and retained V3 declarations without a storage reset.
2. The backend Nx target passed all 13 tests, including the new command's success
   and refusal cases. The app build and scoped formatting passed.
3. The Stack Name Editor story completed selection, persistent feedback, trimmed
   Save, unchanged-name disabling, same-Stack draft retention, and Cancel.
4. The live editor retained the trimmed name after reload. Brick/Stack selection
   switched correctly; changing lg to md closed the drawer and discarded the
   draft, and Back restored the saved lg name. The md Stack name was unchanged.
5. Published the ready-for-review [PR 36](https://github.com/morgs32/qrk.sh/pull/36).

## Remaining work

None.
