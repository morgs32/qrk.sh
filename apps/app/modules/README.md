# Modules

App owns module forms, renderers, React generator registries, previews, playgrounds,
and module stories in this directory. Shared versions, schemas, default specs,
component declarations, normalization, and model factories live in
[`apps/zerospin/src/modules`](../../zerospin/src/modules). API owns provider
operations and browser RPC declarations. There is no Library package.

## Development and configuration

Run `pnpm nx run @qrk.sh/app:storybook` from the repository root and open
`http://127.0.0.1:10020` (`PORT` overrides it). Root `pnpm dev` starts Web, App,
API, and Zerospin without Storybook.

Public/local Storybook settings live in `apps/app/.env.local`:

1. `PUBLIC_MAPBOX_TOKEN` configures Map Place previews.
2. `API_WORKER_ORIGIN` overrides the server-side API proxy destination, defaulting
   to `http://127.0.0.1:8787`.

App's `.storybook/main.ts` installs `/rpc`, `/upload`, `/image/upload`, and `/assets`
proxies through `viteFinal`. Its Vite Storybook configuration supplies Mapbox;
its preview imports the existing App and module article styles. Provider secrets
stay in `apps/api/.env.local`. API preserves `/assets/library/*` URLs and R2 data.
No browser or backend storage is reset by the package move.

## Package move verification

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

QRK-owned forms set `autoComplete="off"`. The shared Input and native article
title/subtitle, hex color, and State JSON fields also set `autoComplete="off"`
and `data-1p-ignore="true"` to suppress browser and 1Password suggestions. The
shared Input applies these attributes after forwarded props. These are opt-out
hints; browsers and extensions control whether they honor them. Clerk-owned
login, signup, account, and password flows retain autofill. Private Meowdown popup
fields, including link editing and code-language search, remain unchanged. The
application's place and icon search suggestions remain available.

All ten modules own their form. Shared forms receive state, synchronous
`onSave(state): IResult`, and `onCancel`. They receive no session or Brick identity.
App stages `updateBrick` and renders saved query state, including optimism and
rejection rollback. Storybook uses the same forms with local example state.
Article, Image, and Swatch retain their existing save behavior; image upload
remains a separate cancellable browser prerequisite. Null forms start blank.

Instagram, GitHub Profile/Activity/Repo, Figma Thumbnail, Link and Map Place
normalize their draft input and fetch through the existing same-origin `/rpc`
operations when Save is pressed. The form decodes a complete `{ payload, data }`
snapshot before calling `onSave` once. Pending status and errors stay local.
Provider and decode failures, or command staging refusal, preserve the previous
saved content and the draft. Inputs and duplicate submissions are disabled during
Save; Cancel remains available. Cancel, navigation, and unmount invalidate the
submission and close its RPC session, preventing a late save. Closing RPC does
not undo remote work or already stored assets.

No provider runner, configure/complete command dispatch, persisted request ID,
or persisted resolution state remains in the current editor. Reopening the form
does not resume a lookup. Save is the only retry. App retains its independent
session-owned layout/spec generation and state revision handling.

GitHub accounts accept URLs or usernames. Repository input accepts an HTTPS URL
or owner/repository, strips `.git`, lowercases the owner and preserves repository
spelling. Figma normalizes document identity and validates the returned file;
nullable thumbnail fields remain valid. Instagram validates the returned username
and retains its imported-image snapshot. Activity validates contribution dates.
Link removes fragments and saves the response's canonical URL and preview.
Map Place retains autocomplete as transient search, then validates the selected
place's identity, finite coordinates, and latitude/longitude ranges during Save.
Provider credentials, caching, and uploads remain in the API Worker.

The seven current module definitions are V2 and contain only `payload` and `data`.
V1 codecs remain frozen for admitted command history. Existing saved documents
may retain their old resolution fields; current readers ignore them. A saved
`data: null` renders the module's empty-content explanation until an explicit
Save. No history or rows are reset or rewritten by this cleanup. State saves
still preserve layout/specs and never capture preview dimensions.

