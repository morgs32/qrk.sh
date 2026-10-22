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
The wall story supplies `stickyNavbar: true` for its required SiteV3 fixture field.
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
search runs. A new Swatch draft has no sample icon; an empty SVG renders no graphic,
so a saved color can stand alone at a minimum height of 64px. There is no Save-time icon request.

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
and blank forms/placeholders. Provider Save calls the same RPC operations as App
and updates only this mounted story's example state. Pending and errors come from
the form interaction; persisted Resolving/Failed fixtures have been removed.

Live Generate spec calls the existing `/rpc` operation with the current example
state/spec. It changes JsonRender while the authored Component stays independent
of that spec. Requests retain loading and error presentation. API credentials stay
server-owned. Story remount restores its declared fixture, and no Storybook action
creates a Page, Brick, or Placement in App.

**Modules / Article / Meowdown spike** pairs an editable Markdown fixture with
live Markdown output. Its **Hide / Hybrid / Show** radio control changes syntax
visibility while preserving edits. This story uses local state only.
It shares Article's production typography and ordered/nested-list spacing.

**Modules / Article / Renderer comparison** shows the current Meowdown article
view beside HTML returned by `@tanstack/markdown/html`'s `renderHtml`. A shared
Meowdown editor updates both previews; expandable panels expose the Markdown
source and generated HTML. The fixture includes ordinary article syntax,
image-size comments, raw HTML, and Meowdown extensions so rendering differences
remain visible. TanStack uses escaped raw HTML, with frontmatter extraction and
heading IDs disabled. Storybook invokes the synchronous HTML API in the browser;
the same API can generate body HTML in a server process without React or a DOM.
This comparison retains the production Meowdown editor and article renderer.

To generate the comparison fixture's body HTML in Node, without React or a DOM:

```sh
cd apps/app
node --input-type=module <<'JS'
import { renderHtml } from '@tanstack/markdown/html';
import { articleRendererComparisonMarkdown } from './modules/article/articleRendererComparisonMarkdown.ts';
process.stdout.write(renderHtml(articleRendererComparisonMarkdown, {
  allowHtml: false,
  frontmatter: false,
  headingIds: false,
  headingAnchors: false,
}));
JS
```

This command uses Node's native TypeScript support (verified with Node 24).
The result is a body fragment; full page composition and publication are separate.

**Modules / Brick hover transitions** compares background tint with five hard-shadow
options: the original, tight, bold, tinted, and position-aware shadows. Hover or
focus a preview, or enable **Hold hover state** to compare the emphasis. The
position-aware option casts its shadow away from the viewport center and moves
the surface toward it; direction updates on scroll, resize, layout changes, and
pointer entry or focus. Each option has browser chrome around a clipped viewport,
with the bricks flush against its edges. Reduced motion removes lift and
animation. These treatments remain available for comparison; the shared brick
UI uses an immediate dark border.

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
visibility transform. Its optional `persistentHeader` retains a 56px navigation
bar while a controlled bottom drawer's body closes; reduced motion skips the
animation and the closed body is inert. These are retained shared capabilities,
not a requirement to recreate the retired Library shell in App. Drawer owns no
routing, breadcrumbs, or settings actions. App retains its own route-owned
transitions and drawer lifecycle.

`ModuleFilmstrip` is router-independent and receives host links through
`renderModuleLink`. Columns scroll vertically inside a horizontal strip, with
headings pinned above their previews. App supplies catalog/insertion actions;
Storybook supplies its own module examples. Live preview content stays interactive.

The local **Cards** choice is supplied through `BrickCardStyleContext`. In module
playgrounds the checkbox appears in the Module section; App retains its existing
appearance control. Cards use an 8px radius, white background, and preview shadow.
The local flag starts false, writes no Page/Site preference, and changes no model
layout or preview width. Existing hover/shadow studies remain available.

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

| Module                           | Default width | Default height |
| -------------------------------- | ------------- | -------------- |
| Article                          | 720px         | `null`         |
| GitHub Activity                  | 656px         | 180px          |
| GitHub Profile                   | 360px         | 360px          |
| GitHub Repo, Link                 | 480px         | 180px          |
| Figma Thumbnail, Image, Map Place | 480px         | 360px          |
| Instagram                        | 400px         | 360px          |
| Swatch and Icon                   | 240px         | 90px           |

`defaultHeight` uses `45 | 90 | 180 | 360 | 720 | null`; `null` means natural
content height. The shared height floor is 45px. Optional `minHeight` declares
a higher floor (`90 | 180 | 360 | 720`), and every current variant omits it.
`defaultHeight: null` also identifies variable-height content for Row sharing.
The shared `canShareRow` rule lets an empty Row accept any variant, but a
nonempty Row can contain only fixed-height variants. The development preview
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
preview content. Ordinary links, forms, Image upload drag/drop, and module-owned
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

Module views require a display-only `variants.default.placeholder` in `makeModuleView`
and `hasPlaceholder: true` in the backend `makeModuleVersion` declaration.
Each variant's public `placeholder` field is required and receives no props.
The module renderer selects the placement variant's placeholder for null state,
so consuming routes do not repeat placeholder handling.

