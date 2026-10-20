# Add a fixed 50% Studio preview story

Status: implemented and verified. Plan 033 was already allocated when implementation began, so this work uses 034.

## Agreed behavior

1. Add **App / Studio / Pragmatic Tree / Zoomed Out** alongside Default.
2. Place the existing palette and tree inside `WallBreakpointPane`. Scale the entire frame and its contents together to exactly 50%.
3. Disable zoom and pan gestures. Existing item dragging, stack dragging, insertion controls, and Move dialogs remain usable.
4. Use a 1024×640 desktop frame, displayed at 512×320 and centered in the Storybook canvas. Small canvases scroll instead of changing the scale.
5. Preserve production wiring and recent stack-drop behavior. This work introduces no public interfaces, named types, new components, or additional border-layering changes.

## Implementation

1. Add `react-zoom-pan-pinch@4.2.0` as an exact App development dependency using pnpm; update the lockfile. The [research note](../../research/react-zoom-pan-pinch-studio.md) records the pinned library behavior. The agreed whole-frame scaling replaces that note's earlier unscaled-frame recommendation.
2. Add a `ZoomedOut: StoryObj<typeof meta>` export with fullscreen layout and a story-level decorator. Render `<Story />` inside the frame, reusing `meta.render` without extraction or duplication.
3. Lock `TransformWrapper` to `initialScale={0.5}`, `minScale={0.5}`, `maxScale={0.5}`, and `disabled`. Set `TransformComponent` wrapper dimensions to 512×320 and content dimensions to 1024×640. Center the transformed box with CSS; omit `centerOnInit` and fitting logic.
4. Configure `WallBreakpointPane` with `breakpoint="lg"`, `previewWidth={1024}`, active/on-stage true, outgoing/transitioning false, `direction={0}`, reduced motion, and an inline no-op completion callback required by its existing interface. Set `[--wall-frame-height:640px]` on its enclosing element.
5. Give the frame's content area `min-h-0 flex-1 overflow-auto p-8`, containing `<Story />`. Growing content scrolls inside the frame. Existing portaled menus and dialogs retain their current behavior.
6. Preserve the existing controls and defaults. Use a Storybook decorator rather than extracting or duplicating the tree; use the requested library rather than adding a separate CSS scaling mechanism.

## Annotated examples

```tsx
// 1. Lock the preview at 50%; navigation gestures remain disabled.
<TransformWrapper disabled initialScale={0.5} minScale={0.5} maxScale={0.5}>
  <TransformComponent
    // 2. Reserve the actual displayed footprint.
    wrapperStyle={{ width: 512, height: 320 }}
    // 3. Keep browser and tree layout at their original dimensions.
    contentStyle={{ width: 1024, height: 640 }}
  >
    {/* 4. Existing WallBreakpointPane contains the existing <Story />. */}
  </TransformComponent>
</TransformWrapper>
```

```text
1. Initial view: 1024×640 frame → 512×320 displayed preview.
2. Drag New item into Stack 1 → allocate one item through existing behavior.
3. Wheel, pinch, double-click, or background drag → scale remains 0.5.
4. Add enough rows to exceed the frame → scroll its content without rescaling.
```

## Planned files

Legend: `+` create; `~` modify. Paths are rooted at `qrk.sh`.

```text
qrk.sh/
├── apps/app/
│   ├── components/PragmaticTree.stories.tsx       ~
│   ├── package.json                              ~
│   └── README.md                                 ~
├── pnpm-lock.yaml                                ~
└── wiki/plans/034-plan-studio-zoomed-out-story.md  +
```

## Verification

1. Manually open Default and Zoomed Out. Confirm Default retains its appearance and the new frame renders at 512×320.
2. Confirm wheel, double-click, and background dragging do not change the preview's scale or position. Source-review the disabled touch handlers and locked scale limits; direct touch-pinch runtime verification is unnecessary for the disabled feature, as clarified by the user on 2026-10-20.
3. At 50%, exercise palette creation, item insertion/reordering, cross-stack movement, stack movement, and Move dialogs. Check pointer alignment, indicators, previews, and overlay positioning.
4. Change existing Storybook controls and add enough content to exercise frame scrolling. Resize the canvas and confirm centering or outer scrolling preserves 50%.
5. Use the existing Storybook session; introduce no automated tests or check gates.

## Post-implementation documentation

1. Update the App README with the story and fixed-scale behavior.
2. Reconcile implemented terminology with the existing glossary. No new domain terms or ADR are expected for this presentation change. Create an ADR only if the actual decision is hard to reverse, surprising without context, and the result of a real trade-off.
3. Record verification evidence and any limitations, set Remaining work to None only when required work is complete, then archive this plan while preserving its filename and repairing relative links.

## Implementation and verification outcome

1. Added the exact development dependency `react-zoom-pan-pinch@4.2.0` and the fullscreen `ZoomedOut` decorator. Default and the existing tree implementation are reused. The local registry was offline; a one-command npm registry override installed the public package without changing `.npmrc`.
2. Started the existing `@qrk.sh/app:storybook` Nx target after finding its previous server stopped. It reported ready at port 10020. Default rendered normally; Zoomed Out measured 512×320 displayed pixels over a 1024×640 layout with `matrix(0.5, 0, 0, 0.5, 0, 0)`.
3. In the in-app browser, dragged the palette to create Item 7, moved Item 1 across stacks, reordered Items 3 and 2, and moved Stack 1 after Stack 2 using its grip. Click insertion and the portaled Move dialog, position menu, and Move action also worked at 50%.
4. Wheel, double-click, and dragging blank space inside the frame preserved the transform. At width 640 and row height 56, repeated insertion produced content `scrollHeight=1111`, `clientHeight=592`, and `scrollTop=463`; the frame retained its 512×320 dimensions.
5. With a temporary 800px browser viewport, the preview canvas was 500px wide and exposed 576px of horizontal scroll extent; the frame remained 512×320 at 0.5 scale. Restored the browser viewport and reset the verification story afterward.
6. Touch pinch remains disabled. Installed release source confirms `onTouchPanningStart`, `onPinchStart`, and `onPinch` return immediately when `setup.disabled` is true; the story also locks both scale limits to 0.5. The user clarified that touch pinch is not being enabled, resolving the unnecessary runtime-check requirement. Runtime touch-pinch verification is not claimed. The temporary Chrome verification tab was closed, preserving existing tabs and login.
7. Updated the App README. No new domain terminology or qualifying architectural decision was introduced, so no glossary or ADR change was needed. No automated tests, builds, formatters, or check gates were added or run. Concurrent unrelated edits were preserved.

## Remaining work

None.
