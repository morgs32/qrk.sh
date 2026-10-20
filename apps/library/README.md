# Library

`@qrk.sh/library` is shared module/UI source and a Storybook workbench. App, API,
and Zerospin compile source imports directly, without a package build. The
standalone Library application, routes, and session are retired. App owns the
persisted editor; the Cloudflare API Worker remains in [`apps/api`](../api/README.md).

## Development and configuration

From the repository root:

```sh
pnpm nx run @qrk.sh/library:storybook
```

Open `http://127.0.0.1:10021`; `PORT` overrides that default. Root `pnpm dev`
starts Web, App, API, and Zerospin, and starts no Storybooks. Library has no
standalone `dev:app`, Portless route, package build, or production preview target.
Consumers compile the shared source they import. Installation requires the
populated local registry described in the [root README](../../README.md#zerospin-packages).
Repository tests and standalone automated checks remain deferred until a test
structure is agreed. [Plan 036](../../wiki/archive/plans/036-plan-wall-tree-editor.md)
records manual browser verification, canonical outcomes, and source-review limits.

Put public/local workbench configuration in `apps/library/.env.local`:

1. `PUBLIC_MAPBOX_TOKEN` is exposed to the browser for Map Place previews.
2. `LIBRARY_WORKER_ORIGIN` optionally changes Storybook's server-side API proxy
   destination; it defaults to `http://127.0.0.1:8787`.

`.storybook/main.ts` installs `/rpc`, `/upload`, `/image/upload`, and `/assets/*`
proxies through `viteFinal`; Storybook replaces the base Vite server block before
that hook. `vite.storybook.config.ts` retains Vite plugins and the public Mapbox
definition. Browser callers keep same-origin URLs. Private
provider credentials stay in `apps/api/.env.local`; only the public Mapbox value
is defined in the workbench browser bundle. API retains generation, provider
helpers/backends, upload validation, and asset serving. `worker/*.public.d.ts`
contains shared browser RPC declarations, not the removed standalone session worker.
Linktree scraping stays in `@qrk.sh/scraper`.

API retains original `/assets/library/*` keys in `ASSETS` and other uploaded keys
in `QRKSH`. Existing bytes and browser partitions are preserved. Retiring the UI
does not reset databases, remove preferences, delete uploads, or migrate authored
absolute asset URLs. Earlier standalone storage/cutover observations remain
historical evidence in [Plan 029](../../wiki/archive/plans/029-plan-tanstack-start.md)
and [Plan 031](../../wiki/archive/plans/031-plan-component-jsonrender-previews.md);
they do not establish verification of the current editor.

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
`onSave(state): IResult`, module-specific `onConfigure(input): IResult`, and Cancel
callbacks. They receive no standalone session or Brick identity. App supplies real
command callbacks and renders saved query state, including optimism and rejection
rollback. Storybook supplies local example state. Forms retain only unsaved drafts.
Article, Image, and Swatch saves use `onSave`; image upload remains a separate
cancellable browser prerequisite. Null Image/Article/Swatch forms start with blank
drafts rather than catalog examples.

Instagram, GitHub Profile/Activity/Repo, Figma Thumbnail, Link and Map Place
normalize input in their own forms and call `onConfigure`. Their module view owns
the existing `configureCommand` name; App stages that command synchronously. The transaction records canonical
input, request identity and `resolution: resolving`, clears old computed data,
increments `stateRevision`, and supersedes active spec generation.
The query displays resolving, ready or failed state. Input correction stays
available while resolving; an identical resolving input is refused. Failed input
can be retried with a new request identity. Cancel discards only the unsaved draft.

`startLibrarySessionWork` now belongs to App and composes module-owned provider
executors at its authenticated user-session lifetime. Each executor
observes its module's retained intents, calls the existing same-origin API, decodes
module data and stages a guarded completion. Brick/module/request/revision checks
make stale or duplicate completions harmless. Closing an editor leaves submitted
work running; disposing or replacing its session closes requests and rejects late
results. A browser reload can rediscover resolving work in retained local state.
This is local execution while an editing session is open; no new backend owner or
server durability guarantee is introduced. Existing API provider credentials,
caches and identity validation retain their ownership.

GitHub accounts accept URLs or usernames. Repository input accepts an HTTPS URL
or owner/repository, strips `.git`, lowercases the owner and preserves repository
spelling. Figma normalizes supported document kinds and file identity. Instagram
normalizes usernames/profile URLs. Link removes fragments and retains its submitted
URL separately from resolved redirect metadata. Map Place keeps autocomplete as
transient search and stages the selected nonempty place ID.

Figma provider completion persists its resolved state without rendering hidden
breakpoint probes. State saves do not capture or persist preview dimensions.

Swatch and Icon retains the selected `{ hash, name, svg }` from paged icon search.
SVG data URLs are derived for presentation. Save validates a complete hex color
and stages the selected icon and color directly, including the saved icon when no
search runs. A new Swatch draft has no sample icon; an empty SVG renders no graphic,
so a saved color can stand alone at a minimum height of 64px. There is no Save-time icon request.

## Storybook

```sh
pnpm nx run @qrk.sh/library:storybook
pnpm nx run @qrk.sh/library:build-storybook
```

Open `http://127.0.0.1:10021`; App's Storybook uses port 10020.
`PORT` overrides either default. Library Storybook
uses its own Vite configuration, `storybook.css`, and retained module styles/fonts.
Fixture previews require no persisted editor or API Worker; live actions require
the existing API services. Stories live alongside their components in
`components/`, `lib/`, and `modules/`. The static build goes to
`apps/library/storybook-static/`.

Each **Modules / <module> / Playground** story preserves the former module page's
Module metadata, Generate spec and input, sm/md/lg/xl Component/JsonRender previews,
and Brick Definition JSON. **Configure example** edits local state. Save changes
the example JSON/previews; Cancel discards the draft. **Unconfigured** displays null
and blank forms/placeholders. The seven provider modules also have explicit
**Resolving** and **Failed** fixture stories. Provider previews use example data;
configuring a story does not start a persisted provider workflow.

Live Generate spec calls the existing `/rpc` operation with the current example
state/spec. It changes JsonRender while the authored Component stays independent
of that spec. Requests retain loading and error presentation. API credentials stay
server-owned. Story remount restores its declared fixture, and no Storybook action
creates a Page, Brick, or Placement in App.

**Library / Article / Meowdown spike** pairs an editable Markdown fixture with
live Markdown output. Its **Hide / Hybrid / Show** radio control changes syntax
visibility while preserving edits. This story uses local state only.
It shares Article's production typography and ordered/nested-list spacing.

**Library / Article / Renderer comparison** shows the current Meowdown article
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
cd apps/library
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

**Library / Brick hover transitions** compares background tint with five hard-shadow
options: the original, tight, bold, tinted, and position-aware shadows. Hover or
focus a preview, or enable **Hold hover state** to compare the emphasis. The
position-aware option casts its shadow away from the viewport center and moves
the surface toward it; direction updates on scroll, resize, layout changes, and
pointer entry or focus. Each option has browser chrome around a clipped viewport,
with the bricks flush against its edges. Reduced motion removes lift and
animation. These treatments remain available for comparison; the shared brick
UI uses an immediate dark border.

## Public exports and shared UI

`package.json` maps retained public subpaths directly to defining TypeScript,
TSX, or stylesheet source. App, API, and Zerospin compile reachable imports
without generated `dist` files. Canonical persisted models/contracts live under
`apps/zerospin/src/aggregates/user/`; shared module code accepts supplied inputs
and does not import that aggregate.

| Import under `@qrk.sh/library` | Defining source                              | Purpose                                  |
| ------------------------------ | -------------------------------------------- | ---------------------------------------- |
| `/backendLibrary`              | `backendLibrary.ts`                          | Worker-safe module catalog/default specs |
| `/modulesHash`                 | `lib/modulesHash.ts`                         | React module registry                    |
| `/ModuleFilmstrip`             | `lib/ModuleFilmstrip.tsx`                    | Shared horizontal catalog                |
| `/Drawer`                      | `lib/Drawer.tsx`                             | Shared drawer/presence behavior          |
| `/BrickCardStyleContext`       | `lib/BrickCardStyleContext.ts`               | Local preview appearance                 |
| `/WallViewportProvider`        | `lib/WallViewportProvider.tsx`               | Viewport state and hooks                 |
| `/WallBreakpointPane`          | `lib/WallBreakpointPane.tsx`                 | Fixed-width browser frame                |
| `/WallPreviewViewport`         | `lib/WallPreviewViewport.tsx`                | Frame spacing/scrolling/toolbar          |
| `/WallPreviewToolbar`          | `lib/WallPreviewToolbar.tsx`                 | Preview toolbar shell                    |
| `/breakpoints`                 | `lib/breakpoints.ts`                         | Breakpoint IDs and widths                |
| `/WallTree`                    | `lib/wall/WallTree.tsx`                      | Controlled wall presentation             |
| `/WallModuleAction`            | `lib/wall/WallModuleAction.tsx`              | Catalog insertion/drag action            |
| `/wallInsertionTargetSchema`   | `lib/wall/wallInsertionTargetSchema.ts`      | Explicit insertion destinations          |
| `/ImageUploadEnvironment`      | `modules/image/ImageUploadEnvironment.ts`    | Host-supplied upload Effect              |
| `/ImageUploadRuntimeContext`   | `modules/image/ImageUploadRuntimeContext.ts` | Form's host-supplied runner              |
| `/bricks.css`                  | `bricks.css`                                 | Shared brick styles                      |
| `/article-editor.css`          | `modules/article/article-editor.css`         | Meowdown typography/portaled controls    |

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

Every module's `makeModuleView` declaration requires `default.defaultWidth` in
pixels. Optional `sm`, `md`, `lg`, and `xl` overlays can override `defaultWidth`;
an omitted override uses the default directly. `viewFor(breakpoint)` returns the
resolved preferred width alongside the component, spec, and registry. Catalog,
Storybook, and App catalog previews cap that width at the chosen
breakpoint's canonical width. Browser frames retain their canonical widths.
This preference does not impose a minimum width or change persisted brick state.

| Module                                               | Default width | Breakpoint overrides     |
| ---------------------------------------------------- | ------------- | ------------------------ |
| Article                                              | 720px         | `lg`: 800px; `xl`: 800px |
| GitHub Activity                                      | 656px         | —                        |
| GitHub Profile                                       | 360px         | —                        |
| GitHub Repo, Figma Thumbnail, Image, Link, Map Place | 480px         | —                        |
| Instagram                                            | 400px         | —                        |
| Swatch and Icon                                      | 240px         | —                        |

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
`defineModule` declares identity; `makeModuleVersion` owns the catalog, `stateShape`,
canonical worker-safe `defaultSpec`, and `defaultState`. `makeModuleView` infers authored callback props from that state
shape and decodes incoming state before rendering, discarding undeclared fields.
Its authored wrappers are created once and reused by module rendering and previews.
It also attaches a json-render `generator` (`registry` + `defaultSpec`).

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

Modules can opt into unconfigured bricks with `hasPlaceholder: true` in
`makeModuleVersion` and a matching display-only `default.placeholder` in
`makeModuleView`. Omitting the flag defaults it to false. View construction rejects
both mismatches, so the backend declaration and markup must agree. The returned
module exposes `hasPlaceholder` and `placeholder`; one placeholder is shared across
all breakpoints and receives no props.

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
remain independent of view code. Optional `sm` / `md` / `lg` / `xl` overlays
select authored components and generators on top of `default`. View declarations
and `viewFor` expose no `w`, `h`, `minW`, `minH`, or measurement flags. Canonical
preview widths belong to `BREAKPOINTS`; modules own their ordinary CSS layout.
Placements hold ordering and a spec, with natural content dimensions supplied by
the Row cell. Content or preview dimension changes do not write model geometry.

Module defaults, preview state, and authored rendering discard undeclared fields
during decoding. App's `updateBrick` validates the selected module's state, checks
`moduleId` against the stored Brick, and persists shared content while advancing
its revision and superseding active spec generation. Null is accepted for all ten
modules. Spec validation remains strict. The command preserves each Placement's
identity, ordering, and spec; it stores no pixel dimensions, `gridItem`, or visibility.

## App-owned persisted editor

App's user aggregate owns the final Page and directly referenced Wall/Brick
models, plus Section, Stack, Row, and Placement. A Page has sm/md/lg/xl Walls;
Sections arrange Stacks horizontally, Stacks arrange Rows vertically, and Rows
arrange Placements side by side. Brick content is shared across all four Walls.
Placements retain stable identities and per-width specs, while ordering uses
integer sibling positions. Breakpoint derives from the containing Wall.

The shared controlled wall components render supplied data and action callbacks.
App's `WallEditorProvider` supplies live queries, command staging,
selected Brick routing, and drag scope. Local wall stories use fixtures
without that provider or any persisted session. New-Brick creation, layout moves,
and global Brick deletion are ordinary App commands. Empty containers survive
moves/deletion; no pixel grid geometry or visibility state is persisted.
Layout containers have no padding or gutters. Drag controls overlay the
content. Stack and Brick Move entry controls use the shared `ScreenReaderOnly`
component, remaining visually hidden even on focus while preserving screen-reader
access to the Move dialog. The dialog and its submit button remain visible.
Insertion boundaries appear only during dragging; the Wall renders
no Add or plus buttons. Empty Rows/Stacks retain their drop placeholders.

**Selected** means the Brick's edit form is open; **active** means DOM focus.
Separate grip/menu controls leave links/forms interactive. Placements support
Edit, Move, and Delete Brick actions. App's initialized session and actor guards
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
durability; Storybook example state lasts only for its mounted story. Consumers load `@qrk.sh/library/article-editor.css`
alongside `bricks.css` for editor and portaled-control styles.

## Wall publication snapshots

QRK owns editable models, publication serialization, and snapshot history under
`apps/zerospin/src/aggregates/user/`. Snapshots retain shared Brick content once and
four ordered Wall hierarchies containing Sections, Stacks, Rows, and Placements
with their specs. Array order follows saved sibling positions; publication dirty
comparison includes arrangement. Editing bookkeeping and former grid geometry are
excluded. Shared module source supplies schemas/default specs and rendering, not
an independent persisted owner or WallSnapshot model. Public-site rendering remains
outside this editor change.
