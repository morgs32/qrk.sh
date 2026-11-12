# Modules

[`@qrk.sh/bricks`](../../bricks/package.json) owns Brick definitions, React
registries, forms, stories, and shared rendering code. App registers the views
in `modulesHash` and supplies the Link lookup callback in
[`linkView`](./link/linkView.tsx). The API Worker mounts
[`BricksApi`](../../bricks/worker/BricksApi.ts) at its root and owns uploads and
asset serving. The RPC target and its providers live in Bricks. Clients get its
declaration from the type-only `@qrk.sh/bricks/rpc` export.

## Development and configuration

Run root `pnpm dev` and open [Bricks Storybook](https://bricks.qrk.localhost/).
`pnpm nx run @qrk.sh/app:storybook` starts the separate App Storybook.

Bricks Storybook reads local settings from `apps/bricks/.env.local`:

1. `PUBLIC_MAPBOX_TOKEN` configures Map Place previews and falls back to the App setting.
2. `API_WORKER_ORIGIN` overrides the server-side API proxy destination, defaulting
   to `http://127.0.0.1:8787`.

App development, App static preview, and both Storybooks proxy same-origin
`/rpc` to `/` on the API Worker. App production uses the same rewrite through
Vercel. Both Storybooks also proxy `/upload`, `/image/upload`, and `/assets` and
load the shared Brick styles. Provider secrets stay in `apps/api/.env.local`.

## Previous Library move verification

Verified on 2026-10-21: App and API builds and the consolidated App Storybook
build pass. Chrome checks covered Link configuration, Article rendering/editing
and local save, Map Place tiles in Component/JsonRender previews, and wall-editor
Swatch editing with the saved value retained after closing/reopening the form.
The wall story exposes `stickyNavbar` as a boolean control (default `true`) on its
Site fixture. It shares SiteHeader with App: the site name is plain text, and the
navbar sticks within the preview only when the Site setting is enabled.
Wall checks use the existing in-memory mock session; no backend integration test,
persisted-data reset, or deployment was performed. All 13 former Library story
files are retained, and Nx discovers no Library project or dependency cycle.

## Brick forms

Module forms and their lookup controls use the
[Brick component library](../../bricks/src/components). Use `TextInput` for labeled
text, URL, search, and file fields and `ColorInput` for labeled hex fields
with a color-picker popover.
The Storybook [Form Inputs catalog](https://bricks.qrk.localhost/?path=/story/components-form-inputs--catalog)
shows these controls alongside `TextboxInput`, `NumberInput`, `PositionInput`, `SizeInput`,
`RadiusInput`, `BorderInput`, and `ShadowInput` under **Components → Form Inputs**.
Its Site Settings section demonstrates Cards, Brick gap, Sticky navbar, and
local image previews for the logo and light and dark favicons.
Border and Shadow use `ColorInput` inside their shared `SwatchPopover`.
Brick sidebar forms use [shadcn Base UI Field](https://ui.shadcn.com/docs/components/base/field)
and `FieldGroup` from the Bricks package. Put inline labels in a 100px column beside the control and
use `FieldContent` to stack descriptions, errors, and status below it. Text
fields in Figma Thumbnail, Link, Instagram, GitHub Repo, GitHub Profile, and
GitHub Activity stack their label above the control. Stacked fields leave 8px
between the label and control. Help text sits 4px below the control.
Integrated icons and actions use Input Group. The input comes first in DOM
order. The group draws the input’s focus and invalid rings, and tabbable
actions show their own focus. Number fields use the same surface around their
Base UI input and steppers.
The shared field tokens in `@qrk.sh/bricks/components/brickStyles.css` also style the
Style Inspector inputs.

Map Place uses Base UI Combobox for popup navigation and option announcements,
with Google Places supplying results. Swatch and Icon loads its Material Symbols
catalog on demand and searches and pages results locally. Results appear as
buttons with the current icon marked. Shadow shorthand reports a validation
error below the input and keeps the last accepted shadow.

QRK-owned forms set `autoComplete="off"`. The shared Input and native article
title/subtitle, hex color, and State JSON fields also set `autoComplete="off"`
and `data-1p-ignore="true"` to suppress browser and 1Password suggestions. The
shared Input applies these attributes after forwarded props. These are opt-out
hints; browsers and extensions control whether they honor them. Clerk-owned
login, signup, account, and password flows retain autofill. Private Meowdown popup
fields, including link editing and code-language search, remain unchanged. The
application's place and icon search suggestions remain available.

Modules expose `Render` for saved Brick content and may provide `InlineEditor`
or `Form` for editing. The Wall Editor mounts an inline editor in its Placement
and supplies save and flush callbacks. The selected Brick’s sidebar panel hosts a
form when the module provides one, or displays the Brick when it has no editor.
Studio provides `openDetails()` through
`BrickDetailsContext` for placed Bricks. Each module chooses which interactions
call it. Sidebar-form views wrap their `Render` in `BrickDetailsTrigger`. In the
catalog and on published pages, that component returns its children directly.

A placed Brick can use `useAfterBrickInserted` to run an action once after a
successful catalog drop. Article focuses its title and Image opens its form
through `BrickDetailsContext`. Swatch and Icon and other Bricks that omit the
hook simply appear. Moving a Brick, switching breakpoints, and reloading
supply no insertion signal.

Sidebar forms receive state and synchronous `onSave(state): IResult`. App
stages `updateBrick` and renders saved query state, including optimism and
rejection rollback. Storybook supplies example state. Null forms start blank.

Instagram, GitHub Profile/Activity/Repo, Figma Thumbnail, and Link commit valid
text after a 500 ms pause, on blur, or on Enter. Map Place commits a selected
suggestion. Each form uses its existing same-origin `/rpc` operation and
decodes a complete `{ payload, data }` snapshot before calling `onSave`.
Text fields stay editable during lookup. New edits supersede pending work, and
leaving the form cancels its pending commit and closes the RPC session.
Closing RPC does not undo remote work or already stored assets.

Format help sits under its field. Invalid text is flagged on blur or Enter.
Pending lookups and failures appear locally. Lookup, decode, or staging failures
preserve the previous saved content and the draft. Retry a text commit with
Enter or blur, or choose the place again. Reopening starts with saved state.

GitHub accounts accept URLs or usernames. Repository input accepts an HTTPS URL
or owner/repository, strips `.git`, lowercases the owner and preserves repository
spelling. Figma normalizes document identity and validates the returned file;
nullable thumbnail fields remain valid. Instagram validates the returned username
and retains its imported-image snapshot. Activity validates contribution dates.
Link removes fragments and saves the response's canonical URL and preview.
Map Place retains autocomplete as transient search, then validates the selected
place's identity, finite coordinates, and latitude/longitude ranges before saving.
Provider credentials, caching, and uploads remain in the API Worker.

The seven current module definitions are V2 and contain only `payload` and `data`.
V1 codecs remain frozen for admitted command history. Existing saved documents
may retain their old resolution fields; current readers ignore them. A saved
`data: null` renders the module's empty-content explanation until a valid
configuration is committed. No history or rows are reset or rewritten by this cleanup. State saves
still preserve layout/specs and never capture preview dimensions.

Behance imports a public profile and project candidates through Bricks API.
Choose up to four projects and save to update the Brick. The saved selection
supplies the portfolio on every Wall and in the Page snapshot. A failed import
leaves the saved selection in place. Buy Me a Coffee saves a creator page URL
and an optional message. Its button opens the creator's hosted support page.
Both modules require the User V12 release for canonical writes.

Swatch and Icon retains the selected `{ hash, name, svg }` from paged icon search.
SVG data URLs are derived for presentation. Choosing an icon saves immediately
with the latest saved color. Color edits save at the end of a picker gesture or
when a valid hex entry is committed on Enter or blur. Color edits keep the exact
saved icon. A new Swatch starts with the color and icon visible in the catalog
when it was added; its form opens that saved snapshot. An empty SVG lets the
saved color stand alone at a minimum height of 64px.

## Storybook

```sh
PORTLESS_PORT=443 PORTLESS_HTTPS=1 PORTLESS_WILDCARD=1 pnpm --dir apps/bricks dev
pnpm nx run @qrk.sh/bricks:build-storybook
```

Open [Bricks Storybook](https://bricks.qrk.localhost/).
Fixture previews run locally in the story. Live actions use the existing API
services. Stories live alongside their modules and use the shared
[`BrickStory`](../../bricks/.storybook/BrickStory.tsx) component.
App Storybook also discovers the colocated Brick stories.

Each **Modules / <module> / Breakpoint Previews** story compares the module's
JSX sketch with JSON Render at sm, md, lg, and xl. All four widths use the same
example state and active spec. Each module's Storybook illustration sits at the
top of its stories and lives beside them as `story-illustration.svg`.
The 320px StudioSidebar uses shadcn line tabs
on Base UI and is capped at half the preview width. **Configure** shows the
module's form and cancels pending work when the tab closes. **Generate Spec** sends
a prompt through the API and previews the resulting spec. **Reset to default**
restores the versioned default spec.
**Unconfigured** displays null and blank forms/placeholders only for modules
declaring `hasPlaceholder: true`. Swatch and Icon always has configured state.
Provider lookups call the same RPC operations as App and update the
mounted story's example state. Pending and errors come from
the form interaction; persisted Resolving/Failed fixtures have been removed.

Live Generate spec calls the existing `/rpc` operation with the current example
state/spec. It changes JsonRender while the authored Component stays independent
of that spec. Requests retain loading and error presentation. API credentials stay
server-owned. Story remount restores its declared fixture, and no Storybook action
creates a Page, Brick, or Placement in App.

**Modules / Article** keeps **Playground** and **Unconfigured** for module previews.
**Studio Editor** and **Unconfigured Editor** exercise the inline Meowdown editor.
**Body First Autosave**, **Retry Failed Autosave**, and **Discard Failed Autosave**
exercise local save outcomes with Storybook state and simulated staging refusals.

The Wall Editor's Preview Brick, Placement Brick, and Shadow Brick stories use
production presentation and explicitly label the catalog source, existing placed
content, and insertion shadow. These are separate representations in one scenario;
the story title does not turn every rendered Brick into a shadow. Their controls
and interaction checks cover the selected fixture without a separate mock styling
system. See [Brick dimension stories](#brick-dimension-stories).

## Public exports and shared UI

Hosts compile the Bricks source through explicit exports. Use
`@qrk.sh/bricks/modules/link/definition` for `linkV1` and
`@qrk.sh/bricks/modules/link/react` for
`linkReactRegistry`. The import check enforces the export map, keeps React runtime
out of the definition graph, and rejects imports from Bricks into hosts.
Persisted models and contracts live under `apps/zerospin/src/aggregates/user/`.

Consumers bundle Meowdown and React themselves and share no editor instances.
Import Article's stylesheet alongside the shared `brickStyles.css`, retaining its font imports.
Article's stylesheet, Storybook, and App declare
`@layer theme, base, components, meowdown, utilities` before imports so Preflight
precedes Meowdown rules and utilities remain last.

`ModuleFilmstrip` lays out previews in a vertical catalog. Each preview reflows
to the available column up to its preferred width, respects its minimum width,
and scrolls horizontally when that minimum cannot fit. Previews render without
scaling and have a 1px zinc border that becomes a blue outline on hover or focus.
App supplies the catalog actions, and Storybook supplies its own module
examples. Live preview content stays interactive.
`--brick-catalog-inset` sets the heading's side padding and the preview's top
and side padding.
`ModulePreview` owns its current local preview state, initialized from the module's
`defaultState`. A module can supply `preview({ state, setState, isActive })`
to change that local state. `IntersectionObserver`, document visibility, dragging,
and reduced-motion preference determine `isActive`: it is true only while the
preview is visible, the document is visible, that preview is not being dragged,
and reduced motion is disabled. Swatch and Icon owns a discrete two-second color/SVG cycle through
this callback and pauses it while inactive. Preview ticks write no model data.
Drag start captures the committed preview state and freezes the catalog rendering;
the native drag copy, insertion shadow, and newly created Brick use that same
snapshot. Catalog Add uses the current preview state; static module-detail Add
uses the `defaultState` displayed there. Preview animation never changes a saved
Brick.
Catalog previews share the placed Brick's content decoration on hover or DOM
focus: an opaque 1px `#1F9BFC` stroke centered on the Brick's edge, with sharp 1px
solid halos in `#BCE1FE` outside and `#DDF0FF` inside. It overlays the content
without changing layout, moving the Brick, or adding hover animation. Selection
keeps this decoration on a placed Brick while its edit form is open,
independently of DOM focus.

Card styling is an ordinary boolean presentation prop on shared previews;
BrickCardStyleContext is removed. Module playgrounds own a local checkbox
starting false. App reads saved `Site.cardStyle` directly, with no local preview
override or sidebar-header Cards control; SiteSettings owns its unsaved field and
persists it only on Save. Storybook's visual toggle changes no model layout or
preview width. `BrickWrapper` owns the self-contained content surface; callers
supply the existing `brick-surface-card` class for an 8px radius, white background,
and card shadow. Card appearance is not a requirement on an ancestor wrapper and
survives cloning the surface.

## Modules and interaction

Every shared `makeModuleVersion` declaration owns one flat `variants.default`
sizing record with `defaultWidth`, `minWidth`, `defaultHeight`, and optional
`minHeight`. `makeModuleView` attaches the React registry and placeholder to
those shared values and gets the default spec from the versioned definition.
`LineIcon` and the content form are module-level. Storybook and App catalog
previews select the default variant and cap its
preferred width at the chosen breakpoint's canonical width. Browser frames
retain their canonical widths.
The minimum is 320px for every module except Swatch and Icon at 160px, and is
shared across all breakpoints. Preview surfaces and placed Row cells respect it;
neither width setting changes persisted brick state.

| Module                            | Default width | Default height |
| --------------------------------- | ------------- | -------------- |
| Article                           | 720px         | `null`         |
| GitHub Activity                   | 656px         | 180px          |
| GitHub Profile                    | 360px         | 360px          |
| GitHub Repo, Link                 | 480px         | 180px          |
| Figma Thumbnail, Image, Map Place | 480px         | 360px          |
| Instagram                         | 400px         | 360px          |
| Swatch and Icon                   | 240px         | 90px           |

`defaultHeight` uses `45 | 90 | 180 | 360 | 720 | null`; `null` means natural
content height. The shared height floor is 45px. Optional `minHeight` declares
a higher floor (`90 | 180 | 360 | 720`), and every current variant omits it.
`defaultHeight: null` also identifies variable-height content for Row sharing.
The shared `canShareRow` rule lets an empty Row accept any variant, but a
nonempty Row can contain only fixed-height variants. Fixed variants with different
heights may share. Available width does not veto a destination: cells divide the
Row by saved weights, respect minimum widths, then overflow horizontally when
those minimums do not fit. `addBrick@4` and `movePlacementToRow@3` enforce exclusivity before recording mutations and refuse
rather than choosing another destination. Same-row move checks exclude the moving
Placement from the destination's existing members. Automatic Rows apply the
tallest module preferred height as their surface minimum. A saved Row `minHeight`
replaces that preference, while module minimums and natural content can grow
the shared height. Module content retains its own fitting behavior.

Each Placement persists a required `variantId`, currently `"default"`, and positive
`widthWeight` alongside its spec. Creation initializes the weight from the selected
variant’s positive, finite `defaultWidth`; moves preserve it. Different breakpoint placements own their variant identities
independently. The module renderer receives that identity explicitly and selects
the matching view; preview examples select `variants.default` directly. There
is no variant picker or switching command while every module has one choice.

Catalog previews render authored module content at that resolved preview width.
The App catalog uses plain module labels and draggable previews for Brick creation.
Module inspection and Component/JsonRender comparisons belong to Storybook playgrounds;
the App has no inspection links or URL-driven Add here action. Ordinary links, forms, Image file selection, and module-owned
interactions remain available. Placed Bricks and existing-Row insertion shadows
use relative growth weights to fill the Row; module minimums may override ideal
ratios. New-Row shadows fill the available width. Visible Brick surfaces stretch
to the shared Row height, with gaps outside the surface minimum.

Link's copy column uses CSS half width and ordinary URL/title wrapping; no
font-size or column-width fitting runs. Map Place owns a 200px CSS minimum height
and keeps Mapbox's container-resize observer. These module styles do not measure
or update Placement geometry.

GitHub Activity constrains its calendar to the brick shell's available width.
Only the contribution grid and month labels scroll horizontally; Mon/Wed/Fri
and the color legend stay fixed. Edge fades apply only to the scrolling grid:
the left fade appears while older activity is offscreen, and the right fade appears
while newer activity is offscreen. Both disappear when the full grid fits.
The scrollbar stays hidden while horizontal scrolling remains available.
The calendar initially scrolls to the rightmost, most recent activity; subsequent
manual scrolling keeps the chosen position.

`modulesHash` exposes each library module by its registered kebab-case id, with
no arbitrary-string index signature. App uses the registered Brick identity;
Storybook binds an explicit registered module ID.
Internal previews and state updates retain the registered ID union.
`defineModule` declares identity; `makeModuleVersion` owns variant sizing, `stateShape`,
canonical worker-safe `defaultSpec`, and `componentMetadata`. App registries and
API generation build their own catalogs through `makeCatalogFromComponentMetadata`;
the Zerospin backend does not construct catalogs.

Each module keeps its production example in a separate `<module>PreviewState.ts`
file beside the native version. App views explicitly supply that value to
`makeModuleView`, which prepares `defaultState` with its existing state decoder,
discards undeclared fields, and derives `def` from the same decoded object.
Native definitions, production backend commands, and API catalog construction
never import these examples. Stories and backend tests can import the plain
example files without importing React views. GitHub Activity's dated samples run
only in consumers of its example file.

`makeModuleView` infers authored callback props from the state shape and decodes
incoming state before rendering, discarding undeclared fields.
Its resolved variant exposes the JSON Render `registry` and default `spec`
used in both production and Storybook.

Every module view supplies a required `LineIcon`, exposed on its `modulesHash`
entry. Each module owns its SVG component, sourced from
[Untitled UI's free icons](https://www.untitledui.com/free-icons), with the source
linked beside the component. Icons default to 24×24, use `currentColor`, and accept
native SVG props for sizing, styling, and accessibility. Registering an icon does
not render it; consumers can use `<brickModule.LineIcon className="size-5" />`.
Icons belong to the React view declaration and stay out of backend module identity
and persisted brick state.

`defineModule` retains optional `maxPerPage` metadata, a positive integer;
omission means unlimited. Article declares `1` and Instagram declares `2`.
Catalog and playground previews display the limit. App enforces it against the
Page's shared Bricks during creation, counting a Brick once across four Placements.

Module views can supply a display-only `variants.default.placeholder` in
`makeModuleView`. The backend module's required `hasPlaceholder` flag owns whether
null is valid creation or saved state. Modules declaring `true` supply their
module-owned placeholder; exact null selects it before state decoding or
JsonRender execution. Empty strings, objects, and collections still use the normal
schema/rendering path. Swatch and Icon declares `hasPlaceholder: false`, supplies
no placeholder renderer, and rejects null; the other modules declare `true` and
retain their null-state presentations and blank form drafts. Catalog `defaultState`
examples remain separate. Placeholder skeletons respect reduced motion and contain
no outbound interactions; a configured Brick is never reset by preview controls.

`defineComponentMetadata` describes an allowed component using its name, `propsShape`,
slots, and description; it contains no React implementation. Each module exposes
these descriptions as `componentMetadata`. `propsShape` is a Zerospin shape for
the whole props object, matching the role of `stateShape` for module state.
json-render Specs and React renderers retain `props` for runtime values.

`makeComponentView` binds display markup to that component metadata. Its
`.Component` accepts inferred flat props; its `.RegistryComponent` decodes resolved
JSON-render props against the metadata's `propsShape` before rendering `.Component` through
JSX and forwarding children. Missing or invalid props surface schema errors rather
than handwritten fallback values. Both components retain stable identities. Use
member expressions directly so no file-scope component aliases are needed:

```tsx
export const bioView = makeComponentView(bioComponentMetadata, {
  component(props) {
    const { bio } = props;
    return bio ? <p>{bio}</p> : null;
  },
});

// Authored markup: <bioView.Component bio={state.data.bio} />
// Registry entry: Bio: bioView.RegistryComponent
```

Descriptors stay separate from React implementations so backend module imports
remain independent of view code. Shared module variants declare sizing, and
React view variants attach authored components and generators. Both consumers
use the same preferred `defaultWidth` and minimum `minWidth`, with no
`w`, `h`, `minW`, `minH`, or measurement flags. Canonical preview widths belong to
`BREAKPOINTS`; modules own their ordinary CSS layout.
Wall layout arrays hold ordering and Placement references. Separate Placement
records hold specs, variants, revisions, and generation state and reference their
Wall directly. Natural content dimensions come from the Row cell.
Each Placement uses its module preferred width plus the configured gap, without growing
to fill unused Row space. Crowded Rows shrink cells toward their module minimums
and scroll horizontally when those minimums do not fit. Insertion shadows use
the same sizing and natural content height. Content or preview dimension changes
do not write model geometry.

The current Placement spec schema requires a nonempty root, at least one
structured element, and a root that exists in the element map. The external
generation continuation also checks module component types and props before
recording a generated spec. The current hard-cutover baseline binds
these strict declarations directly.
The spec primitive applies validation to model operations and query decoding,
so consumers do not need an empty-spec rendering fallback. The root-membership
filter runs in Effect and is not represented in generic JSON Schema.

Module defaults, preview state, and authored rendering discard undeclared fields
during decoding. `addBrick@3` requires an explicit `state`: it decodes non-null
state through the selected module's schema and accepts null only when that module
declares `hasPlaceholder: true`. `updateBrick@3` applies the same rule, checks
`moduleId` against the stored Brick, and persists shared content while advancing
its revision and superseding active spec generation. Swatch and Icon rejects null
on both paths. Spec validation remains strict. The update command preserves each
Placement's identity, layout membership, and spec; it stores no pixel dimensions,
`gridItem`, or visibility.

Each Brick also owns `borderWidth`, shared by all four breakpoint Placements.
It defaults to `0` and accepts whole pixels from `0` to `12` through the authenticated
`setBrickBorderWidth({ brickId, borderWidth })` command. A border-only save changes
neither module state and its revision nor Placement specs, revisions, or generation.
There is no border-width editor control yet.

## App-owned persisted editor

App's user aggregate owns the final Page and directly referenced Wall/Brick
models and separate Placement records. A new Page has sm/md/lg/xl Walls with
`layout: { sections: [] }`; existing layouts are preserved. `Wall.layout` owns
ordered Section, named Stack, and Row nodes. Rows list
Placement IDs side by side. The nodes retain stable IDs without separate tables
or numeric positions. Brick content is shared across all four Walls. Placements
retain stable identities, direct `wallId`, and per-width specs/revisions/generation.
Breakpoint derives from that Wall; content/spec changes leave layout arrays alone.

State-save and spec-update command declarations belong to QRK's user aggregate
and bind concrete model versions there. App's current user release and web actor
are V7; the browser session pins both with WallV2, PlacementV2, and PageSnapshotV3.
Affected commands use the corresponding next versions, including `addBrick@4`,
`updateBrick@4`, and `movePlacementToRow@3`. User V3–V6 remain registered for
retained source interpretation. New-release command evaluation initializes sizing
from existing creation inputs without resetting data. Publication and dirty-state
comparison include Row minimums and Placement weights through the same V3 builder.
The earlier Swatch creation cutover removed obsolete creation contracts and their
adapters. Existing null Swatches are not retained through a
fallback or repair path. That earlier authorized local cutover backed up and reset QRK's
Zerospin development storage; it did not reset remote data, API storage, or
credentials. App supplies module schemas, input normalization, and provider
operations; it does not construct
contracts from injected host models or versions.

The shared controlled wall components render supplied data and action callbacks.
App's PagePreview reads the initialized `useSession(userSessionDefinition)` session and adopts the development
canvas's direct Wall query and layout projection. The
URL-selected Wall renders below BrowserChrome with SiteHeader receiving the
explicit site ID. SiteHeader reads the required Site from the same session without Clerk or
route dependencies. It renders above the Wall in the shared preview scroll
container, with existing
WallPlacement edit/delete controls. Module catalog/detail routes own their scoped
add handlers for query-encoded insertion targets.
Catalog `ModulePreview` templates are copy drag sources carrying the module ID and
the committed creation-state snapshot. Their desktop native drag preview copies the rendered
Brick and uses the library's pointer offset (16px horizontally, 8px vertically)
to leave insertion feedback visible. Its detached container retains the source's
font, text color, Brick theme, and unscaled size. The floating copy keeps a 2px `#1F9BFC`
edge without relying on hover, removes interaction halos and card shadows, and
hides editor action controls. This pointer-following image is distinct from the
borderless insertion shadow on the Wall. WallEditor owns production drop targeting.
Module Page limits apply before accepting catalog templates. Compatible Rows use
top/bottom quarters for new Rows and their middle half for left/right Placement
insertion. Incompatible Rows use top/bottom halves for new Rows.

Saved Wall Bricks drag only from their dedicated grip. They may join existing
Rows or create Rows across existing Stacks and Sections in the same Wall. For
compatible populated Rows, the top/bottom 8px create Rows and the remaining area
joins or reorders horizontally; incompatible Rows offer new Rows through their
top/bottom halves. Empty Rows accept a Placement directly, and empty Stack
backgrounds create their first Row. No canvas gesture creates a Stack or Section.
The source remains in place at 40% opacity. A local, pointer-transparent drop
indicator marks joins vertically and new Rows horizontally without changing
layout: a 1px white line has a crisp 1px blue outline and a second 1px light-blue band, with a white-filled 8px circle
outlined in blue with the same crisp light-blue outer band. Selection, content interactions, and the open sidebar are
preserved. Unchanged or invalidated
drops stage nothing; singleton Rows are not replaced at their existing position.
Existing-Row drops use `movePlacementToRow@2`; new-Row drops use
`movePlacementToNewRow@1` with `newRowId` allocated only after an accepted drop.

Catalog insertion feedback opens temporary space using a copy of the catalog's existing
`.brick-hover-surface` at 40% opacity, without an added border, outline, or halo,
without rerendering its module or reading providers. Preview and shadow content
use the same natural height as placed content; the shadow has no separate minimum
height and retains the flat/card treatment. It occupies a Placement slot in a compatible Row, a new Row
in a Stack, or the first slot in an empty Wall. Its content is inert and ignores
pointer events; its host accepts drops at the visible slot's stable
before-Placement or before-Row destination. Catalog templates use this shadow;
saved-Placement moves use the insertion lines described above.
Each Row's drop-target wrapper contains its real content and its owned
before/after shadow. Local feedback retains the owning Row separately from the
canonical before-Row destination: after Row A remains owned by A even when its
command destination is before Row B. Both Row instructions and Placement
eligibility use the wrapper's top and the natural Row height captured at drag
start. Moving the shadow therefore does not move its own combine/reorder
boundaries. The shadow retains its own drop target and committed destination;
stickiness is unchanged. Temporary space clears on drop, cancellation, or outside
movement without persisted fake Rows. Capacity checks and the existing drop
command path apply to the shadow's destination. The [source research](../../../wiki/research/pragmatic-drag-shadow-stability.md)
records the library example and the adaptation for combine zones.
The Wall ends with a white, right-aligned “powered by qrk.sh” footer with
an inset top divider, a zinc-300 bottom border closing the preview frame, and `qrk.sh` in Silkscreen. Its text line boxes are vertically
centered in a 64px footer, matching the site navbar; the divider does not consume layout space. It sits at
the bottom of short Walls and follows content on long Walls.
The Wall background is white, except for the existing empty-Wall
drag highlight. `Site.brickGap` sets the space between Bricks in whole pixels
from 0 to 12, defaulting to 0. SiteSettings saves it through `updateSiteSettings`,
whose guard rejects values outside that range. Each Placement and insertion
shadow uses half the gap as padding. The content-height Wall wrapper offsets
the outer inset so Bricks sit flush with the Wall edges at every gap size.
The preview frame has no border. Its centered sections share real
1px zinc-300 side borders owned by PreviewSection; the browser bar uses a real top
border rather than an outside ring. The browser bar shares the zinc-300 border color.
Square white backing rows behind the 48px chrome and 64px footer mask Wall
content around their rounded corners. Zero-blur white shadows cover the adjacent
vertical gaps without changing the scroll extent. Chrome stays sticky above the
navbar; the footer stays in normal flow above Wall decorations. Side gutters
remain unclipped for editor controls and drag feedback.
Placement and insertion-shadow cells share `flex: 0 1 auto`; their inline
preferred width and minimum width each include the configured gap. The two
half-gap padding insets preserve content width. Empty-Wall insertion retains its
outer half-gap allowance so the first shadow does not rewrap narrow content.
Target boxes still touch. There is no perimeter-border overlay.
Empty Rows accept their first Placement; exposed Stack background appends a Row.
A Wall without Sections highlights its available area and creates the first
Section/Stack/Row on drop. Populated Walls have no new Section/Stack drop targets
outside the existing layout.

Hover feedback remains local. One accepted drop stages one `addBrick@3` with the
captured state, creating one shared Brick and four Placements atomically. A
placeholder-backed module supplies null; Swatch and Icon supplies its captured
color/icon state. The active Wall follows the
destination; the other Walls append a Row to the last Stack, creating missing
parents. Successful local staging opens the Brick form. Cancellation, outside
drops, invalid source data, and stale destinations create nothing.

The URL owns `?breakpoint=sm|md|lg|xl`, and all four breakpoints are selectable
at any pane width. Their authored content widths are 360, 720, 1080, and 1440px.
Studio renders the selected frame at its authored width plus both 1px borders.
The preview reserves at least 32px on each side of the frame in every editor
layout. It scrolls horizontally when the frame and gutters exceed the pane
width. Pane resizing preserves the selected breakpoint and its inline
editors. Explicit breakpoint changes flush Article drafts before switching Walls.
The toolbar tooltips show the authored widths.
PageLayout's single `.wall-preview-viewport` root contains the editor scroll
region and toolbar anchor. It owns scroll anchoring and floating toolbar
placement. PagePreview centers the frame when there is room.
`PreviewSection` is the single centered element shared by the browser bar, site
navbar, Wall body, and footer. It owns the real side borders and a border-box
width of `previewWidth + 2 * PREVIEW_BORDER_WIDTH`, without max-width clamping.
A 720px page therefore occupies 722px including its borders; its unpadded query
container remains exactly 720px wide. Section-local content padding remains
inside that content area. Container-query thresholds are unchanged. Surrounding
gutters remain available to editor controls, and sections do not clip overflow.
The editor's full-width scroll region is the only preview scroll container.
`BrowserChrome` renders only the 48px browser bar, sticky at the top of that
region, with its own real top border and bottom divider. The optional sticky
site navbar sits below it. A soft shadow follows the frame's rounded corners
without clipping descendants. The footer remains part
of WallEditor and is 64px tall. The floating toolbar straddles the frame's
bottom edge when the preview fits or is scrolled to the bottom.
Stack and placed-Brick action bars stick below the browser bar and any sticky
navbar while their owner remains visible. The Move Brick grip uses the same
height as the Stack and Row controls. Full-height, pointer-transparent hosts
bound each bar to its own Stack or Brick without consuming layout space. Hovering
the Stack action bar or anywhere inside an empty Stack outlines the entire Stack
with the same blue stroke and halos used by Bricks. The Stack name and chevron
form one button that opens the insertion menu. The Wall sets a 7rem sticky offset with
a sticky navbar and 3rem otherwise. Existing
visibility rules and action layers remain; catalog-preview actions stay absolute,
and move indicators remain above the controls at z-70. The Cross Row Sticky
Actions stories exercise both navbar settings, owner-bottom boundaries, menu
interaction, and unchanged content geometry.
The Wall Editor story uses the same section widths and a full-width scroll
owner. Its frame uses the selected content width plus both side borders.
Oversized selections scroll horizontally. Breakpoint controls show the nominal
content widths.
The App's route-backed workspace sidebar is 300px wide for the `sm` preview and
half the authored preview width for `md`, `lg`, and `xl` (360px, 540px, and
720px). At Tailwind `lg` and wider it sits beside the preview. Below `lg`, the
same sidebar overlays the right edge and occupies at most 75% of the viewport
width. The Wall remains interactive in the exposed area and keeps its 32px side
gutters. Catalog drag sources reflow within their preferred and minimum widths
without scaling, and scroll horizontally when their minimum width does not fit.
Drops use the selected breakpoint's authored Wall sizing.

Both floating toolbars keep a 38px height and concentric corners: the buttons'
8px radius plus their 5px inset (4px padding and 1px border) gives the shell a
13px radius. The URL-selected breakpoint is bold, fully opaque, and disabled.

**Default** and **Empty Wall** under **Studio / WallEditor.tsx** exercise
production insertion and presentation. Stories that run interaction scripts
are in **Scripted** under the same section. The old hover-study gallery and
its separate mock stylesheet are removed; the representation stories exercise
the production owners directly.

The Wall Editor story uses the in-memory `useMockAggregateSession`, `SessionProvider`, and
`SessionReady`, seeds Wall layouts plus separate Placement records, and renders the
production WallEditor beside a WorkspaceSidebar containing ModuleFilmstrip. Its
memory router redirects Brick-detail navigation back to the Wall, so dragging
keeps the sidebar visible without mounting edit forms. The story owns its
breakpoint selection and flushes inline drafts before switching Walls.
Storybook supplies the public Clerk key
from the App environment for PagePreview's SiteHeader provider. Shared wall presentation components
import no App store or router. New-Brick creation, layout moves,
and global Brick deletion are ordinary App commands. Pure layout functions edit
ordered arrays, and each command records the complete atomic change. Moves prune
all empty containers in their affected Wall after editing; Brick deletion prunes
only ancestors emptied by its Placement removals. Self-before moves do no cleanup.
No pixel grid geometry or visibility state is persisted. Move validation counts
Stacks that survive cleanup; catalog additions retain their existing capacity
rules. Rows have no CSS gutters; half-gap Placement insets create the configured
gaps, and the Wall wrapper cancels the outer inset.
Each Row contains a flex element with Placements and any temporary insertion
shadow. Rows allow visible overflow; the full-width preview viewport owns scrolling
and outer clipping.
The outer Row uses `flow-root` to contain the flex element's -0.5px margin.
Its 0.5px padding and 49px minimum height preserve the Row's 48px outer minimum height.
The enclosing Stack retains a 50px minimum height.
Brick content has one surface owner: `BrickWrapper` uses intrinsic height and
visible outer overflow. Its internal `.brick-content` wrapper owns `@container`,
content layout, inherited corner rounding, and clipping. The saved content border
is a noninteractive overlay at z-index 18; hover/focus/selection decoration sits
at 19 outside that clipping layer, and BrickAction sits at 20. Unsaved catalog
previews default to no saved content border. Saved border width remains distinct
from interaction paint. StackAction retains its existing z-index 30 and separate Stack scope.

`brick-surface-card` styles the surface itself rather than requiring a card
ancestor. Catalog, placed, detail, and breakpoint previews use that same owner.
The insertion shadow clones this complete surface and remains inert at 40%
opacity without an added border, outline, halo, or editor action controls.

One shared content decoration supplies hover, DOM focus, and selection. The 1px
opaque `#1F9BFC` stroke straddles the Brick or Stack edge by 0.5px on each side,
with sharp 1px solid halos in `#BCE1FE` outside and `#DDF0FF` inside. Selected still
means the Brick's edit form is open; active means DOM
focus. Selection keeps the content decoration while focus is in the sidebar, but
it does not force BrickAction visible. Placement hitboxes remain stationary.
The separate outer Placement stroke is reserved for its open portal menu;
keyboard focus reveals the shared content decoration instead. The menu portal
can take focus outside the Brick, so that outer indication retains its own owner.

Hover on a fine pointer, DOM focus, and selection raise the Placement to
z-index 2. The Stack outline sits at z-index 1 so it paints over idle content.
The Brick action bar fills the inset at the top-right corner to cover the
centered stroke and halo where they meet.
Stack controls, browser chrome, menus, and floating toolbars remain above the
raised Placement.
Placement isolation, internal decoration ordering, and viewport clipping remain.
Editor styling uses `.wall-placement` with `.is-selected` and `.is-menu-open`;
Storybook scopes Placement styling through `.wall-story .wall-placement`.
These class hooks replace editor-owned data attributes. Library state,
password-manager hints, and unrelated module attributes retain their owners.

`BrickAction` owns the top-right editor control surface for placed and catalog
Bricks. It is visible only while its Brick is hovered or contains DOM focus.
There is no selected/menu visibility override or always-visible coarse-pointer
fallback. `StackAction` keeps its separate top-left placement, Stack label,
Stack-wide hover/focus scope, and existing coarse-pointer fallback. Both use
solid `#1F9BFC` backgrounds with white text/icons; action buttons retain their
own keyboard-focus feedback. They accept children and leave menu behavior,
selection, navigation, and drag state with their existing callers.

Each Placement isolates its stacking context; actions remain above content
paint without changing preferred/minimum widths, padding, or drop geometry.
The Wall renders no Add or plus buttons. Empty persisted Rows/Stacks and local
fixtures retain their layout containers; movement/deletion policies prune them.
The Wall Editor stories exercise the same production WallEditor and action
components, without introducing their own paint system.

The hard replacement of the old layout tables is tracked in
[Plan 039](../../../wiki/archive/plans/039-plan-wall-owned-layout-tree.md). Generation
request/revision checks and per-Placement spec updates remain independent of the
structural tree. Runtime verification belongs to that plan.

**Selected** means the Brick's Edit Brick panel is open; **active** means DOM focus.
Each placed Brick shows its catalog label and chevron in one actions button,
beside the move grip. The menu opens the Delete Brick confirmation for all four
breakpoints.
Sidebar-form Bricks open their details on a content click or when their focused
edit surface receives Enter or Space. Nested links and controls remain interactive.
App's initialized session and actor guards
own persistence, errors, and authorization; no standalone Library session or
host-binding Page factory remains.

## Image editing in the Brick sidebar

Image exposes its module-owned `ImageForm` through the shared module registry.
The form owns the Title draft and local save errors. Image upload and crop
are committed when the user selects **Apply** in the image editor. Title
commits after a pause, on blur, or on Enter. Each commit uses the latest
accepted Image state so it preserves the other field. App stages the complete
state through `updateBrick`. Storybook updates local example state.

Image accepts nonempty PNG, JPEG, WebP, or SVG files up to 5 MiB. Each host
provides `uploadImage(file, { signal }): Promise<string>` through `SWRConfig`.
The image editor can also accept a manually entered source URL. Cancel closes
the image editor and discards the source and crop draft.

Each host owns HTTP, endpoint configuration, multipart fields, credentials, and
response decoding. Storybook performs anonymous `POST /image/upload`; App's
host performs `/upload` with its current site ID
and fresh Clerk authorization. Both forward the form's AbortSignal into `fetch`,
independently of Zerospin. Returned asset URLs remain publicly readable.
The image editor disables Apply while uploading. Cancel and leaving the Brick
abort the request. Current-request guards suppress late results. App's PageLayout owns the authenticated
uploader. `BrickStory` owns Storybook's anonymous uploader. BrickDetail
keys the form by its URL-selected Placement, so breakpoint changes, including
automatic correction after a resize, discard the old draft and abort its upload.
Completed R2 objects remain stored.
Uploaded file bytes remain API-owned and are not included in browser session storage.

## Article editing in Studio

The Markdown module uses **Article** and the `article` module ID.
Article titles and subtitles use the platform system sans-serif font (San
Francisco on macOS). Body text uses Spectral at 19px with 1.6 line spacing in
read-only Bricks and the Studio editor, loaded through the module’s stylesheet.
Code blocks retain their monospace font.
Its catalog example starts with “Actually good advice,” including
the introductory paragraphs and numbered criteria. This is a hard rename without
legacy aliases or data migration; old `text` bricks,
`TextBrick` specs, and Text command history may no longer load.

Article state stores required `title` and `subtitle` strings separately from the
nullable Markdown body `content`. The plain text title and subtitle fields wrap
and grow with their content. Both strings can be empty. Meowdown runs in Hybrid (`focus`) mode,
revealing Markdown syntax near the cursor. Native shortcuts, slash menus, link
controls, and block handles replace the formatting toolbar; there is no mode switcher.
Workspace overrides keep `prosemirror-model`, `prosemirror-transform`, and
`prosemirror-view` on one version each. Editor plugins share node and decoration
runtime identities; duplicate versions can fail decoration rendering and prevent
the ProseKit editor from mounting on a clean install.
The editor and read-only documents use the shared
`qrk-responsive-insets` class from `brickStyles.css`: `--qrk-inset-inline` supplies
16px outer gutters and `--qrk-inset-block` supplies 16px vertical padding.
When both the document viewport and nearest query container reach 720px, those
values become 30px and 32px respectively.
Titles use 32px/36px bold text; subtitles use 18px/24px muted text, with a 12px
title-to-subtitle gap and 24px before the body. These fonts and spacing follow the
[Experimental History article](https://www.experimental-history.com/p/the-strangest-idea-in-the-world).
The body supports Meowdown's native Markdown headings, lists, tasks, quotes,
code, tables, links, images, and inline formatting. Meowdown's native
`margin-inline-start: 1lh` reserves the list marker gutter in previews and the
editor; the shared layer order gives it priority over Tailwind Preflight.
Underline, colored highlights, and text alignment are not retained. The earlier Markdown schema cutover used no migration or fallback:
old Tiptap Article state, specs, and command history may no longer load. Historical schema cutovers used explicitly approved fresh affected storage;
retiring the standalone application does not itself authorize further deletion. There is
no JSON converter or compatibility reader.
The bundled example uses “Actually good advice” as its title and “Take it or leave
it” as its subtitle. Its body opens with the introductory paragraph, followed by
all four numbered criteria and the closing paragraph. Generated `ArticleBrick`
specs bind `/title`, `/subtitle`, and `/content` separately.

Read-only Articles render their title and subtitle above a client-mounted
Meowdown MarkdownView in Hide mode. Links open in a new tab, saved image
dimensions are retained, and task checkboxes are disabled. Raw HTML remains
literal Markdown content. Markdown round trips can normalize source.

Studio mounts one `ArticleEditor` in the Article’s Placement at the current
breakpoint. An unconfigured Brick starts with blank fields. Focusing the
Article leaves the sidebar state alone at every width. Closing Brick Details
deselects the Brick and keeps the editor, draft, and undo history in the
Placement. Article stages the latest changed snapshot after one second without
edits, once text composition has finished. It reads the Markdown from Meowdown
at save time and retains the caret and undo history across save echoes.
Opening a blank Article alone leaves it unconfigured.

The Studio host supplies the synchronous save callback and registers Article’s
flush. App flushes before leaving the Page, replacing its breakpoint Wall,
moving the Placement, or publishing. The editor also attempts a flush when the
tab becomes hidden. Saves use the existing `updateBrick` command for content
shared across breakpoints. Successful staging updates the local session
optimistically. A ready session can queue the command offline and deliver it
after connectivity and authorization are restored. The session reconciles the
local projection with the authoritative outcome. App requests the browser’s
unload warning while the editor holds an unstaged draft.

A local save refusal keeps the draft visible and pauses autosave. **Retry**
stages the latest draft. **Discard changes** restores the last title, subtitle,
and body accepted by the local session and clears the discarded editor history.
If a flush fails while leaving the Page or changing breakpoints, either action
can resume the paused transition. A failed publication flush stops that attempt.
Later admission and execution failures use App’s existing session error path.
See the [autosave research and verification notes](../../../wiki/research/article-autosave.md).

Native Meowdown controls retain formatting, selection, undo/redo,
and image resizing. Drag/drop is blocked and block drag handles are disabled;
table menus remain usable. Resizing writes width/height into a trailing Markdown
comment.
Portaled menus appear above the sidebar. Escape first dismisses an editor
control or selection, then closes the sidebar.

Article module rendering retains its white shell and clips overflowing content;
the editor surface does not paint the background. Content changes, image loads,
and width changes do not write Placement geometry; Rows use natural content height.

Article uploads remain disabled: Meowdown receives no file-persistence handler,
so it exposes no attachment picker or upload slash command. HTTP(S) images display
and can be resized in Studio. Automatic YouTube/X paste conversion and provider
resolution are disabled in both editor and viewer; ordinary URL pastes remain links.
Explicit media syntax can display native placeholders. Storybook exercises the
same Studio renderer with local examples. Consumers load
`@qrk.sh/bricks/modules/article/editor.css` alongside the Wall styles for editor and
portaled-control styles.

## Wall publication snapshots

QRK owns editable models, publication serialization, and snapshot history under
`apps/zerospin/src/aggregates/user/`. Snapshots retain shared Brick content once and
four ordered Wall hierarchies containing Sections, Stacks, Rows, and Placements
with their specs. Array order follows `Wall.layout`; publication dirty
comparison includes arrangement and each Brick's shared `borderWidth`. V2 snapshot
serialization retains the width once per Brick; historical commands replay with
the default width of `0`. Editing bookkeeping and former grid geometry are
excluded. Shared module source supplies schemas/default specs and rendering, not
an independent persisted owner or WallSnapshot model. Public-site rendering remains
outside this editor change.

Brick and Placement model factories accept stable model definitions (name and ID
abbreviation), and declare their relationships with SDK `modelRef`. They do not
require the parent model version's Table object. The host aggregate owns the
selected versions and the complete relation graph.

### Brick dimension stories

The Wall Editor's Preview Brick, Placement Brick, and Shadow Brick stories label
the catalog preview, existing placed Brick, and insertion shadow and use their
production rendering paths. Compact Swatch and Icon and wrapping Article fixtures
share state and available width when comparing content boxes. The valid controls
belong to each scenario; a placement comparison requires an existing Brick, and
Article insertion uses an empty Wall because its Page limit is one.

`BrickWrapper` supplies natural height and self-contained flat/card appearance.
Placement and shadow cells use `flex: 0 1 auto` with inline preferred/minimum widths
plus the configured gap as two half-gap insets; they shrink without filling unused
Row space. Empty-Wall insertion preserves that same gap allowance. Hover, focus,
selection, and saved border overlays do not change dimensions. Matching content
also requires the same effective spec: generated saved content can differ from
an authored catalog example.

The Shadow Brick story opens insertion feedback without dropping and explicitly
cancels its drag on Escape, replay, or story cleanup. The native pointer-following
preview remains a distinct representation with a 2px blue edge, no halos, and no
editor action controls. Story assertions cover presentation as well as geometry;
actual CSS hover still needs real pointer interaction.
