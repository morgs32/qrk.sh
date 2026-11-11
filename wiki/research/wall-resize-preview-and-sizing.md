# Wall resizing: sizing rules, local preview, and command commit

Researched 2026-11-01 from the current QRK checkout, installed Zerospin `38.1.1`, and official CSS, React, Zustand, Pointer Events, and accessibility sources. This is a recommendation, not an implementation plan. No application changes, browser verification, or performance measurements were performed. Existing editor work in the checkout was preserved. [Installed dependencies][dependencies]

## Recommendation

**Establish the sizing behavior first, then add a temporary resize preview and stage one command when a changed gesture completes. A Zustand copy of the Wall is unnecessary.** Keep the live session query as the saved/optimistic model and overlay only the active gesture's geometry. Start with state in the common editor owner; consider a scoped Zustand store only if concrete consumers need independent subscriptions. These are design recommendations based on the current editor's existing local drag feedback and final-drop command boundary, and React's guidance on derived state and shared ownership. [Current drag state][editor-state], [drag feedback][editor-drag], [drop commands][editor-drop], [React state structure](https://react.dev/learn/choosing-the-state-structure), [React shared state](https://react.dev/learn/sharing-state-between-components)

## What QRK already does

- `WallEditor` queries the Wall and its Placements/Bricks, then builds its layout view. Its drag image, feedback, and measured row heights live in local React state/refs. Pointer movement updates feedback; the successful drop stages a move or add command. Resizing can follow the same interaction boundary. [Wall query][editor-query], [local state][editor-state], [pointer feedback][editor-drag], [move drop][editor-drop], [add drop][editor-add]
- Rows already render with `flex items-stretch`, and nested Brick hosts stretch vertically. Horizontally, a Placement supplies module `defaultWidth` and `minWidth`, including the Brick gap; the CSS uses `flex: 0 1 auto`. Thus the current behavior permits shrinking toward the minimum but deliberately does not grow Bricks into spare row width. Stack columns separately use equal grid tracks. [Row rendering][row-render], [Brick sizing][placement-sizing], [Brick CSS][brick-css], [Stack rendering][stack-render]
- Module variants declare preferred/minimum widths and heights, but the current renderer applies their widths, not their declared heights. The modules README explicitly defers preferred-height/content-fitting work. Natural-height variants (`defaultHeight: null`) currently occupy a Row alone; the move command enforces this. Stretching mixed content must not silently erase that rule. [Variant metadata][variant-metadata], [documented height gap][height-gap], [row-sharing policy][share-row], [move guard][move-guard]
- Saved Row topology contains IDs and ordering; Placement data contains references, variant/spec generation information, and revisions. Neither currently stores editable dimensions, and there is no resize contract in the current contract tree. The existing App Zustand store measures editor viewport width; it is not a Wall mirror. [Row schema][row-schema], [Placement schema][placement-schema], [current contracts][contracts], [viewport store][viewport-store]

## Sizing comes before handles

