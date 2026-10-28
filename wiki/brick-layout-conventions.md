# Brick preview and editor conventions

**updated:** 2026-10-24

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
Rows share available horizontal space subject to module minimum widths, with
natural content height and no
arbitrary Placement-count cap. Each Row scrolls horizontally when its minimums
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

A placed Brick fills its Row cell, whose minimum width comes from its module.
The cell adds 1px to that minimum for its two half-pixel insets, preserving the
module's content minimum.
Each Row contains a flex scroll element with Placements and any temporary
insertion shadow.
It uses the containing Wall's logical breakpoint and Placement spec, regardless
of cell width. Catalog
preferred widths do not constrain placed content. Every module has a 320px
minimum except Swatch and Icon at 160px, constant across all breakpoints.
Module links, inputs, forms, and provider states remain interactive. Menus are siblings of
content rather than a wrapping button or selection overlay.

Every module accepts null as unconfigured content and provides its module-owned
placeholder and blank form draft. Catalog/Storybook example defaults remain
separate. Editing shared content affects all four Placements; arrangement and
spec changes affect only their Wall/Placement.

## Insertion, movement, and selection

Query-encoded insertion targets carry Wall identity and stable before-sibling IDs. A Row target
inserts horizontally; a Stack boundary creates a Row; Section/Wall targets create
required containers. Nullable before IDs append. The Wall has no Add/plus buttons.
Targeted catalog URLs open add
mode without persisting a reservation. Cancelling/leaving/changing breakpoint
clears that mode; stale or malformed targets refuse rather than append elsewhere.

Drawer module previews are copy drag sources carrying
`{ type: "drawer-brick", moduleId }`. Their desktop native preview copies the rendered
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

Insertion feedback opens temporary space using a 40%-opacity copy with the hover
style's dark border color and square corners
of the drawer's existing `.brick-hover-surface`, without rerendering its module
or reading providers. The shadow occupies a Placement slot in a Row, a new Row
in a Stack, or the first slot in an empty Wall. Its content is inert and ignores
pointer events; its host accepts drops at the visible slot's stable
before-Placement or before-Row destination. Each Row's instruction height is
captured at drag start while its top follows the current Row, preventing a
taller shadow from switching combine/reorder targeting. Temporary space clears
on drop, cancellation, or outside movement without persisted fake Rows.

Feedback and drop commands use the same stable insertion destination. Hover
writes no model data; cancellation, outside drops, invalid source data, and stale
destinations create nothing. A valid drop stages one `addBrick` command.
Adding creates shared null Brick content and all four Placements atomically.
The active Wall follows the target; other Walls append a new Row to the last
Stack, creating missing parents when needed. A successful local stage opens the
new Brick form; cancelling that form leaves the created null Brick.
Moves keep Placement identity/specs or carry the complete Stack's Rows. The pure
layout module edits ordered arrays; commands record one update per changed Wall
with the required independent-record operations in an atomic batch. Delete
Brick confirms removal from all four widths. Movement prunes all empty containers
in the affected Wall after editing. Brick deletion removes its references and
records and prunes only ancestors emptied by that deletion. Unrelated empty
containers remain untouched. Array order needs no sibling renumbering.
Stable insertion anchors are validated before cleanup; self-before moves remain
no-ops.

The Wall background is light orange (`#E6AA80`, a 50% white tint of `#CC5500`), except for its existing empty-Wall
drag highlight. Half-pixel padding on the content-height wrapper and each
Placement creates condensed 1px gaps between Bricks and around the content.
The full-width preview frame has no border; PreviewSection owns each centered
section's real side borders, and the browser bar owns its real top border.
PreviewSection's outside gutters preserve overflow without changing Brick gaps. Placed Bricks omit flat
surface borders; catalog flat borders and card treatment remain.
Target boxes still touch; the shadow temporarily participates in layout at its
insertion destination. Capacity checks and the existing drop command path apply
to that destination.
Stack names overlay the layout, inset 1px inside the border. Empty persisted Rows/Stacks retain their layout
containers until a move command cleans their Wall or deletion empties their
ancestor path. Production PagePreview renders saved layout with Edit and Delete
controls and owns drawer drop targeting and insertion feedback. The Wall Editor
story uses this preview while omitting the Brick Details panel.
The Wall Editor's Default and EmptyWall stories exercise the canonical shadow
feedback used by production WallEditor. The separate Large, Halo, and Shadow
prototype stories, styling, and prototype flags are removed, along with thin
drop indicators. The user chose the shadow approach; visual verification
remains with the user.
Backend move commands remain available independently of the canvas.

Selected means a Brick's edit form is open. Active means DOM focus, including
keyboard focus. Controls appear on hover, focus, selection, and open menus, with
touch access. Edit/Delete menus are keyboard-accessible. The Delete confirmation
supports cancellation and restores focus to its trigger or a surviving control.
Placement interaction borders use a noninteractive `::after` overlay outset
0.5px, centering the stroke on the shared 1px seam. White hover borders use
z-index 18; blue-500 open-menu and keyboard-focus borders use z-index
19 so blue wins across neighboring seams. Selection keeps actions visible without
drawing a border. Both remain below action tabs at
z-index 20. Each outer Row uses `flow-root` to contain its scroller's -0.5px
margin; 0.5px padding and a 49px minimum height allow seam-covering paint through
the clip while preserving the 48px outer minimum, content positions and widths,
scroll range, Placement padding/minimum widths, and drop geometry.
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