All ten modules declare a module-owned placeholder. Exact null selects it before
state decoding or JsonRender execution; empty strings, objects, and collections
still use the normal schema/rendering path. Article, Map Place, Swatch and Icon,
and Image use explicit unconfigured presentations. Catalog `defaultState`
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
structured element, and a root that exists in the element map. The versioned
manual spec contracts also check module component types and props. The current
hard-cutover baseline binds these strict declarations directly.
The spec primitive applies validation to model operations and query decoding,
so consumers do not need an empty-spec rendering fallback. The root-membership
filter runs in Effect and is not represented in generic JSON Schema.

Module defaults, preview state, and authored rendering discard undeclared fields
during decoding. App's `updateBrick` validates the selected module's state, checks
`moduleId` against the stored Brick, and persists shared content while advancing
its revision and superseding active spec generation. Null is accepted for all ten
modules. Spec validation remains strict. The command preserves each Placement's
identity, layout membership, and spec; it stores no pixel dimensions, `gridItem`, or visibility.

## App-owned persisted editor

App's user aggregate owns the final Page and directly referenced Wall/Brick
models and separate Placement records. A Page has sm/md/lg/xl Walls;
`Wall.layout` owns ordered Section, named Stack, and Row nodes. Rows list
Placement IDs side by side. The nodes retain stable IDs without separate tables
or numeric positions. Brick content is shared across all four Walls. Placements
retain stable identities, direct `wallId`, and per-width specs/revisions/generation.
Breakpoint derives from that Wall; content/spec changes leave layout arrays alone.

State-save and spec-update command declarations belong to QRK's user aggregate
and bind concrete model versions there. The current V1 baseline exposes no
provider configure/complete commands or retained compatibility release. App supplies module
schemas, input normalization, and provider operations; it does not construct
contracts from injected host models or versions.

The shared controlled wall components render supplied data and action callbacks.
App's `WallEditorProvider` supplies live queries, command staging,
selected Brick routing, and drag scope. The Wall Editor story mounts that provider
with the existing in-memory MockInitializer and seeds Wall layouts plus separate
Placement records. New-Brick creation, layout moves,
and global Brick deletion are ordinary App commands. Pure layout functions edit
ordered arrays, and each command records the complete atomic change. Moves prune
all empty containers in their affected Wall after editing; Brick deletion prunes
only ancestors emptied by its Placement removals. Self-before moves do no cleanup.
The Wall remains usable
when empty; no pixel grid geometry or visibility state is persisted. Move drop
eligibility counts Stacks that survive cleanup; catalog additions retain their
existing capacity rules.
Layout containers have no padding or gutters. Drag controls overlay the
content. Layout moves use the separate drag grips.
Insertion boundaries appear only during dragging; the Wall renders
no Add or plus buttons. Empty Rows/Stacks in initial scaffolds or local fixtures
show drop placeholders; the applicable movement/deletion policy prunes them.

The hard replacement of the old layout tables is tracked in
[Plan 039](../../../wiki/archive/plans/039-plan-wall-owned-layout-tree.md). Generation
request/revision checks and per-Placement spec updates remain independent of the
structural tree. Runtime verification belongs to that plan.

**Selected** means the Brick's edit form is open; **active** means DOM focus.
Separate grip/menu controls leave links/forms interactive. Placements support
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

Image also offers a single-file dropzone and picker for nonempty PNG, JPEG,
WebP, or SVG images up to 5 MiB. Selection uploads immediately; success changes
only the draft Image URL until Save. `ImageUploadEnvironment` supplies one
host-owned operation, `upload(file): Effect.Effect<string, Error>`, returning the
uploaded URL. Each host binds that operation through its Effect Layer,
runner, and `ImageUploadRuntimeContext`; the shared form contract has no
Image-specific upload props.

Each host owns HTTP, endpoint configuration, multipart fields, credentials, and
response decoding. Storybook performs anonymous `POST /image/upload`; App's
host performs `/upload` with its current site ID
and fresh Clerk authorization. Both forward Effect interruption into `fetch`.
Image retains file validation, picker/drop behavior, drafts, pending/error
feedback, Save gating, and cancellation. Fields and Save stay disabled during
upload. Cancel or leaving the brick aborts unfinished requests and ignores late
results; completed R2 objects remain stored. Uploaded file bytes remain API-owned and are not included in browser session storage.

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
drafts; breakpoint switches retain the form draft.

Native Meowdown controls retain formatting, selection, undo/redo, block dragging,
and image resizing. Resizing writes width/height into a trailing Markdown comment.
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
comparison includes arrangement. Editing bookkeeping and former grid geometry are
excluded. Shared module source supplies schemas/default specs and rendering, not
an independent persisted owner or WallSnapshot model. Public-site rendering remains
outside this editor change.

Brick and Placement model factories accept stable model definitions (name and ID
abbreviation), and declare their relationships with SDK `modelRef`. They do not
require the parent model version's Table object. The host aggregate owns the
selected versions and the complete relation graph.
