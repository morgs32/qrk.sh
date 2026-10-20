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

The **Bricks** catalogs render only the authored Component at the active
breakpoint's canonical width. Library and App module details compare **Component**
and **JsonRender** at all four canonical widths, with height supplied by content.
Wide rows scroll horizontally. Library retains Generate spec and generated JSON;
generation changes only its JsonRender previews.

Previews retain module metadata, forms, links, card appearance, and module-owned
interactions, including image-upload drag/drop. They have no grid sizing, intrinsic
probe, size diagnostic, drag payload, or insertion gating. View declarations have
no `w`, `h`, `minW`, `minH`, or measurement flags. Link uses a CSS half-width copy
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

## Local cutover status

[Plan 031](./plans/031-plan-component-jsonrender-previews.md) records the approved
discard of affected local Library/App browser data and the local `sys_qrk_sh_1`
backend store, without backups or an authored namespace change. Source changes
are implemented. Chrome Library/App data and the backend were explicitly reset,
and fresh authenticated App and Library initialization passed. The in-app browser
Library deletion remains blocked by an old SharedWorker; fully quitting/reopening
the desktop app is required before exact deletion is retried. Only Library remains
paused so its worker cannot reopen on restoration; other local services remain running. Generation
passed after the user refreshed the API credential and only API was restarted:
JsonRender and generated JSON changed while the authored Component stayed unchanged.
Library's unchanged standalone path hashes authored scope rather than the schema,
so a changed schema does not isolate its old database. Connected App identities
include the session lock; only matching local nodes/discovery entries are deleted.
Earlier origins, unrelated databases, cookies, preferences, uploads, and deployed
storage remain outside this cutover.
