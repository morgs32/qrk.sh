# Brick preview and editor conventions

**updated:** 2026-11-02

## App owns saved editing

App is the persisted editor. A Page owns shared Bricks and four Walls at
360 / 720 / 1080 / 1440px (`sm` / `md` / `lg` / `xl`). Wall contains ordered
Sections, Section contains ordered Stacks, Stack contains vertical Rows, and
Row contains side-by-side Placements. Each Brick has one deterministic Placement
per breakpoint. `Wall.layout` stores Section, named Stack, and Row nodes whose
ordered arrays reference Placement IDs. The nodes retain stable IDs without
separate tables, parent columns, or numeric sibling positions. Brick content and
Placement specs/revisions/generation remain separate records. Placement's direct
`wallId` identifies its Wall and breakpoint. Canonical declarations and commands
live in the QRK user aggregate; Wall and Brick bind directly to its Page table.

Each new Page starts with four Walls whose layouts are `{ sections: [] }`.
The first Brick drop creates the required Section, Stack, and Row. Moves and
Brick deletion prune only the emptied source ancestry; unrelated empty Rows,
Stacks, and Sections remain. Stack actions can insert an empty named Stack to
the left or right. Empty Stacks retain their actions and accept Brick drops.
Stack capacity follows content minimums rather than breakpoint count caps.
Stacks receive equal widths when possible; a Stack whose widest Row requires
more keeps that minimum while the other Stacks share the remainder. Empty
Stacks reserve 160px plus the existing cell gap allowance. Widths are automatic,
not saved Stack preferences. Fit uses the authored Wall width, independently of
the editor viewport. The Section track budget is the Wall width plus one gap;
each Placement cell minimum includes its module minimum plus one gap.
Rows span their Stacks. Their Brick groups use each Placement’s saved positive
`widthWeight` as its preferred width in CSS pixels, initially the module default.
When the group must shrink, it distributes width proportionally with module
minimums as floors. A Row can save a preferred group width including interior
gaps, and its Bricks then share that width according to their weights. The group
aligns Left, Center, or Right inside the Row. Left is the default. Each Row owns `minHeight`: null selects
automatic module preferred heights; a saved pixel minimum replaces that preference.
The shared 45px floor, module minimums, and taller content or insertion shadows
can grow the Row, and every visible surface stretches to match. There is no
arbitrary Placement-count cap. Commands reject additions and moves whose
candidate Section cannot fit without violating module minimums. Site gap changes
check every Page and Wall before saving. An unavailable destination does not
silently wrap into another Row. New Bricks use a fresh Section at an inactive
breakpoint only when the usual last-Stack/new-Row destination cannot fit.
Plan 050 uses a clean local/deployed Zerospin data cutover, without legacy rules.
The former `Page.wallId`, `Wall.label`, `Brick.wallId`, Placement grid geometry,
visibility, and duplicated breakpoint attribute are removed. Placement derives
its breakpoint directly from its Wall.

## Frame and content rendering

