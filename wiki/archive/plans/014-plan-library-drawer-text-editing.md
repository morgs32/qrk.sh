# 014 — Library drawer Text editing

**Date:** 2026-09-30  
**Status:** Implemented and archived at user direction; outstanding manual checks are in [TODOs](../../../TODOS.md).  
**Source:** [Approved design](../specs/014-spec-library-drawer-text-editing.md).

## Outcome and constraints

1. Library edits Text inside the existing brick-detail drawer. Text and Shared state JSON occupy separate root `OrderedOutline` sections, each with its own draft and Save/Cancel controls. Each Save stages one complete `updateBrickState` state and leaves the drawer open. The last successful Save wins if both drafts were dirty.
2. Studio retains its inline editor and immediate staging. Preserve Library's existing four mounted breakpoint walls, persistent drawer, scroll anchoring, wall-height measurement, collision behavior, and independent Generate spec and visibility commands.
3. Add no dependencies, named types/interfaces, casts requiring `ALLOWED_CAST`, form framework, draft merge, or storage migration. Do not create, modify, restore, or run Library tests. Preserve unrelated WIP and plan 011's historical verification record.

## Ordered implementation

1. **Extend the module view contract.** In `makeModuleView`, accept optional top-level `form` beside `default` and breakpoint overlays. Infer its `state` and `onChange` state value from `MODULE["stateShape"]`, and supply `uploadImage` and `onError` using the existing Text upload/error shapes. Decode unknown registry state before calling the form, following the authored-renderer boundary; the form decoder accepts the already decoded state held by the drawer. Return it as optional `Form`; add that optional member to the existing `IModule` in `lib/types.ts`. Keep the type shapes inline and use defining-module imports. Do not add form support to individual breakpoint overlays.

   ```tsx
   // 1 — Module authors receive the decoded state inferred from stateShape.
   form(props) {
     const { state, onChange, uploadImage, onError } = props;
     return (
       <TextEditorControl
         value={state.content === null ? null : JSON.parse(JSON.stringify(state.content))}
         drawer={{
           // 2 — The form changes only its host's draft; it stages no command.
           // 3 — Decode the editor document at the module's state boundary.
           onChange: (content) =>
             onChange({ ...state, content: Schema.decodeUnknownSync(TiptapDocSchema)(content) }),
           uploadImage,
           onError,
         }}
       />
     );
   }
   ```

   Register this form in `textView`. Preserve the existing authored component and generator. Module views without a form continue to return `Form: undefined` or omit it consistently with the current optional-member convention.

2. **Add drawer mode to `TextEditorControl`.** Keep the current `editing` prop and all inline callbacks as Studio's default path. Add a drawer configuration containing `onChange`, `uploadImage`, and `onError`. The drawer editor is editable, calls `onChange` with the complete document on actual user edits, and never stages a command itself. Keep `useEditor`, extensions, node views, selection, undo/redo, image resizing, block drag handle, validation, and progress. Render its toolbar above the document inside the drawer; keep the floating portal for inline editing. Install outside-click/focus deactivation and natural-height observation only for inline mode. Escape first leaves an open popover/menu to its own handler; otherwise the drawer owner handles cancellation.

   The existing editor creates a paragraph for `null` content. Treat that creation and other non-user normalization as baseline setup, not an `onChange` event. Preserve editor identity across committed-state echoes while a Text draft is dirty, and across breakpoint changes. Apply genuinely new committed content to a clean editor without staging or resetting it merely because a query emits a new object. On Text Cancel, deliberately remount the drawer editor for that brick so canceled undo history cannot reappear; do not remount on Save or breakpoint change.

   ```text
   1 — Open `{ content: null }`: the editor may display an empty paragraph.
   2 — Text Save stays disabled; no `updateBrickState` is staged.
   3 — Type a character: `onChange` writes the Text draft and enables Save.
   4 — Undo back to empty: Save is disabled again against the committed baseline.
   ```