`min-width` and `min-height` are lower bounds, not requested sizes. A Row with `min-height: 240px` may grow taller for content; setting a minimum does not establish an exact resize-handle position. Use minimum height if the intended product behavior is “at least this tall”; exact height needs an explicit content-fit/overflow policy. [CSS sizing: minimum and preferred sizes](https://www.w3.org/TR/css-sizing-3/#sizing-properties)

In a horizontal flex Row, **horizontal filling** comes from flex growth; **equal-height filling** comes from cross-axis stretch. Stretch requires an automatic cross size and appropriate margins, and still respects min/max constraints. It does not distribute horizontal space. [Flexbox alignment](https://www.w3.org/TR/css-flexbox-1/#align-items-property)

For a dragged vertical divider, choose the intended horizontal quantity before choosing persistence: a preferred width/basis or a relative share. `flex-basis` is the starting main size; grow/shrink distribute remaining space and constraints clamp the result. Equal zero bases with growth factors can express shares, subject to minimums and the box model. Merely changing a minimum while retaining equal growth generally does not make that value the final width. If minimum widths exceed the available Row, flex cannot satisfy both minimums and full containment. [Flexbox flexibility](https://www.w3.org/TR/css-flexbox-1/#flex-property), [automatic minimums](https://www.w3.org/TR/css-flexbox-1/#min-size-auto)

**QRK recommendation:** first make spare-width distribution and vertical content fitting explicit in the renderer, retaining the existing module minimums and row-sharing invariant. Keep constraints separate from user-controlled geometry. Geometry should follow the Wall/Placement and Row that it affects, because Placements already identify their Wall and variant; copying dimensions onto shared Brick content would conflate those responsibilities. The exact storage shape and pixel-basis versus proportional behavior remain decisions for implementation. [Placement ownership][placement-schema], [Row ownership][row-schema], [module constraints][variant-metadata], [row-sharing policy][share-row]

## The temporary state is a gesture, not another Wall

For one active resize, retain only the Wall/breakpoint and target IDs, the initial measurement/geometry needed to calculate movement, and the currently proposed geometry. A divider affecting two neighbors previews both together. Render saved geometry with those targeted overrides; do not copy Sections, content, specs, or the entire queried hierarchy into editable state. This keeps unrelated live data visible and avoids maintaining a second copy. The recommendation follows React's advice to derive values rather than duplicate state. [React state structure](https://react.dev/learn/choosing-the-state-structure)

State rendered by React belongs in `useState`/a reducer; refs suit the starting pointer position, element measurements, latest event data, and animation-frame token. Updating a ref alone does not rerender the preview. The existing common `WallEditor` owner can initially distribute the preview to the affected Row and Placements. [React refs](https://react.dev/reference/react/useRef), [React shared state](https://react.dev/learn/sharing-state-between-components), [existing editor state][editor-state]

Zustand becomes useful if handles, affected Placements, and size readouts need subscriptions that would otherwise update a broad editor subtree. Its selectors support subscribing to slices, and its official guidance supports a vanilla store provided through React context for instance-scoped state. If that need appears, scope the gesture store to the editor and retain the same small preview; do not mirror the live Wall or add persistence. This is an ownership option, not an established performance improvement. [Zustand selectors](https://github.com/pmndrs/zustand/blob/main/README.md#selecting-multiple-state-slices), [Zustand scoped initialization](https://zustand.docs.pmnd.rs/learn/guides/initialize-state-with-props)

## Gesture lifecycle and handoff

The following lifecycle is a recommendation for QRK, not behavior supplied automatically by CSS or Zustand:

1. **Start:** measure the affected Row, record the starting geometry and pointer, and capture that pointer on the handle. Capture keeps subsequent events directed to the handle when the pointer leaves it. Configure the handle's `touch-action` before the gesture; cancelling a pointer event is not a substitute for declaring touch panning behavior. [Pointer capture](https://www.w3.org/TR/pointerevents3/#setting-pointer-capture), [touch behavior](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property)
2. **Move:** calculate and clamp the proposed geometry, then update only local preview state. Stage no commands and write no model rows. If profiling warrants it, coalesce visual updates with `requestAnimationFrame`; this schedules work for rendering opportunities, not server delivery. [Animation-frame processing](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)
3. **Complete:** calculate the final geometry from the release position, including movement not yet painted. If unchanged, clear the preview. Otherwise stage one command containing the final affected geometry; when a divider changes two neighbors, one command should describe that whole edit. No resize command exists yet, so this is a proposed contract boundary. [Current command tree][contracts]
4. **Handoff:** stage before clearing the preview. Zerospin staging synchronously evaluates the command and applies optimistic model operations before returning success. On success, clear the gesture and render the live session result. On local refusal, discard the preview and use existing failure presentation. Do not retain a second overlay until a server acknowledgement: staging success is local success, and the session already owns delivery and authoritative reconciliation. [Staging entry point][stage-entry], [optimistic evaluation][stage-evaluation], [journal commit and handoff][stage-transaction], [completion semantics][completion]
5. **Cancel:** Escape, `pointercancel`, unexpected capture loss, unmount, or invalidated ownership/geometry clears the gesture without a command. In particular, cancel if the target disappears or Wall/breakpoint/affected topology changes invalidate its measurements; do not introduce draft rebasing without a requirement. Capture also releases after normal `pointerup`, so cleanup must recognize an already-completed gesture and avoid a second commit. [Pointer cancellation](https://www.w3.org/TR/pointerevents3/#the-pointercancel-event), [implicit release](https://www.w3.org/TR/pointerevents3/#implicit-release-of-pointer-capture)

Committed model changes must still pass through commands. A local preview is presentation state; it must not become direct mutation of the Zerospin database. Server refusal may still follow local staging success, and framework reconciliation must remain visible rather than being masked by an old preview. [Parallel-model invariant][parallel-models], [completion semantics][completion]

## Keyboard interaction and remaining decisions

For a separator between two resizable regions, the WAI-ARIA Window Splitter pattern describes a focusable separator with arrow-key movement, an accessible name, controlled-region reference, and range values. The APG flags that pattern's incomplete example/review status; use its guidance deliberately rather than claiming conformance from a role alone. A corner handle is not automatically the same widget. [WAI-ARIA Window Splitter](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)

Recommended keyboard behavior should use the same preview and final sizing command, with an explicit completion boundary for a key sequence instead of staging every repeated key event. Before implementation, settle preferred widths versus shares, minimum versus exact Row height, constrained-content behavior, and how neighboring Bricks absorb a divider move. Those choices affect rendering and the command payload; they do not require a general draft-Wall layer.

[dependencies]: /Users/morgs32/GitHub/qrk.sh/apps/app/package.json:44
[editor-state]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:63
[editor-query]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:84
[editor-drag]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:207
[editor-drop]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:288
[editor-add]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:346
[row-render]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:743
[stack-render]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallEditor.tsx:675
[placement-sizing]: /Users/morgs32/GitHub/qrk.sh/apps/app/components/WallEditor/WallPlacement.tsx:29
[brick-css]: /Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:96
[variant-metadata]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/modules/make/makeModuleVersion.ts:69
[height-gap]: /Users/morgs32/GitHub/qrk.sh/apps/app/modules/README.md:217
[share-row]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/layout/canShareRow.ts:1
[move-guard]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/wall/MovePlacementToRowContractV2.ts:95
[row-schema]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/layout/wallLayoutSchema.ts:9
[placement-schema]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/models/placement/PlacementV1.ts:10
[contracts]: /Users/morgs32/GitHub/qrk.sh/apps/zerospin/src/aggregates/user/contracts/wall
[viewport-store]: /Users/morgs32/GitHub/qrk.sh/apps/app/stores/useEditorViewportStore.ts:3
[stage-entry]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/aggregateSession/stageCommand/stageAggregateSessionCommand.js:1
[stage-evaluation]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/aggregateSession/evaluateAggregateSessionCommandTx.js:36
[stage-transaction]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/core/dist/aggregateSession/stageCommand/stageSessionCommandTx/stageSessionCommandTx.js:11
[completion]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/sdk/skills/zerospin-submit-commands/references/completion-boundaries.md
[parallel-models]: /Users/morgs32/GitHub/qrk.sh/apps/app/node_modules/@zerospin/sdk/skills/zerospin-parallel-models/SKILL.md