The shared `BrowserChrome` renders the 48px decorative browser bar, sticky
inside PageLayout's full-width editor scroll region. `PagePreview` owns the
full-width frame. Each `BREAKPOINTS.previewWidth` is an exact page content width
(360, 720, 1080, or 1440px). `PreviewSection` is one centered element and solely
owns the shared 1px zinc side borders. Its border-box width is the selected
content width plus `2 * PREVIEW_BORDER_WIDTH`, with no max-width clamping.
Thus a 720px page occupies 722px including its borders. The browser bar owns its
real top border and bottom divider; the navbar and footer keep their own local
horizontal separators. There is no outside ring or full-frame outline.
Section-local padding remains inside the exact page content width. Container
queries retain their existing thresholds; surrounding gutters remain open to
hovered Bricks and their controls. Browser and footer corners remain rounded.
PageLayout owns breakpoint fitting/selection. `useBreakpointGuard` stores
`max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH)` as available content
width, so the guard, ValidBreakpoint, and floating breakpoint controls share one
availability boundary. The minimum page needs 362px including borders; labels
continue to show nominal content widths. Only the fitting URL-selected frame
mounts the canvas. Its `.wall-preview-viewport` contains the editor scroll region
with its drawer spacer, toolbar anchor, and Drawer as siblings. There is no
nested preview scroll container. The optional sticky site navbar sits below the
browser bar. Storybook gives the frame the same content-plus-borders minimum
width and scrolls oversized selections horizontally instead of shrinking them.
Drawer spacing, scroll anchoring, toolbar
positioning, and drawer animation keep their existing behavior. The Bricks list
and individual Brick drawer screens keep the floating breakpoint toolbar visible
above the drawer; selecting a breakpoint keeps the current drawer screen open.
Both floating toolbars keep a 38px height and concentric corners: the buttons'
8px radius plus their 5px inset (4px padding and 1px border) gives the shell a
13px radius. The URL-selected breakpoint is bold, fully opaque, and disabled;
other unavailable breakpoints remain disabled and dimmed.
App's `PagePreview` queries the Wall with separate
Placements/Bricks through `useSession(userSessionDefinition)` and resolves layout references
through `makeWallLayoutView`. App initializes a connected session; Storybook
initializes a real local mock with complete seed resources and renders the same
`PagePreview` with a Bricks Drawer. Storybook's memory router and local width
control supply route/visual inputs; its Brick-detail route returns to the Wall
without mounting edit forms. Drops and deletion use ordinary commands and
reactive queries rather than local fixture mutations.

Placed Bricks use zero flex basis and normalized growth weights, filling their
Row horizontally. An existing-Row insertion shadow contributes its module
preferred width as a temporary weight. A new-Row or empty-Wall shadow starts at
the module’s preferred width and caps it at the available width. Cell minimum
widths include the configured Brick gap for two
half-gap padding insets; outer half-gap allowances remain unchanged.
Each Row applies a common surface-height floor plus gap insets. Null `minHeight`
uses the tallest member or incoming shadow’s module preferred height; an explicit
minimum replaces that preference. Module minimums and the shared 45px floor still
apply. Natural content may grow beyond this floor. Placement and shadow cells
remain column flex containers whose content hosts and module roots stretch.
Leaving or cancelling removes the shadow’s temporary contribution. Catalog and
native pointer previews retain their own module sizing. Drag-start height
measurements still serve stable drop targeting independently of rendered sizing.
It uses the containing Wall's logical breakpoint and Placement spec, regardless
of cell width. Every module has a 320px
minimum except Swatch and Icon at 160px, constant across all breakpoints.
Module links, inputs, forms, and provider states remain interactive. Menus are siblings of
content rather than a wrapping button or selection overlay.

Each module's required `hasPlaceholder` flag declares whether null is valid state.
Modules declaring `true` provide their module-owned placeholder and blank form
draft. Swatch and Icon declares `false`, has no placeholder renderer, and requires
configured color/icon state. Catalog/Storybook example defaults remain separate.
Editing shared content affects all four Placements; arrangement and spec changes
affect only their Wall/Placement.

## Insertion, movement, and selection

Query-encoded insertion targets carry Wall identity and stable before-sibling IDs. A Row target
inserts horizontally; a Stack boundary creates a Row; Section/Wall targets create
required containers. Nullable before IDs append. The Wall has no Add/plus buttons.
Targeted catalog URLs open add
mode without persisting a reservation. Cancelling/leaving/changing breakpoint
clears that mode; stale or malformed targets refuse rather than append elsewhere.

`ModulePreview` owns current local preview state and passes it to the optional
module `preview({ state, setState, isActive })` callback. `isActive` requires an
intersecting preview, a visible document, that preview not being dragged, and no
reduced-motion preference. Swatch and Icon cycles colors and SVGs every two seconds through
discrete local updates and pauses while inactive; these ticks create no model
operations.

Drawer module previews are copy drag sources carrying the module ID and the
committed creation-state snapshot. Drag start freezes that rendered snapshot, so
the native copy, insertion shadow, and created Brick agree. Catalog Add reads the
current preview state; static module-detail Add supplies its displayed
`defaultState`. Placeholder-backed modules use null. Their desktop native preview
copies the rendered
Brick, offset from the pointer by 16px horizontally and 8px vertically with the
library's `pointerOutsideOfPreview` helper. The production Wall accepts these
templates subject to module Page limits:

- A compatible Row's top/bottom quarters create a Row before/after. Its middle
  half inserts a Placement at the hovered Brick's left/right boundary.
- An incompatible Row uses top/bottom halves to create a Row before/after.
- An empty Row accepts its first Placement; exposed Stack background appends a
  Row. Empty Row/Stack destinations highlight their existing area.
- A Wall with no Sections highlights its remaining browser content area and
  accepts its first Brick. Populated Walls expose no new Section/Stack targets
  outside the existing layout.

Saved Wall Bricks move only from their dedicated grip. Their
content retains text selection, links, controls, and ordinary click selection.
The canvas accepts existing and new Row destinations across the current Wall's
existing Stacks and Sections. On compatible populated Rows, the top/bottom 8px
create Rows above/below; the remaining area chooses a horizontal insertion seam.
Incompatible Rows use top/bottom halves for separate Rows. Empty Rows accept a
Placement directly; empty Stack backgrounds create their first Row. These gestures
create no Stacks or Sections.

The source remains in place at 40% opacity with the existing native preview.
A noninteractive 2px blue line marks existing-Row insertion vertically and new-Row
insertion horizontally, without changing geometry. A boundary remains owned by
its visible Row even when the command anchors before the next Row. Selection and
the open drawer remain unchanged. Cancellation, outside drops, invalidated
destinations, and unchanged order stage no command; replacing a singleton source
Row at its current position is also suppressed. A changed drop stages one
`movePlacementToRow@4` or `movePlacementToNewRow@3` after checking current source,
compatibility, anchors, and candidate fit. Rehearsal uses disposable IDs; a
changed accepted drop stages one command. A rejected central Row destination
does not fall through to its parent Stack's append target. Explicit Row-creation
edges remain available when their candidate fits.

Drawer-template insertion feedback opens temporary space using a 40%-opacity copy
of the drawer's complete `BrickWrapper` surface, without an added border, outline,
or halo, without rerendering its module or reading providers. The shadow occupies a Placement slot in a Row, a new Row
in a Stack, or the first slot in an empty Wall. Its content is inert and ignores
pointer events; its host accepts drops at the visible slot's stable
before-Placement or before-Row destination. Each Row's drop-target wrapper owns
its real content and its before/after shadow. Local feedback keeps the owning
Row separate from the canonical before-Row destination, so after Row A remains
owned by A even when the command names Row B. Both Row instructions and Placement
eligibility use the enclosing wrapper's top and the natural Row height captured
at drag start. The shadow can move its content without moving its own
combine/reorder boundaries. Its own drop target and committed destination remain;
stickiness is unchanged. Temporary space clears on drop, cancellation, or outside
movement without persisted fake Rows. See the [library source research](./research/pragmatic-drag-shadow-stability.md)
for the enclosing-target pattern and its combine-zone adaptation.

Feedback and drop commands use the same stable insertion destination. Hover
writes no model data; cancellation, outside drops, invalid source data, and stale
destinations create nothing. A valid template drop stages one `addBrick@3` command.
Adding requires explicit state, decodes it with the selected module's schema,
and accepts null only for `hasPlaceholder: true` modules. It creates the shared
Brick content and all four Placements atomically. Swatch and Icon uses its captured
color/icon state; `updateBrick@3` rejects null for it under the same policy.
The active Wall follows the target; other Walls append a new Row to the last
Stack, creating missing parents when needed. A successful local stage opens the
new Brick form; cancelling that form leaves the created snapshot unchanged.
The four concrete Placement move commands name their structural effect:
`movePlacementToRow@2` targets an existing Row and enforces `canShareRow`;
`movePlacementToNewRow@1` requires `newRowId`; `movePlacementToNewStack@1` requires `newStackId` and
`newRowId`; `movePlacementToNewSection@1` requires all three new container IDs.
The source Placement determines the Wall. There is no generic identity seed.
Each command validates ownership, destination membership, anchors, and unused
new IDs before atomically editing the hierarchy. Row-sharing checks use the
actual module/variant definitions and exclude the moving Placement from existing
members. `moveStack@1` is unchanged.
Moves keep Placement identity/specs or carry the complete Stack's Rows. The pure
layout module edits ordered arrays; commands record one update per changed Wall
with the required independent-record operations in an atomic batch. Delete
Brick confirms removal from all four widths. Movement prunes all empty containers
in the affected Wall after editing. Brick deletion removes its references and
records and prunes only ancestors emptied by that deletion. Unrelated empty
containers remain untouched. Array order needs no sibling renumbering.
Stable insertion anchors are validated before cleanup. Concrete Placement moves
that preserve order, including self-before, before-current-successor, and appending
an already-last Placement, record no update and perform no cleanup.

