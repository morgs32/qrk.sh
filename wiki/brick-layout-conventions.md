# Brick preview and editor conventions

**updated:** 2026-10-29

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
The first Brick drop creates the required Section, Stack, and Row. Existing
persisted layouts are unchanged. Moves and Brick deletion prune empty Rows,
Stacks, and Sections. Stack capacity
is 1 / 2 / 3 / 4 per Section at sm / md / lg / xl, counted after move cleanup.
Rows lay out Bricks at their module preferred widths and shrink them toward
module minimum widths when crowded, with natural content height and no arbitrary
Placement-count cap. Each Row scrolls horizontally when its minimums
do not fit, without widening neighboring Stacks or changing saved order.
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
App's `PagePreview` queries the Wall with separate
Placements/Bricks through `UserUI.useSession()` and resolves layout references
through `makeWallLayoutView`. App initializes a connected session; Storybook
initializes a real local mock with complete seed resources and renders the same
`PagePreview` with a Bricks Drawer. Storybook's memory router and local width
control supply route/visual inputs; its Brick-detail route returns to the Wall
without mounting edit forms. Drops and deletion use ordinary commands and
reactive queries rather than local fixture mutations.

A placed Brick and insertion shadow share the module preferred and minimum widths
with drawer previews. Their cells shrink without growing to fill unused Row space.
Placement and shadow cells share `flex: 0 1 auto`; their inline preferred and
minimum widths include the configured Brick gap for two half-gap padding insets.
An empty Wall preserves the same outer half-gap allowance. These rules retain
module content dimensions while allowing shrink without growth.
Each Row contains a flex scroll element with Placements and any temporary
insertion shadow.
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
library's `pointerOutsideOfPreview` helper. Saved Wall Bricks are not drag sources.
The production Wall accepts these templates subject to module Page limits:

- A compatible Row's top/bottom quarters create a Row before/after. Its middle
  half inserts a Placement at the hovered Brick's left/right boundary.
- An incompatible Row uses top/bottom halves to create a Row before/after.
- An empty Row accepts its first Placement; exposed Stack background appends a
  Row. Empty Row/Stack destinations highlight their existing area.
- A Wall with no Sections highlights its remaining browser content area and
  accepts its first Brick. Populated Walls expose no new Section/Stack targets
  outside the existing layout.

Insertion feedback opens temporary space using a 40%-opacity copy
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
destinations create nothing. A valid drop stages one `addBrick@3` command.
Adding requires explicit state, decodes it with the selected module's schema,
and accepts null only for `hasPlaceholder: true` modules. It creates the shared
Brick content and all four Placements atomically. Swatch and Icon uses its captured
color/icon state; `updateBrick@3` rejects null for it under the same policy.
The active Wall follows the target; other Walls append a new Row to the last
Stack, creating missing parents when needed. A successful local stage opens the
new Brick form; cancelling that form leaves the created snapshot unchanged.
Moves keep Placement identity/specs or carry the complete Stack's Rows. The pure
layout module edits ordered arrays; commands record one update per changed Wall
with the required independent-record operations in an atomic batch. Delete
Brick confirms removal from all four widths. Movement prunes all empty containers
in the affected Wall after editing. Brick deletion removes its references and
records and prunes only ancestors emptied by that deletion. Unrelated empty
containers remain untouched. Array order needs no sibling renumbering.
Stable insertion anchors are validated before cleanup; self-before moves remain
no-ops.

The Wall background is light orange (`#E6AA80`, a 50% white tint of `#CC5500`), except
for its existing empty-Wall drag highlight. Each Placement and insertion shadow
uses half the configured `Site.brickGap` as padding; the Wall's outer half-gap
allowance preserves content dimensions and alignment at the perimeter.
The full-width preview frame has no border; PreviewSection owns each centered
section's real side borders, and the browser bar owns its real top border.
PreviewSection's outside gutters preserve overflow without changing Brick gaps.
Saved content borders and flat/card appearance belong to BrickWrapper in every
presentation, rather than separate catalog and Wall treatments.
Target boxes still touch; the shadow temporarily participates in layout at its
insertion destination. Capacity checks and the existing drop command path apply
to that destination.
Stack names overlay the layout, inset 1px inside the border. Empty persisted Rows/Stacks retain their layout
containers until a move command cleans their Wall or deletion empties their
ancestor path. Production PagePreview renders saved layout with Edit and Delete
controls and hosts WallEditor for drawer drop targeting and insertion feedback. The Wall Editor
story uses this preview while omitting the Brick Details panel.
The Wall Editor's Default and EmptyWall stories exercise production insertion
feedback. Preview Brick, Placement Brick, and Shadow Brick label their actual
representations and use scenario-valid fixture controls. The old hover-study
gallery and its mock stylesheet are removed; production components own paint.
Backend move commands remain available independently of the canvas.

Clicking ordinary placed-Brick content opens its edit form through the existing
route-owned selection. Clicking an already selected Brick keeps it selected.
Links, buttons, form controls, editable content, media controls, and action-menu
controls keep their own interactions without selecting. MapCanvas owns its click
boundary so map gestures and controls remain usable. Modified or prevented clicks
and clicks following a text-selection drag do not select. The existing Edit menu
remains the keyboard-accessible selection action; selection adds no tab stop or
button role around interactive Brick content.