3. **Own two independent drafts in the brick-detail route.** Key the route's editing state and editor instance by brick ID, not active breakpoint. Retain a Text state override only after a real form edit and a raw JSON string override only after JSON editing; absent overrides follow the latest committed brick state. Track each section's own error and accepted Save baseline. Validate raw JSON with the module's existing `stateShape` conversion and the `updateBrickState` contract's schema decoding behavior, including nullable placeholders where allowed. Keep invalid raw text visible and report its parsing/schema error beside JSON; block only JSON Save. Compare decoded candidate state with the latest committed or locally accepted state so whitespace-only JSON changes and empty-editor normalization do not enable Save.

   On each section's Save, stage one complete state for that section. If staging succeeds, advance that section's accepted baseline immediately, clear only its override/error, and let later committed echoes converge without reopening a dirty state. If staging fails, retain that section's draft and show its error without retrying automatically. A committed echo or another section's Save refreshes only a clean section; a dirty section keeps its exact draft. Each Cancel clears only that section's override/error and resets it to the latest committed state; Text Cancel also aborts its uploads and remounts its editor.

   ```ts
   // 1 — Validate this section's complete candidate before staging.
   const result = stageCommand({
     session,
     contractName: "updateBrickState",
     payload: { brickId, moduleId, state: candidateState },
   });
   // 2 — Failure leaves this section's draft and editor open with an error.
   // 3 — Success clears only this section's draft; the drawer stays open.
   ```

   ```text
   1 — Both sections start at committed A; edit Text to B and JSON to C.
   2 — Save Text: B is staged and Text becomes clean; JSON still shows C.
   3 — Save JSON: C is staged and JSON becomes clean; Text follows C.
   4 — A late echo of B must not revive either old draft or overwrite C.
   ```

4. **Lay out the drawer sections and wire upload ownership.** Place the module `Form`, when present, in a root `OrderedSection` labeled Text before Generate spec, Options, Shared state JSON, and Brick Definition. Keep the JSON editor as its own root section with its own Save and Cancel. Modules without `Form` retain their current content and behavior; do not change Generate spec, visibility, or Brick Definition to read uncommitted drafts.

   Move Library's existing `/upload` XMLHttpRequest callback from wall editing into the drawer Form host without changing endpoint, MIME/size checks, progress, abort signal handling, or error text. Keep shared `BrickWall` upload props/defaults available to Studio. Count pending drawer uploads at the route boundary so Text Save is disabled while any are active; JSON Save remains independent. Use the existing node-view abort handling plus route-lifetime cancellation so Text Cancel, close, navigation, and deletion abort in-flight requests and prevent late insertion. Already uploaded assets are left alone. Breakpoint switching does not remount or abort the route editor.

   ```text
   1 — Begin an image upload in Text: show its current progress; disable Text Save.
   2 — Edit valid JSON during the upload: JSON Save can still stage its state.
   3 — Switch breakpoint: the same editor and upload continue.
   4 — Cancel Text: abort the request and discard a late completion.
   ```

5. **Replace Library wall activation with drawer activation.** Route both Text double-click and **Edit text** through `onBrickActivate` to `/bricks/$brickId`; remove Library's inline `activeText` ownership and its `onTextEditStart`/`onTextEditEnd` wiring. Keep the shared `BrickWall` context and edit props intact for Studio. Ensure activation explicitly sets `drawerOpen` even if navigation targets the current URL, because the current location-key logic reopens only when that key changes. Closing by the X or Bricks toolbar button immediately deactivates brick-detail content, aborts uploads, clears drafts, and navigates to `/`; keep the drawer shell's persistent animation and scroll behavior. Route navigation and brick deletion perform the same disposal. Escape follows the same close path when no editor popover/menu is open. Clicking the wall alone has no cancel behavior.

   Do not remove the wall's read-only Text editor or natural-height observer: after a Save changes committed content, the active pane still measures at its actual width and runs the existing collision command. Outgoing/inactive panes remain unable to write heights. Draft content never reaches wall rendering before Save.

6. **Update documentation after implementation.** Revise Library's README to describe drawer activation, separate Text/JSON Save and Cancel, last-Save-wins behavior, upload lifetime, and post-Save wall measurement. Revise plan 011 in place so its Library inline-edit instructions are superseded by this plan while Studio inline behavior and its historical verification record remain clear. Include annotated examples distinguishing the two hosts; do not rewrite old results as if they verified the new drawer.

## Verification and acceptance

