# Library drawer Text editing design

**Date:** 2026-09-30  
**Status:** Approved for planning

## Problem Statement

Library currently edits placed Text bricks directly on the wall. Edits stage immediately, while the brick-detail drawer offers a separate raw JSON state editor. Library needs deliberate editing in that drawer, with independent Text and JSON drafts and explicit Save/Cancel controls. Draft changes must not alter the wall before Save. Studio's existing inline editing remains available.

## Solution

1. Add an optional module `Form` contract and use Text's form in the Library brick-detail drawer. Keep the Text editor's inline configuration for Studio.
2. Give Text and Shared state JSON separate root sections in `OrderedOutline`, separate drafts, and separate Save/Cancel controls. Each successful Save commits that section's complete state and leaves the drawer open. Closing the drawer discards unsaved drafts.
3. Keep wall measurement after committed state changes, so saved Text still changes natural height and collision layout without allowing drawer drafts to change wall geometry.

## User Stories

1. As a Library user, I can double-click a Text brick or choose **Edit text** to open its brick-detail drawer, including when that route is already selected.
2. As a Library user, I can format, undo, redo, drag blocks, resize images, and upload images in the Text section while the wall continues to show committed content.
3. As a Library user, I can edit raw state JSON in its own section without changing an unsaved Text draft, and I can edit Text without rewriting an unsaved JSON draft.
4. As a Library user, I can save or cancel either section without closing the drawer or discarding the other section's draft.
5. As a Library user, I see invalid JSON and its error until I correct or cancel it; it cannot be saved.
6. As a Library user, closing the drawer, navigating away, or deleting the brick immediately ends editing and discards unsaved drafts. Switching breakpoint retains them because Text content is shared across breakpoints.
7. As a Studio user, I retain inline Text activation, immediate staging, and the current toolbar, upload, and wall-height behavior.

## Implementation Decisions

1. `makeModuleView` accepts an optional top-level `form`. Its props include `state` and `onChange` inferred from the module's `stateShape`, plus the existing `uploadImage` and `onError` capabilities. Expose optional `Form` on the returned module and existing `IModule` interface. Decode unknown registry state before calling the typed form, following the existing authored-renderer pattern. Add no named types, dependencies, or general editing framework.
2. Register Text's form using the host draft callback, without staging from the form:

   ```tsx
   form(props) {
     const { state, onChange, uploadImage, onError } = props;
     return (
       <TextEditorControl
         value={state.content}
         drawer={{
           // 1 — Replace only the Text section's draft.
           // 2 — The route stages this complete state when Text Save is pressed.
           onChange: (content) => onChange({ ...state, content }),
           uploadImage,
           onError,
         }}
       />
     );
   }
   ```

3. Drawer mode places the toolbar above the document and has no outside-click deactivation or natural-height reporting. Preserve formatting, selection, undo/redo, block dragging, image resizing, upload validation, and progress. Inline mode retains Studio's current control behavior and defaults. Opening an empty document or editor normalization does not mark the Text draft dirty.
4. In brick detail, order the root sections as Text, Generate spec, Options, Shared state JSON, and Brick Definition. Show Text first only when the module has `Form`; otherwise retain the module's existing UI. Generate spec, visibility, and Brick Definition continue to operate independently against committed data.
5. Initialize each draft from current committed state. Text edits change only the Text draft; JSON keystrokes change only the JSON draft. A clean section follows committed-state changes. A dirty section survives committed-state echoes and another section's Save. Cancel resets only that section to the latest committed state and clears its error. Text Cancel also ends its uploads and disposes of canceled editor history.
6. Each Save stages one `updateBrickState` command with that section's complete state. A successful stage clears that section's draft/error and keeps the drawer open. A failure keeps its draft and reports an error in that section; it does not automatically retry. Disable Save when that section's candidate state equals committed state. JSON formatting differences alone are unchanged.
7. Parse and validate JSON against the module's state schema and existing decoding rules before Save. Invalid syntax or schema-incompatible state remains visible with an error and blocks only JSON Save. Active uploads block only Text Save. JSON Save remains available while Text uploads run.
8. Both sections replace the same complete state, so when both drafts are dirty, the last successful Save wins. Preserve the other dirty draft after a Save; a later Save of that draft replaces the intervening committed state. Refresh only clean sections from the new committed state.

   ```text
   1 — Both sections start at committed state A.
   2 — Text changes to B; JSON independently changes to C.
   3 — Text Save stages B; the JSON draft remains C.
   4 — JSON Save stages C; the now-clean Text section follows C.
   ```

9. Both Library activation paths open `/bricks/$brickId` and explicitly reopen the drawer for its current route. Library does not activate editing on the wall. Preserve wall measurement capabilities for committed changes: drafts cannot affect content or geometry, while saved content remeasures and resolves collisions. Inactive and outgoing panes cannot write heights.
10. Key drafts and editor lifetime by brick identity, not breakpoint. Switching breakpoint preserves drafts, editor state, and uploads. Drawer close immediately discards both drafts, disposes of the editor, aborts uploads, and navigates to the base Library route. Route changes and brick deletion perform the same cleanup. Do not wait for the drawer's exit animation. Escape dismisses an open editor popover first; otherwise it closes and cancels drawer editing. Clicking the wall alone does not cancel it.
11. Keep Library's `/upload` endpoint and existing PNG/JPEG/WebP/SVG validation, 5 MiB limit, progress, and cancellation. Abort or disposal prevents late insertion; completed uploaded assets are not deleted. Preserve existing breakpoint/drawer work and shared component defaults used by Studio.

## Testing Decisions

1. Use Library's brick-detail route and mounted wall as the manual acceptance seam. Verify double-click and **Edit text**, current-route reopening, independent drafts, clean-section refresh, dirty-section preservation, last-Save-wins behavior, invalid JSON, unchanged Save, successful Save, failed Save, and section Cancel.
2. Verify formatting, selection, undo/redo, block dragging, image resizing, empty-document normalization, Escape/popovers, close/reopen, navigation, deletion, and breakpoint switching.
3. Verify upload validation/progress, Text Save disabling during uploads, independent JSON Save, cancellation and late completion, and uploads continuing through breakpoint changes.
4. Confirm draft editing does not change wall content or geometry, saved content remeasures correctly, inactive panes do not write heights, and Studio's inline editor remains available.
5. Run Library's Nx `tsc` and `lint` targets. Do not create, modify, restore, or run Library tests. Record manual results and blockers without claiming prior inline checks verify the drawer.
6. During implementation, update the Library README and revise plan 011 in place with annotated examples distinguishing Library drawer editing from Studio inline editing. Preserve plan 011's historical verification record.

## Out of Scope

1. Server-side wall Save, a draft merge or stale-save protocol, new storage or synchronization, and schema migrations.
2. Changing Studio's inline editing behavior or Library's independent Generate spec and visibility actions.
3. Deleting uploaded assets when a draft is canceled.