Swatch and Icon retains the selected `{ hash, name, svg }` from paged icon search.
SVG data URLs are derived for presentation. Save validates a complete hex color
and stages the selected icon and color directly, including the saved icon when no
search runs. A new Swatch starts with the color and icon visible in the drawer
when it was added; its form opens that saved snapshot. An empty SVG renders no
graphic, so a saved color can stand alone at a minimum height of 64px. There is
no Save-time icon request.

## Storybook

```sh
pnpm nx run @qrk.sh/app:storybook
pnpm nx run @qrk.sh/app:build-storybook
```

Open `http://127.0.0.1:10020`; `PORT` overrides the default. App Storybook
uses its own Vite configuration and the App/module styles and fonts.
Fixture previews require no persisted editor or API Worker; live actions require
the existing API services. Stories live alongside their components in
`modules/components/`, `modules/lib/`, and each module directory. The static build goes to
`apps/app/storybook-static/`.

Each **Modules / <module> / Playground** story preserves the former module page's
Module metadata, Generate spec and input, sm/md/lg/xl Component/JsonRender previews,
and Brick Definition JSON. **Configure example** edits local state. Save changes
the example JSON/previews; Cancel discards the draft. **Unconfigured** displays null
and blank forms/placeholders only for modules declaring `hasPlaceholder: true`;
Swatch and Icon always has configured state. Provider Save calls the same RPC operations as App
and updates only this mounted story's example state. Pending and errors come from
the form interaction; persisted Resolving/Failed fixtures have been removed.

Live Generate spec calls the existing `/rpc` operation with the current example
state/spec. It changes JsonRender while the authored Component stays independent
of that spec. Requests retain loading and error presentation. API credentials stay
server-owned. Story remount restores its declared fixture, and no Storybook action
creates a Page, Brick, or Placement in App.

**Modules / Article** keeps **Playground** and **Unconfigured** for module previews,
plus **Form** and **Save Failure** for the production Meowdown form. The form stories
use local state and expose saved Article JSON, save/cancel status, and simulated
save rejection. The exploratory editor spike and renderer comparison have been
removed following the Meowdown decision.

**Modules / Brick hover transitions** compares background tint with five hard-shadow
options: the original, tight, bold, tinted, and position-aware shadows. Hover or
focus a preview, or enable **Hold hover state** to compare the emphasis. The
position-aware option casts its shadow away from the viewport center and moves
the surface toward it; direction updates on scroll, resize, layout changes, and
pointer entry or focus. Each option has browser chrome around a clipped viewport,
with the bricks flush against its edges. Reduced motion removes lift and
animation. These treatments remain available for comparison; the shared brick
drawer previews and wall Bricks use only a 5px black hover border; placed Bricks retain their keyboard-focus and open-menu borders.

## Public exports and shared UI

App imports its UI directly from defining files under `modules/`. App and API
import shared definitions using `@qrk.sh/zerospin/src/modules/...`; Zerospin's own
contracts use relative imports. There are no package barrels or compatibility exports.
Canonical persisted models/contracts remain under `apps/zerospin/src/aggregates/user/`.

Consumers bundle Meowdown and React themselves and share no editor instances.
Import Article's stylesheet alongside `bricks.css`, retaining its font imports.
Article's stylesheet, Storybook, and App declare
`@layer theme, base, components, meowdown, utilities` before imports so Preflight
precedes Meowdown rules and utilities remain last.

The shared `Drawer` preserves its optional controlled `open` behavior and 300ms
visibility transform. A controlled bottom drawer slides fully below the viewport
when closed; reduced motion skips the animation and the closed shell is inert
and hidden from assistive technology. These are retained shared capabilities,
not a requirement to recreate the retired Library shell in App. Drawer owns no
routing, breadcrumbs, or settings actions. App retains its own route-owned
transitions and drawer lifecycle.

