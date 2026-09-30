# 016 — Disable Text uploads and remove application coupling

**Date:** 2026-09-30  
**Status:** Implemented, verified, and archived.

## Agreed behavior

1. Preserve the drawer form and its independent Text/JSON drafts, Save/Cancel controls, and Save errors. Remove only upload-related application coupling.
2. Keep every Tiptap extension registered, including image and upload nodes. Existing images, resizing, formatting, and block dragging remain supported. Without an upload handler, Add image is disabled and saved upload placeholders have no picker or dropzone.
3. Preserve unrelated WIP, including HTML display and the planning-directory migration. Keep upload endpoints and unrelated upload features. This plan is archived after implementation and verification.

## Implementation

1. Remove `uploadImage` and upload-only `onError` from the shared form contract, factory, Text form, and editor. Remove the drawer request implementation, upload tracking, cancellation cleanup, and Save gating.

   ```tsx
   // 1 — The application owns the generic draft, without upload knowledge.
   <Form
     key={editorEpoch}
     state={formState}
     onChange={(state) => {
       setFormDraft({ state });
       setFormError(null);
     }}
   />
   // 2 — Save stages the state; Cancel discards it using existing behavior.
   ```

2. Omit upload callbacks from the Text editor extension configuration. Guard the existing upload command, Enter shortcut, upload handler, and picker against a missing handler. Make the existing internal upload option optional. Render the disabled message before the interactive node-view branch while keeping hooks unconditional.

   ```ts
   // 1 — In setImageUploadNode, can() and execution both report unavailable.
   if (!this.options.upload) return false;
   // 2 — Retain existing insertion behavior when a real handler is supplied later.
   ```

   ```text
   1 — Open a Text form: Add image is disabled; formatting remains available.
   2 — Load a saved imageUpload node: show “Uploads temporarily disabled”.
   3 — Click or press Enter there: no picker and no upload request.
   4 — Resize an existing image: only the draft changes until Save.
   ```

3. Add the accepted AGENTS.md warning: “Modules own their module-specific behavior. Before adding module-specific logic or dependencies to application code or shared module contracts, warn the user, identify the proposed coupling, and explain why the module cannot own it.” Update current README and TODO upload instructions without rewriting historical verification.

## Verification

1. Run Library's resolved Nx `tsc` and `lint` targets. Do not write or run Library tests. Report unrelated failures without repairing them.
2. Manually verify disabled Add image, noninteractive saved upload placeholders, and no upload requests.
3. Verify existing images/rendering/resizing, formatting, block dragging, undo/redo, and independent Text/JSON Save and Cancel. Restore any temporary verification document changes.
4. Inspect the scoped diff for residual application upload imports and lifecycle logic. Record actual results below before archival.

## Results

1. `pnpm nx run-many -t tsc lint -p @qrk.sh/library` passed with its required dependency tasks. No Library tests were written or run. `git diff --check` passed.
2. In the existing Chrome profile at `http://localhost:4100`, created one temporary Text brick through the normal preview drag/drop UI. Add image was disabled. Saved an `imageUpload` node and an inline SVG image through Shared state JSON: the upload node displayed the disabled message, exposed no file input, and clicking/pressing Enter opened no picker. Enter followed normal editor behavior. Network observation reported zero `/upload` requests, without truncated events.
3. Verified bold formatting, Undo and Redo, Text Save while the JSON draft was invalid, JSON Cancel restoring committed state, and Text Cancel discarding changes. JSON Save populated the editor and wall independently. No upload-related Save gating remained.
4. Verified the existing image rendered at 120 px, resized to 198 px in the draft, and Text Cancel restored it. Dragged the first text block to the end and canceled the reorder. Add image remained disabled throughout.
5. Removed the temporary brick through the existing drag-outside-wall behavior and confirmed the grid was empty again. Restored the original DevTools-open preference and closed the verification tab. No asset was uploaded.
6. Scoped source inspection confirmed no `uploadImage`, `UploadFunction`, `uploadCount`, `pendingUploads`, or `XMLHttpRequest` remains in the drawer, shared form contract/factory, Text form, or editor. All editor extensions remain registered. Historical plan records and unrelated WIP were preserved.