Clicking the keyboard-accessible name button in StackAction opens Stack Details
and replaces Brick selection. The route owns the selected Stack, so reload and
Back/Forward restore it. A selected Stack has a 1px blue border overlay above its
Brick content and below its name tab. The overlay ignores pointer events and keeps
the name tab visible without changing layout or drop geometry. Missing or mismatched
Stack routes show Stack not found.

Stack Details edits only the name in the current breakpoint's Wall. Save trims
whitespace, rejects blank names, and remains in the drawer; unchanged names cannot
be saved. Cancel restores the saved name without closing. Selecting the same
Stack preserves the draft; leaving the drawer or switching breakpoints discards
it. Breakpoint changes leave the Stack route instead of selecting an unrelated
Stack in the next Wall.

`renameStack@1` checks authenticated ownership and current Wall membership, then
updates only the embedded Stack's name. Stack IDs, Rows, Placements, and other
Walls are preserved. The browser pins user owner V4 and web actor V4; owner V3 is
retained for history. Models are unchanged and no storage reset is required.

`BrickWrapper` owns intrinsic height and self-contained flat/card appearance.
Its outer surface allows visible overflow. Its internal `.brick-content` layer
owns content clipping, inherited corner rounding, and the query container.
Saved border paint remains at z-index 18, interaction paint at 19 outside the
clipping layer, and BrickAction at 20. StackAction retains its existing z-index
30 and Stack scope. The insertion shadow clones the complete
surface without editor actions or an added edge. The separate native pointer
image retains its 2px `#1F9BFC` edge, with no halos or card shadow.

Selected means a Brick's edit form or a Stack's name editor is open. Active means DOM focus, including
keyboard focus. A shared 1px `#1F9BFC` content stroke and sharp same-blue halos
(30% opacity outside and 15% inside) decorate hover, focus, and selection without
changing layout. Selection can keep that content paint while focus is in the
drawer, but it does not force BrickAction visible. BrickAction appears only on
actual Brick hover or focus within; it has no selected/menu override or permanent
coarse-pointer fallback. StackAction retains its own left placement, Stack scope,
and existing coarse-pointer behavior. Both action surfaces use blue backgrounds
and white text/icons.

The Brick menu uses Fragment's compact dropdown styling with inverted surfaces:
square white popup, 15px monospace text, tightly padded 20px rows, pale-gray
highlights, and a hard offset shadow. Delete retains its destructive color.

On hover-capable fine pointers, the whole Placement temporarily rises above
neighboring Bricks at z-index 1, across Rows, Stacks, and Sections. Hover ending
restores normal stacking. Stack controls, browser chrome, menus, and floating
toolbars remain above it; focus, selection, and open-menu state do not raise it.
Placement isolation, internal decoration ordering, and viewport clipping remain.

The Placement's noninteractive outer stroke, outset 0.5px, remains reserved for
an open portal menu because the portal can take DOM focus outside the Brick.
Focus uses the shared content decoration. Edit/Delete menus remain keyboard
accessible; Delete confirmation supports cancellation and restores focus to its
trigger or a surviving control. Each outer Row uses `flow-root` to contain its
flex element's -0.5px margin; 0.5px padding and a 49px minimum retain the Row's
48px outer minimum, content positions and widths, scroll range, Placement
padding/minimum widths, and drop geometry.
Container deletion, hiding, resizing, and production zoom remain outside the
feature. The separate `/dev/page/<pageId>/<breakpoint>` route is removed; its
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
The browser session pins user owner release V4 and web actor V4, with
`renameStack@1` alongside unchanged `addBrick@3` and `updateBrick@3`.
Owner V3 remains registered for history; the name editor changes no models and
requires no storage reset. The earlier Swatch creation cutover removed obsolete
creation paths and adapters rather than preserving null Swatches. The authorized
local reset first backs up QRK's Zerospin development storage and leaves remote
data, API storage, and credentials untouched.
App initialization/disposal, optimistic queries, refusals, and provider completion
retain their existing session owner. Local staging Success is distinct from a
finalized canonical outcome. Spec/provider completions retain revision/request
checks and tolerate deleted Bricks.

Immutable publication snapshots contain shared Bricks once and all four ordered
Wall → Section → Stack → Row → Placement/spec hierarchies. The same builder drives
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
natural height and self-contained flat/card styling. At equal content widths,
state, and effective spec their content boxes match independently of hover,
focus, selection, or saved border width. Placement and shadow cells share
`flex: 0 1 auto`; inline preferred/minimum widths include the configured Brick
gap as two half-gap insets, including the empty-Wall perimeter allowance.

Preview Brick, Placement Brick, and Shadow Brick label the actual
representations rather than implying that every Brick in a story is a shadow.
Each scenario exposes only valid fixture controls. The shadow scenario uses the
production drag path, remains visible for inspection, and cancels without a drop.
The native pointer image is a separate presentation with its retained 2px blue
edge. Paint/action-visibility assertions complement geometry checks, and real
pointer interaction verifies CSS hover.