`ModuleFilmstrip` is router-independent and receives host links through
`renderModuleLink`. Columns scroll vertically inside a horizontal strip, with
headings pinned above their previews. App supplies catalog/insertion actions;
Storybook supplies its own module examples. Live preview content stays interactive.
`ModulePreview` owns its current local preview state, initialized from the module's
`defaultState`. A module can supply `preview({ state, setState, isActive })`
to change that local state. `IntersectionObserver`, document visibility, dragging,
and reduced-motion preference determine `isActive`: it is true only while the
preview is visible, the document is visible, that preview is not being dragged,
and reduced motion is disabled. Swatch and Icon owns a discrete two-second color/SVG cycle through
this callback and pauses it while inactive. Preview ticks write no model data.
Drag start captures the committed preview state and freezes the drawer rendering;
the native drag copy, insertion shadow, and newly created Brick use that same
snapshot. Catalog Add uses the current preview state; static module-detail Add
uses the `defaultState` displayed there. Preview animation never changes a saved
Brick.
Drawer previews show a 5px black border on hover, without movement, added shadows,
or hover animation. The border overlays the content without changing layout.

Card styling is an ordinary boolean presentation prop on shared previews;
BrickCardStyleContext is removed. Module playgrounds own a local checkbox
starting false. App reads saved `Site.cardStyle` directly, with no local preview
override or drawer-header Cards control; SiteSettings owns its unsaved field and
persists it only on Save. Storybook's visual toggle changes no model layout or
preview width. Cards use an 8px radius, white background, and preview
shadow. Existing hover/shadow studies remain available.

## Modules and interaction

Every shared `makeModuleVersion` declaration owns one flat `variants.default`
sizing record with `defaultWidth`, `minWidth`, `defaultHeight`, and optional
`minHeight`. `makeModuleView` attaches the authored component, placeholder, and
optional generator to those shared values without repeating sizing. There are no
breakpoint overrides inside a variant. `LineIcon` and the content form remain module-level. Catalog,
Storybook, and App catalog previews select the default variant and cap its
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
nonempty Row can contain only fixed-height variants. The adopted PagePreview canvas
combines this rule with minimum-width fitting at the rendered Row width; fixed
variants with different heights may share. `addBrick` enforces exclusivity before
recording mutations and refuses rather than choosing another destination.
`movePlacement` enforcement remains deferred. Applying preferred heights,
row equalization, and module content fitting remain deferred.

Each Placement persists a required `variantId`, currently `"default"`, alongside
its spec. Different breakpoint placements own their variant identities
independently. The module renderer receives that identity explicitly and selects
the matching view; preview examples select `variants.default` directly. There
is no variant picker or switching command while every module has one choice.

Catalog previews render authored module content at that resolved preview width.
The App catalog keeps its module selection/insertion controls separate from live
preview content. Ordinary links, forms, Image file selection, and module-owned
interactions remain available. Placed Bricks fill their Row cells with natural
height rather than applying the catalog preferred width.

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
no arbitrary-string index signature. App validates route module IDs against the
registered module/Brick identity; Storybook binds an explicit registered module ID.
Internal previews and state updates retain the registered ID union.
`defineModule` declares identity; `makeModuleVersion` owns variant sizing, the catalog, `stateShape`,
canonical worker-safe `defaultSpec`, and `defaultState`. `makeModuleView` infers authored callback props from that state
shape and decodes incoming state before rendering, discarding undeclared fields.
Its authored wrappers are created once per variant and reused by module rendering
and previews. Each variant can attach a json-render `generator`
(`registry` + `defaultSpec`), exposed as the resolved variant's `registry` and `spec`.

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

`makeComponentView` binds display markup to a `defineComponent` descriptor. Its
`.Component` accepts inferred flat props; its `.RegistryComponent` decodes resolved
JSON-render props against the same descriptor before rendering `.Component` through
JSX and forwarding children. Missing or invalid props surface schema errors rather
than handwritten fallback values. Both components retain stable identities. Use
member expressions directly so no file-scope component aliases are needed:

