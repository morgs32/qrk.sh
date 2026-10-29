# Brick presentation consistency

Researched 2026-10-29 against the `brick-sizing` worktree at `1d3af7c89`.
The user subsequently approved the cleanup below on `codex/brick-presentation-cleanup`.
Implementation is complete. This note preserves the original diagnosis as history;
its historical code links are pinned to `1d3af7c89`, not the changing worktree.
The research itself changed no rendering code.

## Implemented cleanup

The following decisions are settled; they supersede the open recommendations in
the historical sections below. Scoped checks and browser verification passed; the stories remain available for review.

- The existing `BrickWrapper` owns intrinsic height and self-contained flat/card
  appearance through the existing `className` hooks. Its outer surface permits
  visible overflow; an internal `.brick-content` layer owns clipping, inherited
  rounding, content layout, and `@container`. Saved border paint stays at 18,
  interaction paint at 19, and BrickAction at 20. Keep the outer halo out of the
  clipped content layer. Add no new component, prop, type, or presentation factory.
  [BrickWrapper](../../apps/app/modules/components/brick/BrickWrapper.tsx),
  [Surface styling](../../apps/app/modules/bricks.css).
- Share one blue content decoration across hover, DOM focus, and selection: a
  fully opaque 1px `rgb(31,155,252)` stroke, sharp 1px outer halo at 30% opacity,
  and sharp 1px inset halo at 15%. Selection still means an open Brick edit form;
  active still means DOM focus. The portaled menu keeps its separate outer
  indication when focus leaves the Brick.
  [Shared paint](../../apps/app/modules/bricks.css),
  [Placement/menu ownership](../../apps/app/modules/lib/wall/WallPlacement.tsx).
- BrickAction is visible only on actual Brick hover or focus within, without
  selected/menu overrides or permanent coarse-pointer visibility. StackAction
  retains its distinct position, Stack activation scope, and existing
  coarse-pointer behavior. Share blue action colors without merging those owners.
  [BrickAction](../../apps/app/modules/components/BrickAction.tsx),
  [StackAction](../../apps/app/modules/components/StackAction.tsx).
- Retain the native pointer image's **2px blue edge**, with no halos, editor
  actions, or card shadow. The insertion shadow remains a **40%-opacity,
  borderless** content copy with no editor actions. These are deliberately distinct
  representations and keep their existing capture/drag lifecycle owners.
  [Native capture](../../apps/app/modules/lib/ModulePreview.tsx),
  [Insertion](../../apps/app/modules/lib/wall/WallEditor.tsx),
  [Representation styling](../../apps/app/modules/bricks.css).
- Placement and shadow cells share `flex: 0 1 auto`; inline preferred/minimum
  widths and half-gap padding remain explicit. Preserve the empty-Wall outer
  half-gap allowance that prevents padding from changing wrapping and height.
  [Placement cell](../../apps/app/modules/lib/wall/WallPlacement.tsx),
  [Shadow cell](../../apps/app/modules/lib/wall/WallEditor.tsx).
- Remove the legacy hover-study gallery and mock stylesheet. Production-path
  stories identify the actual representations, expose valid fixture controls,
  and cover paint/action visibility as well as geometry and cancellation. No new
  rendering or testing framework is introduced. Source convergence incorporates
  the relevant blue styling without copying unrelated primary-checkout work.
  [Wall Editor stories](../../apps/app/components/WallEditor.stories.tsx).

**Verification:** App TypeScript, the scoped Storybook build, targeted formatting,
and diff checks pass. Browser checks cover 16 matched content-box comparisons
across all four breakpoints, Swatch and wrapping Article fixtures, flat/card
styles, gaps 0/1/4/12, and saved borders 0/12. Real hover independently reveals the
same rounded blue decoration; selected-only retains the content stroke while
hiding actions. Story plays cover focus/menu transfer and Escape return, native
2px-blue/no-halo images, borderless 40%-opacity inert insertion copies, crowded
Rows, empty Walls, and cancellation. Default, Empty Wall, and Vertical Drawer
also render with the existing local public Mapbox configuration.

