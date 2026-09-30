# 015 — Text brick HTML display

**Date:** 2026-09-30  
**Status:** Implemented and archived at user direction; remaining manual checks are tracked in [TODOs](../../../TODOS.md#text-brick-html-display).

## Behavior and decisions

1. `TextBrickContent` always renders HTML generated from committed Tiptap JSON. It never mounts `TextEditorControl`.
2. Library retains drawer-based Text editing. Studio's inline-edit action and wiring are removed without adding a replacement editor; ordinary brick-detail navigation remains available.
3. JSON remains the persisted source. HTML generation runs in the browser using the installed `@tiptap/core` serializer. There are no new dependencies, persisted fields, wrapper abstractions, or named types.
4. Automatic height measurement, grid rounding, batching, gesture handling, and collision resolution retain their existing behavior.

## Implementation

1. **Generate display HTML.** [TextBrickContent](../../../apps/library/modules/text/TextBrickContent.tsx) uses `generateHTML` with the editor's schema-bearing extensions, including the local horizontal rule, image, tasks, alignment, and marks. A browser effect handles DOM-dependent serialization; server and initial client markup match. Null content normalizes to an empty paragraph. Generation errors are stored and thrown during render to the existing error boundary.
2. **Preserve presentation.** Retain the surface/document/typography classes. The image extension's serializer emits `containerstyle` rather than applying its saved width, so the generated image receives the saved pixel width and a constrained container, matching the previous read-only node view. Task checkboxes are disabled. Only generated HTML is inserted.

   ```tsx
   // 1 — Display serialized HTML unconditionally; never create an editor here.
   // 2 — Reuse the existing typography, spacing, and minimum-height rules.
   <div
     aria-label="Text content"
     className="tiptap ProseMirror qrk-text-editor readonly"
     dangerouslySetInnerHTML={{ __html: rendered && "html" in rendered ? rendered.html : "" }}
   />
   ```

3. **Measure rendered content.** Observe the HTML document's border box after generation. Match the serialized source before observing so an initial empty shell or stale render cannot trigger a temporary shrink. Preserve visibility guards, active-pane gating, measurement epochs, current callback references, and observer cleanup. Later image loads and width changes use the same observer.

   ```text
   1 — Edit a drawer draft: committed HTML and grid geometry stay unchanged.
   2 — Save: generate the committed document's HTML and update the display.
   3 — Measure: round its actual height into grid rows through the existing wall callback.
   4 — Switch panes: only the active pane writes automatic geometry.
   ```

4. **Remove inline editing.** Studio no longer owns pending/active Text state, inline activation callbacks, or inline uploads. `BrickWall` no longer accepts those capabilities or disables gestures for an inline editor. The existing `TextBrickEditingContext` retains only `isActive`, `measurementEpoch`, and `onNaturalHeight`; it is not replaced by a new abstraction.
5. **Keep controls host-specific.** `BrickWall.showTextEditAction?: boolean` defaults to true. Studio passes false; Library's **Edit text** button still opens its drawer. Double-click uses ordinary `onBrickActivate` navigation.
6. **Keep the drawer editor.** [TextEditorControl](../../../apps/library/modules/text/TextEditorControl.tsx) requires its existing drawer configuration. Remove inline staging/retry, floating toolbar, outside-click deactivation, and height observation. Preserve the drawer toolbar, content synchronization, formatting, block dragging, upload callbacks, and image resizing.
7. Update Library's README and the Text component description. Archived plan 014 remains historical; this plan supersedes its read-only-editor and Studio-inline requirements. Preserve unrelated WIP.

## Verification and acceptance

1. Run affected Library/Studio typecheck and lint targets through Nx. Do not create, run, restore, or maintain Library tests. Rebuild Library's exported declarations before checking Studio if its package output is stale.
2. Inspect generated DOM for formatting, lists/tasks, links, alignment, code, horizontal rules, saved image dimensions, escaped literal text, and null/empty content. Confirm no editable wall surface or server/hydration DOM-access error.
3. Exercise drawer draft isolation, Save, Cancel, growth/shrink, image loading, breakpoint changes, inactive panes, and drag/resize completion. Confirm no temporary empty-shell shrink.
4. Verify Studio has no inline editor or Text edit button, and retains ordinary brick-detail navigation and grid interaction.

## Verification record — 2026-09-30

1. Passed `pnpm nx run @qrk.sh/library:build` and `pnpm nx run-many -t tsc lint -p @qrk.sh/library @qrk.sh/studio`, including Library Worker typechecking and required dependencies. The initial typecheck found a DOM `append` typing conflict (changed to `appendChild`) and stale Library declarations in Studio (resolved by rebuilding Library). No tests were created or run.
2. The existing Library app at port 4100 rendered the marked brick as generated paragraph HTML with no `contenteditable` attribute. Direct navigation to the brick-detail route loaded its drawer editor with `contenteditable=true`; no DOM-access or hydration errors appeared.
3. A drawer draft left all four wall displays unchanged. Saving eight paragraphs updated HTML and grew the active 360px pane from seven to nine rows (368.75px natural height), while inactive panes retained their prior geometry. Canceling a later draft restored the committed document in the editor without changing wall HTML.
4. A document entered through the existing State JSON editor rendered heading alignment, bold/italic/underline/strike/highlight, a link, bullet and ordered lists, a checked disabled task, a code block containing escaped `<script>` text, and the custom horizontal rule. A synthetic SVG image loaded at its saved 120px width; generated DOM contained no script element. At 360px the natural height was 576.96875px and the grid height 13 rows. At 720px it remeasured to 552.96875px and seven rows. Inactive panes did not acquire the active pane's new height.
5. Saving null content rendered `<p></p>`, measured 48px, and shrank the active 720px pane to one row. Restored the original document and 360px selection after the checks.
6. Studio initially showed an existing backup-key ownership error; its Reload application action recovered the page. Its Text brick rendered HTML without an Edit text button. Double-click opened its ordinary brick-detail drawer with another HTML preview and no inline editor; closed that drawer afterward.
7. Dragged the Library Text brick one column right and back; its position and height returned to the originals. Browser-driven resize-handle drags had no observable effect, so resize completion remains unverified. Captured `/tmp/qrk-text-html-display.png` after restoring the original document, position, and 360px breakpoint.
8. Remaining manual checks were transferred to [TODOs](../../../TODOS.md#text-brick-html-display) at user direction before archival. Delayed network image loading, collision displacement, and resize completion remain unverified.