```tsx
export const bioView = makeComponentView(bioComponent, {
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
Rows share available width subject to module minimums and scroll
horizontally when those minimums do not fit. Content or preview dimension changes
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
and bind concrete model versions there. App's user release and web actor are V3;
the browser session pins both with `addBrick@3` and `updateBrick@3`, retaining
BrickV2 and PageSnapshotV2. This is a hard cutover: obsolete creation contracts and their
adapters are not supported. Existing null Swatches are not retained through a
fallback or repair path. The authorized local cutover backs up and resets QRK's
Zerospin development storage; it does not reset remote data, API storage, or
credentials. App supplies module schemas, input normalization, and provider
operations; it does not construct
contracts from injected host models or versions.

The shared controlled wall components render supplied data and action callbacks.
App's PagePreview reads the initialized `UserUI` session and adopts the development
canvas's direct Wall query and layout projection. The
URL-selected Wall renders below BrowserChrome with SiteHeader receiving the
explicit site ID. SiteHeader reads the required Site from UserUI without Clerk or
route dependencies. It renders above the Wall in the shared preview scroll
container, with existing
WallPlacement edit/delete controls. Module catalog/detail routes own their scoped
add handlers for query-encoded insertion targets.
Drawer `ModulePreview` templates are copy drag sources carrying the module ID and
the committed creation-state snapshot. Their desktop native drag preview copies the rendered
Brick and uses the library's pointer offset (16px horizontally, 8px vertically)
to leave insertion feedback visible. Its detached container retains the source's
font, text color, and Brick theme. The floating copy keeps the drawer's 2px dark
edge without relying on hover, removes outer and card shadows, and hides action
controls. PagePreview owns production drop targeting;
saved Wall Bricks remain undraggable. Module Page limits apply before accepting
any destination. Compatible Rows use top/bottom quarters for new Rows and their
middle half for left/right Placement insertion. Incompatible Rows use top/bottom
halves for new Rows.
Insertion feedback opens temporary space using a copy of the drawer's existing
`.brick-hover-surface` at 40% opacity, with the hover style's dark border color
and square corners, without rerendering its module or
reading providers. It occupies a Placement slot in a compatible Row, a new Row
in a Stack, or the first slot in an empty Wall. Its content is inert and ignores
pointer events; its host accepts drops at the visible slot's stable
before-Placement or before-Row destination. No thin-line or rectangle indicator
variants remain.
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
an inset top divider and `qrk.sh` in Silkscreen. Its text line boxes are vertically
centered in a 64px footer, matching the site navbar; the divider does not consume layout space. It sits at
the bottom of short Walls and follows content on long Walls.
The Wall background is light orange (`#E6AA80`, a 50% white tint of `#CC5500`), except for the existing empty-Wall
drag highlight. `Site.brickGap` sets the space between Bricks in whole pixels
from 0 to 12, defaulting to 1. SiteSettings saves it through `updateSiteSettings`,
whose guard rejects values outside that range. Each Placement and insertion
shadow uses half the gap as padding. The content-height Wall wrapper offsets
the outer inset so Bricks sit flush with the Wall edges at every gap size.
The full-width preview frame has no border. Its centered sections share real
1px zinc side borders owned by PreviewSection; the browser bar uses a real top
border rather than an outside ring.
Each Placement adds the configured gap to its minimum width to preserve the module's content minimum.
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