The Wall background is white, except
for its existing empty-Wall drag highlight. Each Placement and insertion shadow
uses half the configured `Site.brickGap` (default 0px) as padding; the Wall's outer half-gap
allowance preserves content dimensions and alignment at the perimeter.
The full-width preview frame has no border; PreviewSection owns each centered
section's real zinc-300 side borders, and the browser bar owns its real top border
in the same color. The footer closes the frame with a zinc-300 bottom border.
PreviewSection's outside gutters preserve editor-control overflow without
changing Brick gaps; saved Row contents must still fit the Section.
Saved content borders and flat/card appearance belong to BrickWrapper in every
presentation, rather than separate catalog and Wall treatments.
Target boxes still touch; the shadow temporarily participates in layout at its
insertion destination. Capacity checks and the existing drop command path apply
to that destination.
Stacks retain a 50px minimum height. Stack names overlay the layout, inset 1px inside the border. Empty persisted Rows/Stacks retain their layout
containers until a move command cleans their Wall or deletion empties their
ancestor path. Production PagePreview renders saved layout with direct Edit controls
and hosts WallEditor for drawer drop targeting and insertion feedback. Brick Details
owns Delete in its header. The Wall Editor
story uses this preview while omitting the Brick Details panel.
The Wall Editor's Default and EmptyWall stories exercise production insertion
feedback. Preview Brick, Placement Brick, and Shadow Brick label their actual
representations and use scenario-valid fixture controls. The old hover-study
gallery and its mock stylesheet are removed; production components own paint.
Backend move commands remain available independently of the canvas.

Clicking ordinary placed-Brick content opens its edit form through the existing
route-owned selection. Clicking an already selected Brick keeps it selected.
Links, buttons, form controls, editable content, media controls, and action
controls keep their own interactions without selecting. MapCanvas owns its click
boundary so map gestures and controls remain usable. Modified or prevented clicks
and clicks following a text-selection drag do not select. When the Brick surface
itself has keyboard focus, Enter or Space opens the edit form. Interactive content
inside the Brick keeps its own keyboard behavior.

Clicking empty preview space, including gaps between Bricks and the gray
gutters, closes Brick Details and clears selection through the usual Close
behavior. A press that starts on a Brick or preview control and ends on empty
space keeps the drawer open.

StackAction displays the saved Stack name as plain text. Its chevron opens the
menu for inserting a Stack to the left or right.

The `renameStack` command checks authenticated ownership and current Wall
membership, then updates only the embedded Stack's name.

`BrickWrapper` owns intrinsic content sizing and self-contained flat/card appearance,
and stretches vertically inside a Wall Row.
Its outer surface allows visible overflow. Its internal `.brick-content` layer
owns content clipping, inherited corner rounding, and the query container.
Saved border paint remains at z-index 18, interaction paint at 19 outside the
clipping layer, and BrickAction at 20. StackAction retains its existing z-index
30 and Stack scope. The insertion shadow clones the complete
surface without editor actions or an added edge. The separate native pointer
image retains its 2px `#1F9BFC` edge, with no halos or card shadow.