**Remaining work:** None.

## Historical diagnosis: the Shadow Brick screenshot

The black outline and controls in the supplied screenshot are consistent with
**the existing placed Brick being hovered**, rather than the insertion shadow.
`WallPlacement` renders the ellipsis action, while the Stack renders its own
name tab. The real shadow clones only the inner `.brick-hover-surface`; the
preview's `BrickAction` is its sibling and is not copied. Its content is inert,
its host is `aria-hidden`, and its host opacity is 40%.
[Placed action](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallPlacement.tsx#L41-L74),
[Stack action](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L382-L386),
[Preview composition](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/ModulePreview.tsx#L130-L149),
[Shadow clone](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L80-L87),
[Shadow host](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L339-L360).

At the research snapshot, the checkout contained the older shared presentation: normal
hover paints a **5px black border**, and both action components use
`bg-zinc-800`. Selection instead uses a 1px blue border and halos. The native
pointer-following drag image is a third presentation: it clones the whole
preview host, applies a 2px dark edge, and hides `BrickAction`. That native image
is separate from the insertion shadow on the Wall.
[Hover and selection](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L92-L118),
[BrickAction](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/BrickAction.tsx#L3-L9),
[StackAction](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/StackAction.tsx#L3-L9),
[Native clone](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/ModulePreview.tsx#L75-L85),
[Native treatment](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L120-L138).

The story name describes a full scenario containing an existing Brick, its Stack,
the catalog source, and temporary insertion feedback; it does not replace every
Brick with a shadow. Escape or story cleanup cancels its synthetic drag, so the
scenario can remain visible after the insertion shadow has gone.
[Story fixture](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L40-L62),
[Shadow scenario and cancellation](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L507-L527).
Read-only DOM inspection of the running Storybook found one placed Brick and no insertion
shadow at that instant. It found the same black hover rule with opacity zero
because that live sample was not hovered. The screenshot's hovered state is a
separate observation; the screenshot alone does not establish a shadow-specific
edge or action.

### Checkout divergence explains the unexpected regression in appearance

At research time, the primary checkout had separate, uncommitted blue hover/action work, while the
published sizing checkout retained the older black normal-hover/action styling.
Source comparison found the primary checkout at `ab87ce03a` and this worktree at
`1d3af7c89`; these are different source states. The sizing change removed the
shadow-specific edge but did not integrate those unrelated presentation edits.
Those source states therefore explained the screenshot without needing a
shadow-specific black style or action component.
[Primary stylesheet](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css),
[Primary BrickAction](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/components/BrickAction.tsx),
[Primary StackAction](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/components/StackAction.tsx),
[Worktree styling](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L92-L151).

## Historical ownership seams

- **Content shell:** `BrickWrapper` already owns clipping, container layout, and
  the saved `borderWidth` overlay, but defaults to `h-full`. Preview and Wall
  content override it with `h-auto`; Brick detail and breakpoint comparisons do
  not. This is a concrete shared owner that can carry the natural-height
  invariant instead of leaving callers to remember it.
  [Wrapper](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/brick/BrickWrapper.tsx#L6-L29),
  [Preview](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/ModulePreview.tsx#L139-L149),
  [Placed content](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L425-L443),
  [Detail preview](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/BrickDetail/BrickDetail.tsx#L165-L179),
  [Breakpoint comparisons](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/BreakpointPreviewRow.tsx#L33-L50).
- **Card appearance:** each caller composes a `.brick-surface-card` parent around
  `.brick-hover-surface`; CSS gives the child its radius/background/shadow. The
  shadow consequently has to recreate that parent after copying the child.
  Appearance is not fully owned by the copied surface. The same parent/surface
  markup is repeated in preview, placed content, detail, and the module-detail
  Component/JsonRender comparison. Source-level inference: rounded content can
  have square hover decoration because the child owns the 8px radius while the
  overlay inherits its outer host's radius. Confirm computed card styles before
  treating that inference as a reproduced visual defect.
  [Card selector](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L74-L80),
  [Overlay radius inheritance](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L92-L101),
  [Placement host](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallPlacement.tsx#L41-L42),
  [Shadow parent reconstruction](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L355-L358),
  [Module-detail comparison](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/app/%5Busername%5D/site/%5BsiteId%5D/page/%5BpageId%5D/%28drawer%29/%28bricks%29/modules/%5BmoduleId%5D/page.tsx#L155-L187).
- **Interaction paint:** hover, selected content, outer focus/menu, and native
  drag decoration have separate rules and hosts. Although many callers use
  `brick-hover-target`, the actual hover selector targets the drawer's data
  attribute or `.wall-placement-content`; the generic-looking class is not the
  activation contract. This makes applying the same surface composition in a
  new context insufficient to obtain the same interaction treatment.
  [Actual selectors](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L83-L118),
  [Outer focus/menu paint](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallPlacement.tsx#L34-L38),
  [Native paint](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L120-L138).
- **Cell sizing:** `WallPlacement` and the insertion shadow independently derive
  preferred/minimum widths plus half-gap padding. The shadow additionally needs
  an empty-Wall width/margin allowance. Share the common cell geometry only if it
  removes that demonstrated drift; keep this layout responsibility separate from
  the content surface and retain destination-specific allowances.
  [Placed cell](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallPlacement.tsx#L27-L33),
  [Shadow cell](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L341-L358).
- **Actions:** `BrickAction` already provides shared presentation for catalog and
  placed actions. Its component owns hover/focus/coarse-pointer visibility, but
  a separate stylesheet forces selected/menu visibility. That policy has two
  owners. `StackAction` has similar colors but meaningful differences in position,
  label sizing, stacking, and Stack-wide activation; a generic action-component
  hierarchy would erase useful ownership.
  [BrickAction](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/BrickAction.tsx#L3-L9),
  [Visibility override](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L149-L151),
  [StackAction](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/StackAction.tsx#L3-L9).

## Research recommendations that led to the approved cleanup

These recommendations describe the initial diagnosis. The settled decisions
above now govern implementation; this section is retained to explain the tradeoffs.

1. **Converge the source state first.** Integrate the already chosen blue
   hover/action treatment as one coherent change in the branch the user is
   inspecting. Do not redesign the colors while resolving this checkout split.
   The affected owners are the shared stylesheet and the two existing action
   components identified above.
2. **Make the existing content surface self-contained.** Audit `BrickWrapper`
   callers and let that existing owner express natural height and flat/card
   appearance consistently. Keep placement width/gap and editor actions outside
   the content surface. Then cloning that surface should carry its appearance
   without rebuilding a card parent. The concrete consumers are ModulePreview,
   WallEditor, BrickDetail, BreakpointPreviewRow, and the module-detail route
   cited above. Reuse the existing `className` surface hooks where sufficient; a
   new `cardStyle` API is unnecessary for the approved cleanup. Keep interaction halos
   outside the clipped content surface rather than moving them into its
   `overflow-hidden` region. This needs no new wrapper component, factory,
   registry, or package.
   [Existing clipping](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/components/brick/BrickWrapper.tsx#L15-L28),
   [Existing outer decoration](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/bricks.css#L92-L101).
3. **Give interaction styling one explicit contract.** Use the existing shared
   stylesheet for one content decoration activated by hover, DOM focus, or selected
   state. Keep selection distinct from focus. Keep the portal menu's outer
   indication separate where focus has left the Brick. Consolidate action
   visibility into one existing owner and share color values without merging
   BrickAction with StackAction. Preserve the insertion shadow's no-added-edge,
   no-editor-actions rule. The later decision retains the native pointer image's
   2px blue edge without halos; it does not reuse the insertion-shadow treatment.
   The current separate hosts and rules above are the concrete consolidation
   targets, not evidence that their distinct semantics should be collapsed.
4. **Make the stories test presentation as well as geometry.** Label the existing
   placed Brick, source preview, insertion shadow, and native drag image clearly.
   Assert computed stroke/halo/radius and action visibility alongside dimensions.
   Include real pointer hover, keyboard focus, selected-without-focus, portal
   menu focus transfer, and cancellation. The plays at the research snapshot assert geometry,
   focus/selection state, and the ghost's absent `::after`; they do not assert
   normal hover paint or action colors. A green geometry test can therefore coexist
   with the black styling in this screenshot.
   [Current preview/placement assertions](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L431-L503),
   [Current shadow assertions](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L531-L605).

For the stories, restrict each scenario to valid fixture controls: `fixture=default`
is exposed globally but is not a module ID used by the sizing plays' selectors;
`emptyWall=true` cannot supply the placed Brick required by Preview/Placement.
The shadow play at that snapshot covers a new Row or empty Wall, leaving same-Row insertion under
shrinking, multiple Stacks, native pointer images, and menu interaction as distinct
coverage gaps. These follow directly from the current control options and test
entrypoints, rather than a need for a new test framework.
[Controls](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L337-L356),
[Preview/placement requirements](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L431-L503),
[Shadow destination](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/components/WallEditor.stories.tsx#L563-L585).

## Boundaries to retain

The catalog intentionally uses the authored component or animated preview;
placed content uses the module's saved spec renderer. Shared presentation does
not mean forcing those different content paths into one renderer. Size parity
requires equal effective content, state, spec, and available width. Generated
saved content can intentionally differ from its catalog example.
[Preview renderer selection](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/ModulePreview.tsx#L95-L149),
[Placed saved spec](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L424-L441),
[Module-owned renderer boundary](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/make/makeModuleView.tsx#L141-L160).

The ghost is a visible-content clone and temporary drop target; native drag image
creation, route/session state, and persisted model commands remain their current
owners. Reuse appearance without rerendering a live module during dragging or
introducing another state owner.
[Capture and clone](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/ModulePreview.tsx#L61-L94),
[Ghost drop target](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/app/modules/lib/wall/WallEditor.tsx#L80-L108).

No active published-Wall renderer was found in the inspected App/Web/API/package
sources. Publication snapshots carry module state, saved border width, layout,
and Placement specs, while local subdomain routing currently leads to a proof
route. Do not create a public renderer or shared rendering package as part of
this cleanup; revisit that consumer when there is a real implementation to serve.
[Snapshot shape](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/zerospin/src/aggregates/user/snapshots/pageSnapshotSchemaV2.ts#L11-L39),
[Local subdomain routing](https://github.com/morgs32/qrk.sh/blob/1d3af7c89/apps/web/proxy.ts#L23-L37).

## Platform guidance supporting the cleanup

- Existing CSS owners can share visual constants through cascading custom
  properties; this does not require a new React component or styling dependency.
  [CSS Custom Properties, published W3C specification](https://www.w3.org/TR/css-variables-1/#using-variables).
- `cloneNode(true)` copies a node and its descendants, so cloning the content
  surface does not also copy its parent or sibling action controls. The historical
  card-parent dependency therefore had to be carried explicitly or removed from
  the surface's appearance contract; the approved cleanup removes it.
  [DOM cloning specification](https://dom.spec.whatwg.org/#dom-node-clonenode).
- Storybook supports returning cleanup from `beforeEach` for remount/navigation;
  its guidance preserves the story's final visible state until that cleanup.
  This supports keeping a real insertion scenario visible while making replay
  and cancellation explicit, without adding a production shadow test API.
  [Storybook interaction-test lifecycle](https://storybook.js.org/docs/writing-tests/interaction-testing#beforeeach).