There is no WallEditorProvider or WallViewportProvider/context. The URL owns
`?breakpoint=sm|md|lg|xl`. Static `BREAKPOINTS.previewWidth` values are exact page
content widths: 360, 720, 1080, and 1440px. The App-only Zustand viewport store
holds available content width, measured by `useBreakpointGuard` through its
plain `previewRef` as `max(0, element.clientWidth - 2 * PREVIEW_BORDER_WIDTH)`.
`PREVIEW_BORDER_WIDTH` is exported from `modules/lib/breakpoints.ts` and is 1px.
PagePreview and the Wall Editor story supply it as `--wall-preview-border-width`.
Guard selection, ValidBreakpoint rendering, and
floating-toolbar availability all compare against that same content-width
measurement. Below 362px of available total width, the UI explains the minimum
space needed instead of mounting or shrinking a Wall. Width growth enables
choices while keeping the current URL selection; breakpoint labels retain their
nominal content widths. The separate development URL is removed.
PageLayout's single `.wall-preview-viewport` root contains the editor scroll
region and drawer spacer, toolbar anchor, and Drawer as siblings. It owns scroll
anchoring/clamping and floating toolbar placement. PagePreview owns a full-width
flex frame whose minimum height fills the available preview space.
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
site navbar sits below it. The full frame has no border or ring; browser/footer
corners remain rounded without clipping descendants. The footer remains part
of WallEditor and is 64px tall.
The Wall Editor story uses the same section widths and a full-width scroll
owner. Its frame has a minimum width of the selected content width plus both
side borders, so oversized selections scroll horizontally rather than silently
shrinking. Its breakpoint controls keep the nominal content-width labels.
Reduced motion skips positional toolbar animation; drawer animation is unchanged.

**Wall Editor / Default** and **Empty wall** exercise the same 5px black hover
border used by production WallEditor. The separate Large, Halo, and Shadow
prototype stories, styling, and prototype flags are removed.

The Wall Editor story uses the existing in-memory MockAggregateSession and
UserUI, seeds Wall layouts plus separate Placement records, and renders the
production PagePreview above a Bricks Drawer containing ModuleFilmstrip. Its
memory router redirects Brick-detail navigation back to the Wall, so dragging
keeps the drawer visible without mounting edit forms. Breakpoint search and
width control/measurement remain local to the story; it uses neither the App
width store nor the production guard. Storybook supplies the public Clerk key
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
Wall Brick content uses the same 5px black hover border as drawer previews,
without movement, added shadows, or animation. On hover-capable fine pointers,
the whole Placement temporarily rises above neighboring Bricks at z-index 1 and
returns to normal stacking when hover ends. Stack controls, browser chrome,
menus, and floating toolbars remain above it. Focus, selection, and open-menu
state do not raise the Placement.
Placed BrickActions remain inside the stationary content wrapper at their 1px
top-right inset. Placement hitboxes and blue keyboard-focus and open-menu borders
stay stationary. While a Brick's edit form is open, its selected Placement keeps
a 1px `#1F9BFC` content border with sharp 1px same-blue halos (30% outer opacity,
15% inset), even while focus is in the drawer or on a touch device. Selection
continues to keep the Brick's actions visible. Each Placement isolates its
stacking context; its actions sit above the content decoration.
Placed and catalog Bricks use `.brick-surface`, retaining `.brick-surface-card`
for card treatment. `BrickWrapper` draws the saved content border once as a
noninteractive inset overlay using the existing border color, in both flat and
card modes. It preserves dimensions, clipping, card radius, and the separate hover,
focus, and menu indicators. Unsaved catalog previews default to no content border.
Editor styling also uses
`.wall-placement` with `.is-selected` and `.is-menu-open`; Storybook scopes its
Placement styling through `.wall-story .wall-placement`. These class hooks replace
editor-owned data attributes. Library state, password-manager hints, and
unrelated module attributes retain their owners.
Each Placement draws its interaction border with a noninteractive `::after`
overlay outset 0.5px, centering its stroke between adjacent Placement boxes. Idle
and hovered Placements keep transparent borders; blue-500 open-menu
and keyboard-focus borders use z-index 19. These remain below action
tabs at z-index 20 without changing Placement padding, minimum widths, or drop geometry.
`BrickAction` owns the top-right control surface for both Placements and catalog
previews; `StackAction` owns the top-left Stack surface. Both sit 1px inside the
border and use solid zinc-800 backgrounds with white text and icons. Buttons
inside BrickActions have transparent backgrounds at rest and zinc-700 backgrounds
on hover, retaining their keyboard focus feedback. This applies to placed-Brick
menus and catalog action buttons. They accept children and leave action behavior
and selected/menu state with callers. StackAction displays
the Stack name. The Wall renders no Add or plus buttons. Empty persisted
Rows/Stacks and local fixtures retain their layout containers; the applicable
movement/deletion policy prunes them. Production PagePreview adds drop feedback
to the existing containers; the Wall Editor story exercises the same PagePreview.