Selected means a Brick's edit form is open. Active means DOM focus, including
keyboard focus. A shared 1px `#1F9BFC` content stroke and sharp same-blue halos
(30% opacity outside and 15% inside) decorate hover, focus, and selection without
changing layout. Selection can keep that content paint while focus is in the
drawer, but it does not force BrickAction visible. BrickAction appears only on
actual Brick hover or focus within; it has no selected/menu override or permanent
coarse-pointer fallback. StackAction retains its own left placement, Stack scope,
and existing coarse-pointer behavior. Both action surfaces use blue backgrounds
and white text/icons. StackAction paints a 1px same-blue top/left border outside its
1px inset, filling the corner without shifting the controls or their sticky alignment
with BrickAction.

The Brick action tab contains the drag grip.
Brick Details shows **Delete brick** immediately left of Close. It opens the
confirmation describing removal across all four breakpoints and cleanup of empty
containers. Cancel preserves the Brick and returns focus to **Delete brick**. A locally
successful delete closes the drawer; a staging refusal keeps the confirmation open.

On hover-capable fine pointers, the whole Placement temporarily rises above
neighboring Bricks at z-index 1, across Rows, Stacks, and Sections. Hover ending
restores normal stacking. Stack controls, browser chrome, menus, and floating
toolbars remain above it; focus, selection, and open-menu state do not raise it.
Placement isolation, internal decoration ordering, and viewport clipping remain.

Focus uses the shared content decoration. Each outer Row uses `flow-root` to contain its
flex element's -0.5px margin; 0.5px padding and a 49px minimum retain the Row's
48px outer minimum, content positions and widths, scroll range, Placement
padding/minimum widths, and drop geometry.
Container deletion, hiding, and production zoom remain outside the feature.
Pointer sizing uses the grips described below. The separate
`/dev/page/<pageId>/<breakpoint>` route is removed; its
historical implementation is recorded in
[Plan 038](./archive/plans/038-plan-development-brick-drops.md).

## Shared modules and Storybook

App owns module forms, renderers, React generators, components, CSS, and stories
under `apps/app/modules`. Zerospin owns shared module definitions, schemas,
catalogs, and model factories under `apps/zerospin/src/modules`. The Library
package is removed; API owns provider operations and browser RPC declarations. App's Bricks catalog and Brick
forms remain production routes. Shared visual forms use supplied submission
callbacks; App stages commands and Storybook edits local examples. Module-owned
normalization/provider logic stays in its module; session orchestration belongs
to App and survives form unmount until the session ends.

Each of the ten module playgrounds preserves Module metadata, Generate spec and
its prompt input, sm/md/lg/xl Component-versus-JsonRender previews, and Brick
Definition JSON. Example state, drafts, generated specs, errors, and loading are
local to the story. Live Generate spec uses the existing API Worker and a
server-held credential; fixture previews need no persisted user session. Existing
lookup/upload controls retain their API/environment wiring.

App catalog previews use the module's resolved preferred `defaultWidth`, capped
at the active breakpoint width. Shared module-version variant definitions own
the sizing, and React views consume those same values. Component/JsonRender comparisons share the resolved
width and natural content height and respect the module's `minWidth`; wide rows
scroll. Preferred widths impose no persisted geometry. Map Place retains its
200px CSS minimum height/Mapbox resizing,
GitHub Activity its calendar scrolling/fades, and Link its wrapping copy column.

## Persistence and publication

All saved creates, updates, moves, and deletes occur through registered commands.
Plan 047 pinned user owner release V8 and web Actor V8, using WallV2,
PlacementV2 and PageSnapshotV3. Concrete next-version commands bind those models;
new Placements get their module default width as a weight and new Rows get a null
minimum. V8 adds sizing commands while retaining those exact models and existing
commands. Retained releases V3–V7 keep their original declarations. V7 and V8 evaluate
supported retained creation/movement commands to initialize its own sizing data;
this change performs no storage reset or direct row backfill.

`movePlacementToRow` keeps the same payload across contract V1, V2 and V3.
V2 and V3 declare explicit identity `down` adapters so retained User V5 and V6
releases can replay V3 commands through both reverse edges. Each release still
evaluates its own program against its selected models; payload adaptation does
not copy model rows between releases.

