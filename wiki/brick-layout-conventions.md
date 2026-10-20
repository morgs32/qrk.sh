# Brick preview and editor conventions

**updated:** 2026-10-20

## App owns saved editing

App is the persisted editor. A Page owns shared Bricks and four Walls at
360 / 720 / 1080 / 1440px (`sm` / `md` / `lg` / `xl`). Wall contains ordered
Sections, Section contains ordered Stacks, Stack contains vertical Rows, and
Row contains side-by-side Placements. Each Brick has one deterministic Placement
per breakpoint. Canonical declarations and commands live in the QRK user aggregate.
Wall and Brick bind directly to its final Page table.

Each new Page starts with four Walls, each with one Section and an empty Stack.
Empty Rows, Stacks, and Sections persist after movement/deletion. Stack capacity
is 1 / 2 / 3 / 4 per Section at sm / md / lg / xl. Rows use equal-width horizontal
cells with natural content height and have no arbitrary Placement-count cap.
The former `Page.wallId`, `Wall.label`, `Brick.wallId`, Placement grid geometry,
visibility, and duplicated breakpoint attribute are removed. Placement derives
its breakpoint through Row → Stack → Section → Wall.

## Frame and content rendering

The shared `WallBreakpointPane` retains the 48px decorative browser bar,
breakpoint fitting/selection, and reduced-motion behavior. Four panes remain
mounted; only the active Wall registers drag sources and targets. App's
`WallEditorProvider` queries saved models and stages commands through the existing
initialized user session. Shared `WallTree` components receive controlled
presentation and callbacks, allowing Storybook to use local fixtures.

A placed Brick fills its Row cell with `w-full min-w-0`. It uses the containing
Wall's logical breakpoint and Placement spec, regardless of cell width. Catalog
preferred widths do not constrain placed content. Module links, inputs, forms,
and provider states remain interactive. Drag grips and menus are siblings of
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
Moves keep Placement identity/specs or carry the complete Stack's Rows. Delete
Brick confirms removal from all four widths and retains containers. Sibling
positions are ordinary integer indexes renumbered in the same command.

Wall layout containers have zero padding and no gaps between adjacent content.
Stack chrome and drag insertion boundaries overlay the layout. Empty persisted
Rows/Stacks retain visible drop placeholders; spacing is not used to host controls.
At coincident flush boundaries, Brick/module drops use the Row edge centrally
and the outer corners for a new Section. Whole-Stack drops retain Section-boundary precedence.

Selected means a Brick's edit form is open. Active means DOM focus, including
keyboard focus. Controls appear on hover, focus, selection, and open menus, with
touch access. Keyboard Move dialogs use the same stable destinations as dragging,
announce accepted actions, and restore focus to surviving controls. Whole-Row
and Section dragging, container deletion, hiding, resizing, and production zoom
remain outside the feature.

## Shared modules and Storybook

The `@qrk.sh/library` package keeps production module definitions, forms,
renderers, generators, components, and CSS. Its standalone application, routes,
seeded session, worker, and startup are retired. App's Bricks catalog and Brick
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
at the active breakpoint width. Optional per-breakpoint preferred-width overrides
resolve through `viewFor`. Component/JsonRender comparisons share the resolved
width and natural content height; wide rows scroll. Preferred widths impose no
persisted geometry. Map Place retains its 200px CSS minimum height/Mapbox resizing,
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

Plan 036 uses the approved scoped backup-and-fresh-development cutover. Old
App/Library browser partitions, authentication, preferences, uploads, unrelated
stores, and production data remain preserved. Current implementation/verification
evidence belongs to [Plan 036](./archive/plans/036-plan-wall-tree-editor.md); the older
reset below records a separate historical authorization.

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