The hard replacement of the old layout tables is tracked in
[Plan 039](../../../wiki/archive/plans/039-plan-wall-owned-layout-tree.md). Generation
request/revision checks and per-Placement spec updates remain independent of the
structural tree. Runtime verification belongs to that plan.

**Selected** means the Brick's edit form is open; **active** means DOM focus.
Separate menu controls leave links/forms interactive. Placements support
Edit and Delete Brick actions. App's initialized session and actor guards
own persistence, errors, and authorization; no standalone Library session or
host-binding Page factory remains.

## Image editing in the brick drawer

Image exposes its module-owned `ImageForm` through the shared module registry.
The form owns its Image URL and Title drafts, pending state, errors, Save, and
Cancel. Unconfigured Bricks start with blank Image URL/Title drafts. App
uses the Form in its authenticated Brick detail drawer and stages complete state
through `updateBrick`; Storybook uses the same Form with local Save/Cancel.
Image's field groups fill the supplied column, with Save/Cancel aligned to its fields.

Image also offers a single-file picker for nonempty PNG, JPEG,
WebP, or SVG images up to 5 MiB. Selection uploads immediately; success changes
only the draft Image URL until Save. Each host supplies
`uploadImage(file, { signal }): Promise<string>` through `SWRConfig`.
`ImageForm` reads that function with `useSWRConfig` and explicitly supplies it to
`useSWRMutation`, which owns request pending/error state. Uploads start only from
file-selection handlers, with revalidation and cache population disabled.
`ImageUploadSWR.d.ts` augments SWR's exported `_internal` configuration interface
with this optional field. Without an uploader, manual Image URL entry and Save
remain available. No separate upload context, Effect service, layer or runner
is needed; the shared form contract has no Image-specific upload props.

Each host owns HTTP, endpoint configuration, multipart fields, credentials, and
response decoding. Storybook performs anonymous `POST /image/upload`; App's
host performs `/upload` with its current site ID
and fresh Clerk authorization. Both forward the form's AbortSignal into `fetch`,
independently of Zerospin. Returned asset URLs remain publicly readable.
Image retains file validation, local validation/save errors, picker behavior,
drafts, Save gating, and cancellation. Fields and Save stay disabled during
upload. Cancel resets mutation state and separately aborts the request; leaving
the brick also aborts it. Current-request guards suppress late results because
SWR reset does not cancel transport. App's PageLayout owns the authenticated
uploader; Storybook's ModulePlayground owns its anonymous uploader. BrickDetail
keys the form by its URL-selected Placement, so breakpoint changes, including
automatic correction after a resize, discard the old draft and abort its upload.
Completed R2 objects remain stored.
Uploaded file bytes remain API-owned and are not included in browser session storage.

## Article editing in the brick drawer

The Markdown module uses **Article** and the `article` module ID.
Article titles and subtitles use the platform system sans-serif font (San
Francisco on macOS). Body text uses Spectral at 19px with 1.6 line spacing in
brick previews and the drawer editor, loaded through the module's stylesheet.
Code blocks retain their monospace font.
Its catalog example starts with “Actually good advice,” including
the introductory paragraphs and numbered criteria. This is a hard rename without
legacy aliases or data migration; old `text` bricks,
`TextBrick` specs, and Text command history may no longer load.

