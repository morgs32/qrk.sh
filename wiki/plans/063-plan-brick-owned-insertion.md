# 063 — Brick-owned insertion behavior

**Status:** Implemented on `main`. Manual Studio verification pending.

After a successful catalog drop, the placed Brick chooses what happens next.
Article focuses its title, Image opens its existing sidebar form, and Swatch
and Icon simply appears. An open sidebar stays where it is unless the inserted
Brick opens its own details. Add zero module props.

[Plan 062](062-plan-brick-owned-interactions.md) gives Brick views control over
click and focus. This plan replaces the unconditional sidebar navigation that
Plan 062 kept after a catalog drop.

## Implementation

1. Add `useAfterBrickInserted.ts` under `apps/bricks/src/modules/react` and expose it
   through a direct package subpath. The file defines the placement-scoped
   context and the hook. The hook calls the context function from a layout
   effect, after the Brick's DOM and refs are available. It takes an action
   with no arguments. Without an insertion signal, the effect does nothing.

   ```tsx
   export const BrickInsertionContext = createContext<
     ((action: () => void) => void) | null
   >(null);

   export function useAfterBrickInserted(action: () => void) {
     const runAfterInsert = useContext(BrickInsertionContext);

     useLayoutEffect(() => {
       runAfterInsert?.(action);
     }, [runAfterInsert, action]);
   }
   ```

2. In `WallEditor`, replace `onEditBrick(id)` after successful
   `addBrick` staging with one pending insertion for the new Brick ID.
   Supply its callback around only that Brick's placed content, alongside the
   existing Brick Details provider. Each insertion can run at most one action.
   The latest successful drop takes precedence if two drops occur before either
   Brick mounts. Retire the pending insertion after the matching placement
   commits, including when the Brick supplies no action. Use a passive Wall
   effect to retire it after the Brick's layout effect has had its chance, and
   clear only the pending insertion the effect observed. Wall unmount discards
   the pending insertion.

   ```tsx
   // After addBrick returns Success, record which placed Brick gets the signal.
   let handled = false;

   setPendingInsertion({
     brickId: id,
     run(action: () => void) {
       if (handled) return;
       // Mark it before running an action that can trigger navigation or render.
       handled = true;
       action();
     },
   });

   // Inside the existing provider for placed Brick content.
   <BrickInsertionContext.Provider
     value={pendingInsertion?.brickId === brick.id ? pendingInsertion.run : null}
   >
     {content}
   </BrickInsertionContext.Provider>
   ```

   Keep the existing drop validation, placement command, and selected-Brick
   route guard. Failed staging, moving an existing Brick, a reload, and
   switching breakpoints supply no insertion signal. Catalog and published
   renders have no insertion provider. Saved state and commands need zero
   migration.

3. In `ArticleEditor`, attach a textarea ref to the existing title and focus
   it after insertion. The editor retains its current draft, save, and flush
   wiring. The Article action does not call `openDetails()`.

   ```tsx
   const titleRef = useRef<HTMLTextAreaElement>(null);

   useAfterBrickInserted(() => {
     titleRef.current?.focus();
   });

   // On the existing title textarea.
   <textarea ref={titleRef} aria-label="Article title" /* existing props */ />
   ```

4. In Image's existing `Render` method, read `openDetails()` from
   `BrickDetailsContext` and use it as the insertion action. Keep the existing
   `BrickDetailsTrigger` for deliberate click and keyboard activation.
   `PagePreview` continues to supply the current breakpoint in the route.

   ```tsx
   const openDetails = useContext(BrickDetailsContext);

   useAfterBrickInserted(() => {
     openDetails?.();
   });

   // Return the existing Image view inside BrickDetailsTrigger.
   ```

5. Swatch and Icon adds no code. Bricks that omit the hook simply appear and
   keep their existing editing surfaces. Describe this default and both opt-in
   examples in the module README. Keep the shared view factory and the
   `Render`, `InlineEditor`, and `Form` contracts as they are.

## Planned files

- Add `apps/bricks/src/modules/react/useAfterBrickInserted.ts` and its package export.
- Update `apps/app/components/WallEditor/WallEditor.tsx`,
  `apps/bricks/src/modules/article/react/ArticleEditor.tsx`, and
  `apps/bricks/src/modules/image/react/imageView.tsx`.
- Update `apps/app/modules/README.md`.

## Verification

1. Run the App build and App and Bricks Storybook builds through Nx, then
   run `git diff --check`.
2. Drop an Article into the Wall with the sidebar closed and with a different
   sidebar panel open. Verify its title gets focus, typing edits the title,
   the sidebar stays as it was, and a save echo does not pull focus back.
3. Drop an Image and verify its own form opens at the current breakpoint.
   Close it and verify an ordinary rerender does not reopen it. Drop a
   Swatch and Icon and verify it appears without opening or changing a panel.
   Click it to verify its existing Details trigger still works.
4. Move the inserted Bricks, switch breakpoints, and reload. Verify none of
   these actions reruns the insertion behavior. Follow the day's recorded
   manual verification owner.

## Results

1. The App production build and both Storybook builds passed in one Nx task
   graph. `git diff --check` and Bricks TypeScript passed.
2. The separate App TypeScript check still reports the existing
   [WallPlacement menu-trigger ref mismatch](../research/wall-brick-delete-focus.md).
   That ref is outside this plan's insertion changes.

**Remaining work:** The user performs the manual Studio checks in steps 2–4.
Record the result before archiving this plan.
