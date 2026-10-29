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

The Wall Editor's Preview Brick, Placement Brick, and Shadow Brick stories use
production presentation and explicitly label the catalog source, existing placed
content, and insertion shadow. These are separate representations in one scenario;
the story title does not turn every rendered Brick into a shadow. Their controls
and interaction checks cover the selected fixture without a separate mock styling
system. See [Brick dimension stories](#brick-dimension-stories).

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
Drawer previews share the placed Brick's content decoration on hover or DOM
focus: an opaque 1px `#1F9BFC` stroke with sharp 1px same-blue halos at 30%
opacity outside and 15% inside. It overlays the content without changing layout,
moving the Brick, or adding hover animation. Selection keeps this decoration on a
placed Brick while its edit form is open, independently of DOM focus.

Card styling is an ordinary boolean presentation prop on shared previews;
BrickCardStyleContext is removed. Module playgrounds own a local checkbox
starting false. App reads saved `Site.cardStyle` directly, with no local preview
override or drawer-header Cards control; SiteSettings owns its unsaved field and
persists it only on Save. Storybook's visual toggle changes no model layout or
preview width. `BrickWrapper` owns the self-contained content surface; callers
supply the existing `brick-surface-card` class for an 8px radius, white background,
and card shadow. Card appearance is not a requirement on an ancestor wrapper and
survives cloning the surface.

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
interactions remain available. Placed Bricks and insertion shadows use the same
preferred width with natural content height, leaving unused Row space on the right.

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
are V4; the browser session pins both with `renameStack@1` alongside unchanged
`addBrick@3` and `updateBrick@3`, retaining BrickV2 and PageSnapshotV2. User V3 stays
registered for history. The name editor changes no models and requires no storage
reset. The earlier Swatch creation cutover removed obsolete creation contracts and their
adapters. Existing null Swatches are not retained through a
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
font, text color, and Brick theme. The floating copy keeps a 2px `#1F9BFC`
edge without relying on hover, removes interaction halos and card shadows, and
hides editor action controls. This pointer-following image is distinct from the
borderless insertion shadow on the Wall. WallEditor owns production drop targeting;
saved Wall Bricks remain undraggable. Module Page limits apply before accepting
any destination. Compatible Rows use top/bottom quarters for new Rows and their
middle half for left/right Placement insertion. Incompatible Rows use top/bottom
halves for new Rows.
Insertion feedback opens temporary space using a copy of the drawer's existing
`.brick-hover-surface` at 40% opacity, without an added border, outline, or halo,
without rerendering its module or reading providers. Preview and shadow content
use the same natural height as placed content; the shadow has no separate minimum
height and retains the flat/card treatment. It occupies a Placement slot in a compatible Row, a new Row
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
from 0 to 12, defaulting to 0. SiteSettings saves it through `updateSiteSettings`,
whose guard rejects values outside that range. Each Placement and insertion
shadow uses half the gap as padding. The content-height Wall wrapper offsets
the outer inset so Bricks sit flush with the Wall edges at every gap size.
The full-width preview frame has no border. Its centered sections share real
1px zinc side borders owned by PreviewSection; the browser bar uses a real top
border rather than an outside ring.
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

**Wall Editor / Default** and **Empty wall** exercise production insertion and
presentation. The old hover-study gallery and its separate mock stylesheet are
removed; the representation stories exercise the production owners directly.

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
Brick content has one surface owner: `BrickWrapper` uses intrinsic height and
visible outer overflow. Its internal `.brick-content` wrapper owns `@container`,
content layout, inherited corner rounding, and clipping. The saved content border
is a noninteractive overlay at z-index 18; hover/focus/selection decoration sits
at 19 outside that clipping layer, and BrickAction sits at 20. Unsaved catalog
previews default to no saved content border. Saved border width remains distinct
from interaction paint. StackAction retains its existing z-index 30 and separate Stack scope.

`brick-surface-card` styles the surface itself rather than requiring a card
ancestor. Drawer, placed, detail, and breakpoint previews use that same owner.
The insertion shadow clones this complete surface and remains inert at 40%
opacity without an added border, outline, halo, or editor action controls.

One shared content decoration supplies hover, DOM focus, and selection: a 1px
opaque `#1F9BFC` stroke with sharp 1px same-blue halos at 30% outside and 15%
inside. Selected still means the Brick's edit form is open; active means DOM
focus. Selection keeps the content decoration while focus is in the drawer, but
it does not force BrickAction visible. Placement hitboxes remain stationary.
The separate outer Placement stroke is reserved for its open portal menu;
keyboard focus reveals the shared content decoration instead. The menu portal
can take focus outside the Brick, so that outer indication retains its own owner.

On hover-capable fine pointers, the whole Placement temporarily rises above
neighboring Bricks at z-index 1, across Rows, Stacks, and Sections. Hover ending
restores normal stacking. Stack controls, browser chrome, menus, and floating
toolbars remain above it; focus, selection, and open-menu state do not raise it.
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