`setRowWidthWeights` saves every current Row Placement's positive finite weight
in one command. The total must also be finite. Each Placement ID must appear
exactly once; submitted array order does not reorder the Row, and values are
stored without normalization. Stale, duplicate, missing, and foreign membership
refuse before updates are recorded. An empty list is valid only for an empty Row.
Only changed Placement weights produce model operations.

`setRowMinHeight` saves null for automatic height or a finite pixel minimum of at
least 45. It changes only the target Row, preserving its layout identity and
membership. Both commands verify ownership through Wall → Page → Site → User;
identical values record no model operations. Their values flow into existing V3
publication snapshots and saved-versus-published comparison.

### Pointer resizing

`WallEditor` calls `useWallResize` once. Its local React draft overlays one Row
while a primary mouse, pen, or touch pointer is captured. Internal divider grips
trade visible surface width between adjacent Bricks, clamping both module
minimums. The complete Row's resulting surface widths become its submitted
weights, preserving the other Bricks' visible widths even when minimums have
overridden the saved proportions. Gap padding stays outside those measurements.

The outlined outer width grip changes the whole Brick group. The opposite
edge stays anchored for Left and Right alignment, and the group stays centered
for Center alignment. The readout shows the occupied width including interior
gaps. Empty space remains available for drops. The Row tag sits flush with the
bottom edge beside the height grip and opens a menu for Left, Center, or Right
alignment. Row and Stack tags share their sizing tokens and menu styles.
Alignment and preferred width save independently through `setRowAlignment`
and `setRowPreferredWidth`.

Hovering over an empty Row or its tag outlines the full Row in the same blue as
a Stack. During a Brick drag, the drop indicator shows the target.

The bottom grip straddles the Row's bottom edge and changes its shared surface
height. Module minimums and natural content constrain the result. Release saves
the final rendered height as `minHeight`. Double-click or double-tap restores
automatic height (`null`).
An unchanged visible result preserves the original saved setting and stages no
command. Grips overlay the layout without consuming space, reveal on desktop
Row hover, and stay visible without hover. Native Brick/catalog dragging hides
and disables them. Divider hit areas sit on the following Brick's side of the
seam, keeping the preceding Brick's action buttons clear even on short Rows.

After the 3px drag threshold, one pointer-inert readout appears above the active
grip. A divider shows both neighboring surface widths in left-to-right order;
the bottom grip shows the Row's actual rendered surface height. Measurements
exclude gap padding and layout insets. The readout rounds to whole CSS pixels
for display while preview geometry and command values retain their fractions.
Content can hold a Row above its requested minimum, so the label measures the
rendered surface after preview layout and follows intrinsic height changes
through the existing Row observer. It stays visible during captured movement
outside Row hover and clears with the gesture on release or cancellation.
Taps and automatic-height reset do not flash a readout; constrained drags show
the actual unchanged size. Labels add no layout space or pointer targets.

Movement activates after 3px and previews coalesce to animation frames. Release
applies the final position and stages one existing V8 sizing command, with a
0.5px no-op tolerance and fractional geometry retained. The mounted live-query
store refreshes synchronously; staging and clearing the local draft require no
second optimistic cache or confirmation waiter. Existing session reporting owns
staging failures and later canonical reconciliation.

Escape, pointer cancellation, unexpected capture loss, window blur, unmount,
Wall/breakpoint changes, and changes to the active Row's ordered membership,
variants, saved sizing, gap, or available width discard the gesture. Changes to
other Rows do not. Keyboard resizing, numeric controls, auto-scroll, and Zustand
remain subsequent work.

The Actor grant map still excludes generic `movePlacement`; owners V3/V4 and their
generic declarations remain registered. Pre-V5 histories containing generic moves
still require framework historical-execution support before a retained-data or
production cutover.

The November 1, 2026 cutover used the user's explicit authorization to reset
only QRK's local backend and affected App session data. The backend backup is
`apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-row-drag-reset-20261101T204758Z`.
Nine Node and five discovery databases on `app.qrk.localhost` were reset, preserving
cookies, preferences, and the unrelated debug database. Fresh local V5 initializes;
API storage, credentials, and production were untouched. This authorization does
not cover the separate framework `36` storage migration.

