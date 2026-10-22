# Brick preview and editor conventions

**updated:** 2026-10-21

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

Each new Page starts with four Walls, each with one Section and an empty Stack.
Moves and Brick deletion prune empty Rows, Stacks, and Sections. Stack capacity
is 1 / 2 / 3 / 4 per Section at sm / md / lg / xl, counted after move cleanup.
Rows share available horizontal space subject to module minimum widths, with
natural content height and no
arbitrary Placement-count cap. Each Row scrolls horizontally when its minimums
do not fit, without widening neighboring Stacks or changing saved order.
The former `Page.wallId`, `Wall.label`, `Brick.wallId`, Placement grid geometry,
visibility, and duplicated breakpoint attribute are removed. Placement derives
its breakpoint directly from its Wall.

## Frame and content rendering

The shared `WallBreakpointPane` retains the 48px decorative browser bar,
breakpoint fitting/selection, and reduced-motion behavior. Four panes remain
mounted; only the active Wall registers drag sources and targets. App's
`WallEditorProvider` queries Walls with separate Placements/Bricks and resolves
their layout references through `makeWallLayoutView`. It stages commands through the existing
session from `UserUI.useSession()`. App initializes a connected session;
Storybook initializes a real local mock with complete seed resources. Both mount
the same `WallEditorProvider`, shared `WallTree`, and Brick form. Storybook's
memory router and viewport contexts supply route/visual inputs; edits use ordinary
commands and reactive queries rather than local fixture mutations.

A placed Brick fills its Row cell, whose minimum width comes from its module.
It uses the containing Wall's logical breakpoint and Placement spec, regardless
of cell width. Catalog
preferred widths do not constrain placed content. Every module has a 320px
minimum except Swatch and Icon at 160px, constant across all breakpoints.
Module links, inputs, forms, and provider states remain interactive. Drag grips and menus are siblings of
content rather than a wrapping button or selection overlay.

Every module accepts null as unconfigured content and provides its module-owned
placeholder and blank form draft. Catalog/Storybook example defaults remain
separate. Editing shared content affects all four Placements; arrangement and
spec changes affect only their Wall/Placement.

## Insertion, movement, and selection

Insertion targets carry Wall identity and stable before-sibling IDs. A Row target
inserts horizontally; a Stack boundary creates a Row; Section/Wall targets create
required containers. Nullable before IDs append. The Wall has no Add/plus buttons;
modules enter through catalog drag grips. Targeted catalog URLs still open add
mode without persisting a reservation. Cancelling/leaving/changing breakpoint
clears that mode; stale or malformed targets refuse rather than append elsewhere.

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
The Wall remains available as a drop target.
Stable insertion anchors are validated before cleanup; self-before moves remain
no-ops.

Wall layout containers have zero padding and no gaps between adjacent content.
Stack chrome and drag insertion boundaries overlay the layout. Empty persisted
Rows/Stacks, including initial Page scaffolds, show drop placeholders until a
move cleans their Wall or deletion empties their ancestor path; spacing is not
used to host controls.
Row before/after drop zones create Rows; the middle resolves horizontal
Placement insertion. Each Row's content scrolls inside its indicator host, so
Row before/after indicators remain visible outside the scrollport. Stock drop
instructions use the innermost eligible container, and blocked destinations do
not fall through. Blank Wall below the last Section creates a Section.

Selected means a Brick's edit form is open. Active means DOM focus, including
keyboard focus. Controls appear on hover, focus, selection, and open menus, with
touch access. Edit/Delete menus are keyboard-accessible. The Delete confirmation
supports cancellation and restores focus to its trigger or a surviving control;
accepted drag actions are announced. Whole-Row
and Section dragging, container deletion, hiding, resizing, and production zoom
remain outside the feature.

## Development preview: Brick and Stack drops

The separate `/dev/page/<pageId>/<breakpoint>` preview accepts new
default-variant Bricks from its compact palette and moves existing Placements
through their grips. Occupied Stacks have a separate left-hand grip that moves
all their Rows and Placements together. All moves stay within the selected Wall.
Its empty Wall fills available height with a 320px minimum; a
populated Wall retains a full-width bottom drop zone with a 320px minimum.

The pointer selects the destination: a compatible Row appends horizontally;
an incompatible Row creates a Row immediately below itself in the same Stack;
blank Stack space appends a Row; and the Wall bottom creates a Section, Stack,
and Row. There is no search for an available Row elsewhere. Initial empty
Section/Stack scaffolding is reused on the first drop. Stack drops on the left
or right half of another Stack insert before or after it in that Section;
Section background appends it, and the Wall bottom creates a Section containing
the moving Stack. Existing `moveStack` validation determines capacity after
empty-container pruning. Empty scaffold Stacks are not draggable. Unchanged
positions, invalid destinations, and cancelled/outside drops stage no command.
Side-Stack creation for individual Bricks and between-Section insertion remain
deferred for this preview.

Shared module-version declarations own each variant's sizing metadata; React
views consume it. A Row accepts a new Brick only when its existing contents
and the incoming variant can share and their combined minimum widths fit the
rendered Row. An empty Row can accept variable-height content; a nonempty Row
can contain only fixed-height variants. Different fixed heights may share.
No persisted exclusive-Row flag or Article-specific branch is needed.

The browser's `resolveBrickDrop` applies compatibility and measured-width rules
for both feedback and submission. `addBrick` checks the shared `canShareRow`
rule before mutations, rejecting an incompatible destination rather than
rerouting it. Pixel-width fitting remains in the browser. These checks apply
to additions only: `movePlacement` and the production editor's movement
behavior are unchanged, and existing mixed Rows are not repaired.

A successful local stage stays on the development page without opening a Brick
form. It retains ordinary creation of shared null Brick content and four
Placements; the other three Walls append new Rows through the existing command.
Cancelled, foreign-Wall, malformed, and stale drops create nothing. The same
destination drives the highlight or insertion line and is recomputed on drop.
See [Plan 038](./archive/plans/038-plan-development-brick-drops.md) for implementation
and pending verification.

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
