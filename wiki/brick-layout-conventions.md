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

The **Bricks** catalog and module detail routes retain previews, module metadata,
forms, and links. Active-breakpoint measurement and declared/minimum sizing
remain for previews. They have no drag attributes, payload store, insertion
gating, or all-breakpoint drag measurements.

`GridItemPreview` remains a sizing primitive; its name does not imply an installed
grid renderer. Module-owned interactions, including image-upload drag/drop, remain.

## Retained models and ownership

- Each Page references a Library Wall created atomically by `createPage`.
- Shared module state lives on Brick. Placement retains breakpoint-specific
  `gridItem`, Spec, visibility, and nullable pixel measurements.
- App's brick detail scopes live queries to the current page's wall and uses
  the authenticated user session. Frame rendering queries no wall content.
- Library retains its standalone session and the
  `/qrk-library-command-query-v1` backup path. Session owners stay mounted
  across child routes; settings drafts and viewport preferences remain separate.
- `updateBrick`, module configuration/completion, spec generation, and measurement
  behavior remain. Grid insertion, removal, layout, compaction, and visibility
  commands are removed without replacement APIs.
- QRK owns publication snapshots and history; the retained placement schemas
  continue to participate in serialization.

The obsolete grid drop and grid-item workflow documents are retired. Historical
research and archived plans remain records of the former implementation.
