# Studio article drag handle

## Goal

Add Tiptap's React drag handle to Studio's article editor for top-level blocks only.

## Ordered implementation

1. Install `@tiptap/extension-drag-handle-react`, `@tiptap/extension-drag-handle`, `@tiptap/extension-node-range`, and `@tiptap/extension-collaboration` at `3.31.3`, plus their required Yjs peers. Update the pnpm lockfile. Collaboration remains unconfigured.
2. Render the handle beside `EditorContent` in `Article.tsx`, after its editor-readiness guard. Use the existing `GripVertical` icon dependency, default left-start positioning, and the article gutter. The React component registers and cleans up its plugin.

   ```tsx
   // Top-level targeting moves a whole list or blockquote.
   <DragHandle editor={editor} nested={false}>
     <div
       title="Drag block"
       aria-label="Drag block"
       className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
     >
       <GripVertical className="size-4" aria-hidden="true" />
     </div>
   </DragHandle>
   <EditorContent editor={editor} />
   ```

3. Retain the document schema and update flow. Editor transactions persist reordered article JSON through the existing `onUpdate` callback.

   ```text
   Before: heading -> paragraph A -> paragraph B
   After:  heading -> paragraph B -> paragraph A
   // Ordinary editor history and autosave also cover the move.
   ```

4. Document the behavior in Studio's README. Archive this plan only after implementation and verification.

## Verification

1. Run Studio typechecking and lint through Nx; report unrelated failures without expanding scope.
2. Manually check hover visibility, dragging, drop indication, undo/redo, and saved order after reload.
3. Check whole-list moves and preservation of image size/alignment.
4. Check schema validity for drops around the required first heading.
5. Check narrow-width gutter visibility, scrolling, and editor remount cleanup.

## Boundaries

Studio article only. Preserve native schema-constrained drop behavior. No new public APIs, named types, wrappers, document fields, menus, or keyboard-reordering feature. No changes or tests in `apps/library`.

## Verification results

1. `pnpm nx run-many -t typecheck lint -p @qrk.sh/studio` passed, including its 18 dependency tasks. Scoped formatting and `git diff --check` passed. No library tests were written or run.
2. Live Chrome verification passed on the local Studio article: hover reveals the grip; paragraph dragging changes order; the block drop indicator appears; undo and redo restore/reapply the move; the reordered content survives reload.
3. Hovering the second list item targets and moves the whole two-item list. Moving a centered image preserves its 64-pixel width, container style, and wrapper style. An attempted paragraph drop above the required heading leaves the valid document unchanged.
4. At a 390-by-700 viewport the grip stays inside the left gutter and aligns with the hovered block after scrolling. The viewport was reset afterward. Leaving the editor removes the handle; reopening mounts exactly one. Temporary verification content was restored to the original heading and paragraph and confirmed after reload and reopening.
5. Dependency installation initially rewrote unrelated lockfile resolutions. Only the seven Studio dependency additions and nine new package/snapshot entries were retained; a YAML comparison verified prior importers and resolutions were preserved and every new snapshot dependency resolves.
6. A frozen-lockfile check is blocked by an existing mismatch between `vendor/zerospin/packages/production-worker/package.json` and its lockfile importer: the lock still lists `@cloudflare/vitest-plugin`, `@zerospin/dev-worker`, and `vitest`, which are absent from the committed manifest. That unrelated mismatch remains unchanged.