The earlier Swatch creation cutover removed obsolete creation paths and adapters
rather than preserving null Swatches. Its reset authorization remains separate.
App initialization/disposal, optimistic queries, refusals, and provider completion
retain their existing session owner. Local staging Success is distinct from a
finalized canonical outcome. Spec/provider completions retain revision/request
checks and tolerate deleted Bricks.

The App session binds User V10 and Web Actor V10, using Wall V3 and PageSnapshot V4. Editable historical
Rows use their existing saved weights without rewriting Placement data. V4
publish commands carry the new sizing rule and Row settings. Adapting historical
publish commands keeps the legacy V3 snapshot representation.

Immutable publication snapshots contain shared Bricks once and all four ordered
Wall → Section → Stack → Row → Placement/spec hierarchies, including Row minimum
heights and Placement width weights. The current snapshot builder also drives
saved-versus-published comparison, so movement changes dirty state. Generation,
revisions, and editor bookkeeping stay outside snapshots. Public website rendering
remains deferred.

[Plan 039](./archive/plans/039-plan-wall-owned-layout-tree.md) replaces the old layout
tables with the Wall-owned tree. The authorized local hard cutover preserves the
previous backend at
`apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-plan039-20261021T222956Z`.
Old App/Library browser partitions and unsent work, authentication, preferences,
uploads, unrelated stores, and production data remain preserved without a
compatibility reader or import. Implementation and runtime verification belong
to that plan. The older reset below records a separate historical authorization.

## Historical Plan 031 cutover outcome

[Plan 031](./archive/plans/031-plan-component-jsonrender-previews.md) records the approved
discard of affected local Library/App browser data and the local `sys_qrk_sh_1`
backend store, without backups or an authored namespace change. Chrome Library/App
data and the backend were explicitly reset, and fresh Library and authenticated
App initialization passed. An old SharedWorker initially blocked the in-app
browser's legacy Library deletion. After the desktop app was restarted, that exact
legacy database was already absent; explicit deletion completed successfully.
Library reopened its current 19.0.0 partition, preserving it and the unrelated
debug database. All four Component/JsonRender comparisons initialized. Generation
passed after the user refreshed the API credential and only API was restarted:
JsonRender and generated JSON changed while the authored Component stayed unchanged.
At the original 15.0.1 cutover, Library's standalone key excluded the session lock.
The later 18.0.0 adoption added the complete canonical session lock to partition
identity, and 19.0.0 retains that storage model. The authored backup path remains
unchanged. Connected App identities include the session lock; only matching local
nodes/discovery entries were deleted.
Earlier origins, unrelated databases, cookies, preferences, uploads, and deployed
storage were preserved.

## Brick dimension stories

Preview, placed, and shadow content use the existing BrickWrapper surface with
self-contained flat/card styling. Preview surfaces retain natural height;
placed and shadow surfaces fill their Row's tallest content. Without a taller
neighbor, equal content widths, state, and effective spec produce matching
heights independently of hover, focus, selection, or saved border width. Placement and shadow cells share
`flex: 0 1 auto`; inline preferred/minimum widths include the configured Brick
gap as two half-gap insets, including the empty-Wall perimeter allowance.

Preview Brick, Placement Brick, and Shadow Brick label the actual
representations rather than implying that every Brick in a story is a shadow.
Each scenario exposes only valid fixture controls. The shadow scenario uses the
production drag path, remains visible for inspection, and cancels without a drop.
The native pointer image is a separate presentation with its retained 2px blue
edge. Paint/action-visibility assertions complement geometry checks, and real
pointer interaction verifies CSS hover.

Equal Height Rows and Equal Height Rows With Gaps exercise mixed-height Figma
and Swatch surfaces across all four breakpoints, with zero-gap flat and 12px-gap
card appearances. Their command-backed drop and deletion checks verify Row
growth, shorter-shadow stretching, equality after placement, and natural shrink
after leaving, cancellation, or removal.
