# Brick preview and editor conventions

**updated:** 2026-10-20

## Empty browser frames

App's page editor and standalone Library keep four browser frames at
360 / 720 / 1080 / 1440px for `sm` / `md` / `lg` / `xl`. Their shared
`WallBreakpointPane` owns the 48px decorative browser bar and breakpoint slide.
Every frame body is an empty white region. No site navbar, placed-brick renderer,
Tree, placeholder, or page-name node is included in phase 1.

The viewport provider retains breakpoint fitting and selection. Catalog previews
follow the active breakpoint. Drag gesture state, grid scroll compensation, and
navbar offsets are removed; drawer sizing and transitions remain.

## Browse-only catalogs

The **Bricks** catalogs render only the authored Component at the module's
resolved preferred width, capped at the active breakpoint's canonical width.
Library and App module details compare **Component** and **JsonRender** at all
four breakpoints, using the same resolved width for each pair and height supplied
by content. App saved-brick fallback previews use the same width rule.
Wide rows scroll horizontally. Library retains Generate spec and generated JSON;
generation changes only its JsonRender previews.

Previews retain module metadata, forms, links, card appearance, and module-owned
interactions, including image-upload drag/drop. They have no grid sizing, intrinsic
probe, size diagnostic, drag payload, or insertion gating. Each view declaration
requires `default.defaultWidth` in pixels; optional `sm`/`md`/`lg`/`xl` overrides
resolve through `viewFor(breakpoint)`. Missing overrides use the default directly.
The preferred width imposes no minimum or persisted geometry. Browser frames
retain their canonical widths. Views have no `w`, `h`, `minW`, `minH`, or
measurement flags. Link uses a CSS half-width copy
column with normal wrapping. Map Place owns a 200px CSS minimum height and keeps
Mapbox resizing; GitHub Activity keeps calendar scrolling and fades.

## Retained models and ownership

- Each Page references a Library Wall created atomically by `createPage`.
- Shared module state lives on Brick. Placement retains breakpoint-specific
  `gridItem`, Spec, visibility, and generation/revisions; pixel measurements are removed.
- App's brick detail scopes live queries to the current page's wall and uses
  the authenticated user session. Frame rendering queries no wall content.
- Library retains its standalone session and the
  `/qrk-library-command-query-v1` backup path. Session owners stay mounted
  across child routes; settings drafts and viewport preferences remain separate.
- `updateBrick`, module configuration/completion, and spec generation remain.
  State saves stage synchronously without hidden rendering or measurement waits.
  Grid insertion, removal, layout, compaction, and visibility
  commands are removed without replacement APIs.
- QRK owns publication snapshots and history; the retained placement schemas
  continue to participate in serialization.

The obsolete grid drop and grid-item workflow documents are retired. Historical
research and archived plans remain records of the former implementation.

## Local cutover outcome

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