1. Run `pnpm nx run @qrk.sh/library:tsc` and `pnpm nx run @qrk.sh/library:lint` after code changes. Check the scoped diff and `git diff --check`. Do not write, run, restore, or maintain Library tests. Report unrelated failures without repairing them.
2. On a Library server that has printed its actual readiness signal, manually exercise Text double-click, **Edit text**, reopening the same route, and a module without `Form`. Check separate root outline entries and separate controls. Verify Text and JSON drafts do not update each other before Save, clean sections follow committed changes, dirty drafts survive echoes, last Save wins, each Cancel resets only itself, invalid JSON blocks only JSON Save, and failed Save preserves its section's draft/error.
3. Verify empty-document opening/normalization leaves Save disabled; formatting, selection, undo/redo, block dragging, image resizing, and successful Save work. Exercise Escape with an open popover and then without one, close/reopen, route navigation, deletion, wall click, and breakpoint switching. Check that canceled editor history does not return.
4. Verify upload type/size rejection, progress, Text Save blocking, JSON Save independence, cancellation and late-completion rejection, and continuation across breakpoint changes. If the browser file picker cannot be automated, record exactly which checks were manual or blocked; do not report upload acceptance as passed from typechecking alone.
5. Observe wall content and grid geometry before and after Save. Confirm no draft-driven changes, saved growth/shrink remeasurement and collision behavior, and no inactive/outgoing pane height writes. Confirm Studio still exposes its inline editor and unchanged editing behavior, using available manual inspection if authenticated acceptance is blocked.
6. Record exact checks, results, and blockers in this plan. The remaining manual checks were transferred to [TODOs](../../../TODOS.md) before archival at user direction. The source spec was archived when this plan was created.

## Verification record — 2026-09-30

1. Passed `pnpm nx run-many -t tsc lint -p @qrk.sh/library` (Library `tsc`, `tsc:worker`, and `lint` succeeded) and `git diff --check`. No Library tests were created, changed, or run.
2. On the existing responsive local Library server at port 4100, placed a Text brick and verified both **Edit text** and wall double-click open its brick route. The drawer showed separate root Text and Shared state sections, each with its own Save/Cancel. An Image brick without `Form` retained Generate spec, Options, Shared state, and Brick Definition without a Text section. The existing server's startup readiness line was not captured in this session.
3. Verified an empty Text brick kept both Saves disabled. Text editing enabled only Text Save and left wall content and JSON unchanged. Invalid JSON remained visible with a parse error and disabled only JSON Save; JSON Cancel restored its field without touching the Text draft. A valid JSON draft and a different Text draft remained independent. Saving JSON kept Text dirty; saving Text afterward committed Text as the last Save. Both Saves left the drawer open. Text Cancel restored committed content and disabled its Save. Close/reopen and route navigation discarded unsaved Text.
4. Verified Bold formatted selected drawer text, Undo restored the saved baseline and disabled Save, and a breakpoint switch retained the Text draft while the wall remained on committed content. With 15 unsaved paragraphs, the active wall item stayed 90 px tall; after Save, it remeasured to 1530 px at the 720 px grid width. Escape dismissed an open Link popover first, then closed the drawer on a second press.
5. The first Chrome upload attempt could not reach its hidden file input through an accessibility locator, so it was canceled. On retry after Chrome file access was enabled, clicking the visible upload dropzone exposed the file chooser. A synthetic 111-byte SVG uploaded to `/upload`, showed progress, inserted an image in the drawer draft, and left the wall unchanged; Text Cancel removed the draft image. A `.txt` file showed the unsupported-type error, and an SVG over 5 MiB showed the size error.
6. With a temporary 2 KiB/s Chrome upload throttle, a 1 MiB SVG showed progress while Text Save stayed disabled. A valid JSON draft remained saveable and committed to the wall during that upload. Text Cancel removed the in-flight node and no late image appeared. A second throttled upload survived switching from the 720 px to the 1080 px breakpoint; closing the drawer disposed it, and reopening showed only committed content. Normal network settings and the 720 px breakpoint were restored. The test brick's committed state was restored to `{ "content": null }`. The successfully uploaded asset was not deleted, consistent with the upload contract.
7. Failed `updateBrickState` staging could not be induced safely in this local session. Block dragging, image resizing, brick deletion, a committed-state echo during a dirty draft, inactive-pane height-write isolation, and authenticated Studio inline behavior were not rechecked here; plan 011 records earlier Studio/geometry coverage, not acceptance of this change. The temporary Text brick created for this check remains in the local Library wall with empty committed content; it was not deleted. The remaining checks are tracked in [TODOs](../../../TODOS.md).