Article state stores required `title` and `subtitle` strings separately from the
nullable Markdown body `content`. The module form uses plain text title/subtitle
inputs in a centered writing column. Meowdown runs in Hybrid (`focus`) mode,
revealing Markdown syntax near the cursor. Native shortcuts, slash menus, link
controls, and block handles replace the formatting toolbar; there is no mode switcher.
Workspace overrides keep `prosemirror-model`, `prosemirror-transform`, and
`prosemirror-view` on one version each. Editor plugins share node and decoration
runtime identities; duplicate versions can fail decoration rendering and prevent
the ProseKit editor from mounting on a clean install.
Article content has no horizontal padding. Read-only documents use the shared
`qrk-responsive-insets` class from `bricks.css`: `--qrk-inset-inline` supplies
16px outer gutters and `--qrk-inset-block` supplies 16px vertical padding.
When both the document viewport and nearest query container reach 720px, those
values become 30px and 32px respectively.
The drawer retains its separate viewport-based insets and existing 660px
desktop text measure.
Titles use 32px/36px bold text; subtitles use 18px/24px muted text, with a 12px
title-to-subtitle gap and 24px before the body. The drawer retains its smaller
mobile title. These fonts and spacing follow the
[Experimental History article](https://www.experimental-history.com/p/the-strangest-idea-in-the-world).
The body supports Meowdown's native Markdown headings, lists, tasks, quotes,
code, tables, links, images, and inline formatting. Meowdown's native
`margin-inline-start: 1lh` reserves the list marker gutter in previews and the
editor; the shared layer order gives it priority over Tailwind Preflight.
Underline, colored highlights, and text alignment are not retained. Save decodes the complete state against the module schema. This is a hard schema change without migration or fallback:
old Tiptap Article state, specs, and command history may no longer load. Historical schema cutovers used explicitly approved fresh affected storage;
retiring the standalone application does not itself authorize further deletion. There is
no JSON converter or compatibility reader.
The bundled example uses “Actually good advice” as its title and “Take it or leave
it” as its subtitle. Its body opens with the introductory paragraph, followed by
all four numbered criteria and the closing paragraph. Generated `ArticleBrick`
specs bind `/title`, `/subtitle`, and `/content` separately.

Article bricks and previews render their title and subtitle above a client-mounted
Meowdown MarkdownView in Hide mode. They mount no editor. Links open in a new tab,
saved image dimensions are retained, and task checkboxes are disabled. Raw HTML
remains literal Markdown content; arbitrary Markdown round trips can normalize
source. App's Brick drawer and Storybook's configuration example reuse `ArticleForm`.
It starts null state from blank title/subtitle/content drafts, owns its Save/Cancel
controls, and validates Markdown strings plus complete state before the callback.
Failed saves retain the draft and show an error. Unsaved edits survive session
echoes; clean forms follow saved props. Cancel remounts the editor to discard
Markdown edits and canceled undo history. Leaving the Brick discards unsaved
drafts. Changing the URL breakpoint selects a different Placement and remounts
the form, discarding that draft and invalidating pending submissions.

Native Meowdown controls retain formatting, selection, undo/redo,
and image resizing. Drag/drop is blocked and block drag handles are disabled;
table menus remain usable. Resizing writes width/height into a trailing Markdown
comment.
Portaled menus appear above the drawer; their link form cannot submit Article.
Escape first dismisses an editor control or selection, then closes the drawer.
`ArticleEditorControl` belongs to the editable module form; read-only previews
mount no editor.

Article module rendering retains its white shell and clips overflowing content;
the editor surface does not paint the background. Content changes, image loads,
and width changes do not write Placement geometry; Rows use natural content height.

Article uploads remain disabled: Meowdown receives no file-persistence handler,
so it exposes no attachment picker or upload slash command. HTTP(S) images display
and can be resized in the drawer. Automatic YouTube/X paste conversion and provider
resolution are disabled in both editor and viewer; ordinary URL pastes remain links.
Explicit media syntax can display native placeholders. `ArticleForm` owns drafts
and Save/Cancel. Image's upload environment does not enable Article uploads; Image
and Site Settings retain their endpoints. App's initialized session owns saved
durability; Storybook example state lasts only for its mounted story. Consumers load `apps/app/modules/article/article-editor.css`
alongside `bricks.css` for editor and portaled-control styles.

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
