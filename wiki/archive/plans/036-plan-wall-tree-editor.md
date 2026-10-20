# App wall editor and Storybook module playgrounds

Status: complete, October 20, 2026. App owns the persisted editor; the ten module playgrounds run in Storybook. The standalone Library application and session are retired. Implementation, manual browser verification, canonical outcome inspection, and focused source review are complete; their evidence boundaries are recorded below.

## Problem and agreed scope

1. Replace App's empty wall preview with saved drag-and-drop layout editing. Retire the standalone Library application, its routes, and its session. Move its module playgrounds into the existing Library Storybook; use local fixtures there for wall-layout studies.
2. Use real models for Page, Wall, Section, Stack, Row, Placement, and Brick. This replaces the earlier chat proposal for a JSON `wallLayout.tree` or `wall.sections` field. There is no separate Tree, WallLayout, or Item model.
3. A Page has four Walls, one for each breakpoint. Each Wall owns ordered Sections; each Section owns ordered Stacks; each Stack owns ordered vertical Rows; each Row owns ordered, side-by-side Placements. Placements reference shared, Page-owned Bricks.
4. Changing layout affects only the active Wall. Changing Brick content affects all four Placements. Adding a Brick creates it at all four breakpoints; deleting a Brick removes all its Placements.
5. Deliver interactive module playgrounds in Storybook and the persisted editor in authenticated App. Keep the existing `@qrk.sh/library` package for shared production module definitions, forms, renderers, generators, components, and CSS. Removing the standalone application does not remove these consumers' source or rename the package. Hiding/restoration, public website rendering, Section dragging, container deletion, and new resizing/zoom controls are outside this version. Whole-Row dragging/Move controls are also deferred.
6. Preserve the existing prototype's Stack movement, Placement movement formerly called Item movement, insertion affordances, accessible Move dialogs, announcements, and focus restoration. Extend insertion and drop geometry for horizontal Placements inside vertical Rows.
7. Preserve App's preview frames, viewport sizing, initialized user session, drawer lifecycle, and production Bricks catalog. Storybook replaces the developer playground, not App's module chooser or Brick forms. Retiring Library does not authorize resetting its old browser data, deleting uploads, or removing shared API services.

## Domain model

1. Use the following direct-Page ownership shape in QRK's user aggregate. App is the only persisted editor host. Standard model identity and timestamps are implicit.

   | Model | Fields and responsibility |
   | --- | --- |
   | Page | Page identity, Site relationship, and publication metadata; owns shared content and four Walls. |
   | Wall | `pageId`, `breakpoint`; unique `(pageId, breakpoint)`. No label. |
   | Section | `wallId`, integer `position`. Orders Stacks as a horizontal band. |
   | Stack | `sectionId`, `name`, integer `position`. Holds Rows vertically. |
   | Row | `stackId`, integer `position`. Holds Placements side by side. |
   | Placement | `rowId`, `brickId`, integer `position`, existing `spec`, `specRevision`, and generation state. |
   | Brick | `pageId`, `moduleId`, shared `state` and `stateRevision`. |

2. Remove the former `Page.wallId`, `Wall.label`, and `Brick.wallId` ownership shape. Placement no longer owns grid geometry, visibility, or a duplicated breakpoint attribute. Derive its breakpoint through Row → Stack → Section → Wall.
3. Keep stable identities separate from ordering. Use ordinary `(parentId, position)` indexes; reindex the affected sibling lists in the same command when inserting or moving. Do not add unique position indexes that obstruct intermediate sibling renumbering.
4. Preserve one Placement per Brick per breakpoint. Retain deterministic Placement IDs from Brick ID plus breakpoint; guard that the Placement's containing Wall belongs to the Brick's Page and has the matching breakpoint. Stack and Placement moves stay within one Wall, preserving Placement identity and its spec.
5. Sections allow at most 1 / 2 / 3 / 4 Stacks at sm / md / lg / xl. These are Stack limits, not Row or Placement limits. Do not invent a Placement-per-Row cap.
6. Start each new Wall with one Section and an empty Stack. Empty Rows, Stacks, and Sections remain after moves or Brick deletion; do not collapse or delete them implicitly.
7. Row presentation default: equal-width Placement cells on one horizontal line, with natural content height. Stack Rows flow vertically. No weighted widths, automatic Row wrapping, or user-controlled cell sizing are included.

### Annotated example

```text
Page
  Bricks: A, B, C                    # 1. Shared content exists once.
  Wall sm
    Section 1
      Stack 1
        Row 1: Placement(A)
        Row 2: Placement(B), Placement(C)
  Wall md
    Section 1
      Stack 1                       Stack 2
        Row 1: Placement(A)            Row 1: Placement(C)
        Row 2: Placement(B)

# 2. Moving Placement(B) in sm does not change md.
# 3. Editing Brick B changes its appearances in both Walls.
# 4. Row 2 in sm is an actual Row record, not a JSON grouping.
```

## App ownership and declaration binding

1. Define Page, Wall, Section, Stack, Row, Placement, and Brick under `apps/zerospin/src/aggregates/user/`. The App backend owns canonical editor model/command declarations; the App frontend owns live queries, staging, and editor-session work. Remove `apps/library/libraryModule` once its production behavior has been transferred and every consumer has been updated.
2. Define the final Page independently of Wall, removing its old `wallId` import/reference. Bind Wall and Brick directly to that exact Page table; build Section, Stack, Row, and Placement against their canonical parents. Reuse these exact objects in the current user release, actor query/exposure declarations, contracts, and App browser session. There is no minimal standalone Page, host-bound `makeLibraryModule({ pageModel })`, or extra content-root model.
3. This resolves the previous Page-to-Library binding question by removing the second persisted host. The installed SDK binds foreign keys to exact Table objects; replacing a base Page in a registry after constructing children remains invalid. Direct canonical declarations avoid that substitution.
4. Keep module-specific state schemas, normalization, configure/complete programs, and provider algorithms in their owning modules. Existing parameterized contract factories receive the App's declarations; replace their concrete imports of the moved Library models without adding a shared-source import of QRK's user aggregate. Canonical instantiation and registration belong to App. Remove the obsolete whole-Library declaration assembly rather than introducing a replacement host factory or barrel.
5. The current System registers User V1, V2, and V3, and all reference Library's declaration assembly. Reconcile affected old registrations, declaration chains, and imports during the approved fresh-development cutover. Retire obsolete affected declarations as necessary; develop the current line without backporting this hierarchy or leaving imports of removed files. Preserve unrelated declarations and state.
6. No new named TypeScript aliases/interfaces are approved. Use model/schema inference, existing SDK types, and inline single-use props. Import canonical declarations from their defining modules.

### Annotated ownership example

```text
apps/zerospin/src/aggregates/user/
  Page                            # 1. Final Page has no dependency on Wall.
  Wall.pageId -> Page             # 2. Child declarations bind to that exact table.
  Brick.pageId -> Page
  Section -> Wall -> Page
  Stack -> Section
  Row -> Stack
  Placement -> Row + Brick

apps/app/                         # 3. One initialized user session stages commands.
apps/library/modules/             # 4. Production module behavior accepts supplied inputs.
Library Storybook                 # 5. Playground edits and wall fixtures stay local.
```

## Commands, creation, and persistence

1. Author ordinary commands for adding a Brick, adding a Section with an empty Stack, moving a Placement, moving a Stack, and deleting a Brick. A move's destination can create required intermediate containers where the existing interaction calls for that, rather than leaving a partial hierarchy. No general replace-tree command is needed.
2. Allocate any new identities once at the action boundary or derive them deterministically from existing command identities. Positions are resolved from stable before-sibling IDs against current model state. Do not send complete replacement layouts or use array indexes as destination identity.
3. `addBrick` creates one Brick with `state: null`, four Placements with their initial specs, and all required ordered parent records atomically. At the active Wall, honor the insertion target. At each other Wall, append a NEW Row containing its Placement to the last existing Stack across ordered Sections. Appending into the existing final Row would change the agreed vertical-append behavior into horizontal grouping.
4. If another Wall has no Stack, create one in its last Section; if it has no Section, create both. Then create the new Row and Placement. Perform this through the command, never a render effect or hydration helper.
5. Moving a Placement changes its Row and sibling order, retaining its Brick reference, ID, and rendering spec. A vertical row-gap destination creates a Row containing the Placement; a horizontal destination inserts into an existing Row. Preserve the source Row when it becomes empty. Moving a Stack carries all its Rows and Placements unchanged.
6. `deleteBrick` removes all its Placements and the shared Brick in one command; it preserves Rows, Stacks, and Sections. Update remaining Placement sibling positions. Leave the deleted selected Brick's form route after successful staging and restore focus to a surviving control. Existing provider completions already tolerate a missing Brick; retain that behavior without adding tombstones or cancellation machinery.
7. Validate Page/Wall ownership, parent membership, before-sibling membership, reference uniqueness, and Stack capacity authoritatively. Enforce existing module `maxPerPage` limits against shared Page Bricks, not four copies of Placement. Invalid or stale destinations refuse without partial mutations.
8. App's normal create-Page command creates Page, four Walls, and each Wall's initial Section and empty Stack atomically. Register every new model/command in canonical definitions, the current owner release/System, actor database/exposure/selections, and App's matching browser session. No standalone Page/Wall seed or persisted Storybook session is needed.
9. Actor selections follow the new parent chains to Page → Site → User. These selections do not replace command write guards. App retains its initialized user-session owner, disposal, and failure presentation.
10. Publish snapshots with shared Brick content once and four ordered Wall hierarchies containing Sections, Stacks, Rows, and Placements/specs. Update all publication contracts, snapshot codecs/builders, and saved-versus-published comparison. Preserve sibling order in serialized arrays; do not sort layout nodes by IDs. Public-site rendering remains deferred.
11. Update spec-generation queries and payload codecs that currently read `Placement.breakpoint` to resolve the Wall through its parents. Keep generation/request revisions, completion commands, and late-completion guards intact. Moving declaration ownership must preserve existing provider configuration, retries, and completion behavior.

## Module content and forms

1. Every module accepts null as its real unconfigured state. Add module-owned placeholders for Article, Map Place, and Swatch and Icon; replace Image's example-content placeholder with an unconfigured presentation.
2. Preserve catalog `defaultState` examples. Image, Article, and Swatch and Icon forms must not fall back from null to those samples; give them blank module-owned form drafts. An unconfigured Map is null, not a synthetic resolving provider state.
3. Expose each existing worker-safe `generator/defaultSpec.ts` value through its module declaration and read that canonical value from creation and views. Clone it into all four Placements when adding a Brick. Subsequent per-breakpoint editing/generation stays on Placement.
4. Use the existing placed-Brick renderer, including placeholders/provider states. Choose the spec by the containing Wall's breakpoint. Each Placement fills its Row cell; do not apply catalog `defaultWidth` or derive a different breakpoint from cell width.
5. After synchronous `addBrick` staging Success, open the new Brick's form. Optimistic rows already exist then. On Failure, retain the insertion target and let existing session failure presentation report it. Add no delivery waits, timers, polling, or duplicate failure toasts. Form Cancel discards edits but leaves the created unconfigured Brick.
6. Remove the standalone `ILibrarySession`/`brickId` requirement from shared visual forms, `makeModuleView`, and shared form contracts. The seven provider forms currently stage commands themselves; give their existing submission inputs module-specific callbacks. App supplies real configure/update command callbacks; stories supply local edits and explicit provider-state fixtures. Preserve module-owned validation, refusal feedback, null drafts, and Cancel behavior. Do not move module-specific business logic into a central App switch or use fake sessions/casts in stories.
7. `startLibrarySessionWork` is also used by App today. Transfer its actual session query/staging orchestration and spec-generation work into App before removing the standalone factory/type. Keep provider algorithms module-owned and supplied with the required inputs/callbacks. Preserve session-lifetime disposal, work continuing after form unmount, and request/revision checks; do not delete App's provider work with standalone startup.

## Storybook module playgrounds

1. Add a colocated interactive playground story for every existing module: Article, Figma Thumbnail, GitHub Activity, GitHub Profile, GitHub Repo, Image, Instagram, Link, Map Place, and Swatch and Icon. Keep existing Article editor/comparison studies and other stories intact.
2. Transfer the current module detail presentation into `lib/ModulePlayground.tsx`, used by those ten story files with an explicit module input. Transfer `BreakpointPreviewRow` into shared source. Reuse the current ordered-document presentation, previews, and JSON viewer rather than rewriting the module workbench or creating a separate developer application.
3. Each playground preserves these sections: Module metadata; Generate spec with Generate spec input; Previews containing sm, md, lg, and xl with authored Component and JsonRender side by side; and Brick Definition JSON. Include the existing module configuration form using local state. Preserve catalog example defaults and show null/unconfigured states through explicit fixtures.
4. Keep form drafts, saved example state, prompt, generated specs, loading, and errors local to the mounted story. Save updates the example and JSON/previews; Cancel discards drafts. Story navigation/remount restores the declared fixture. No Page/Wall records, user login, Zerospin session initializer, browser backup, or saved editor is required for these stories.
5. Preserve live spec generation through the existing API Worker's `/rpc` `generateSpec` operation. Reuse current request/response/error handling; generated results affect only the story's previews. Keep the OpenAI credential server-owned. Preserve existing Places/icon lookup and configured Image-upload support where those controls require them; do not add a second provider-resolution persistence flow to stories.
6. Keep Vite plugins and the public Mapbox-token definition in `vite.storybook.config.ts`. Install the existing development API/asset/upload proxies through `.storybook/main.ts`'s `viteFinal`: Storybook replaces the base Vite server block before that hook. Retain the API worker, its public contract/types, and App's provider endpoints. Storybook must not import the retired router or session to reach them. Normal fixture previews remain useful without starting backend services; live actions require their existing services.
7. The existing `.storybook/main.ts` already discovers colocated module stories and enables docs. Update `.storybook/preview.ts` to use retained Storybook CSS after extracting the globals it currently imports from `app/globals.css`. Keep App and shared-module styling intact.
8. Default and Zoomed Out wall stories use the shared controlled wall components with local fixtures/callbacks. App alone supplies the persisted `WallEditorProvider` and real navigation/commands; stories do not need that provider or its session.

### Annotated playground example

```tsx
// 1. Each module gets a discoverable story; this example is Swatch and Icon.
export const Playground = {
  render: () => <ModulePlayground moduleId="swatch-and-icon" />,
};

// 2. ModulePlayground reuses the current module detail sections and preview rows.
// 3. Its form Save updates local example state; Generate spec calls existing /rpc.
// 4. Neither operation creates an App Page, Brick, or Placement.
```

## Standalone Library retirement

1. Move reusable playground presentation, CSS, and App-required session work first. Then remove standalone `routes/`, router/generated route tree, Vite app entry/configuration, application layout/pages/error screens, seeded `librarySession.ts`, and standalone-only `useUpdateBrick`. Preserve the shared package and App's catalog/module/Brick routes.
2. Remove `createLibraryStandaloneSession.ts`, `librarySessionDefinition.ts`, and `librarySession.worker.ts` after adapting all consumers. Remove obsolete standalone context/hook/type references and package exports. Retain or transfer App-needed resolution/generation work instead of deleting the entire `session/` directory by assumption.
3. Remove Library's `dev`, `dev:app`, and Portless application metadata from its package configuration. Keep Storybook scripts and source exports used by App/API; remove dependencies used solely by the retired application through pnpm. Root Portless discovery currently finds `dev:app` scripts, so removing that script removes the standalone service from normal startup without replacing the root startup command.
4. Keep generation, provider lookup/resolution, uploads, and assets served by the existing API Worker. Preserve `apps/library/worker/` public contracts/types; those files are shared API declarations, not the retired standalone session worker. Update development origin/proxy configuration for Storybook and remove retired Library origins without changing unrelated access or service behavior.
5. Retain old standalone browser partitions and uploads. Removing runtime startup is separate from deleting stored data. Do not install redirects, a replacement Library server, a compatibility session, or a second Page owner.

## Components, markup, and drawer integration

1. Put `WallEditorProvider` in App, owning live queries, command staging, and editor drag scope for the initialized user session. Its identity is Page ID; it resolves that Page's four Walls and the active Wall from the viewport breakpoint. App supplies selected Brick ID and navigation callbacks to the shared controlled components. Keep shared wall presentation usable by local Storybook fixtures without a session dependency.
2. Compose `WallTree` → `WallSection` → `WallStack` → `WallRow` → `WallPlacement`. Tree names describe UI composition, not a persisted Tree object. `WallPlacement` replaces the former Item component. Extract the existing insertion presentation and accessible Move dialog behavior. Placement Move chooses Section, existing Stack or New Stack, then existing Row or New Row. An existing Row exposes horizontal Placement positions; New Row exposes vertical Row positions in the Stack; New Stack appends a Stack with its initial Row. Use the same destinations as dragging. Stack Move retains its existing Section/position and New Section modes; no whole-Row Move dialog is added.
3. Section renders an equal-width Stack grid; Stack renders vertical Rows; Row renders a horizontal grid of Placements. Each Placement has a noninteractive wrapper with separate drag grip/menu and live content. No wrapping button, click-to-select overlay, or fixed row height encloses module links/forms.
4. Use DOM focus/focus-within for active chrome and the open Brick form route for selected chrome. Reveal controls on hover, focus, selection, or an open portaled menu, and keep them available on touch. The ellipsis menu contains Edit, Move…, and Delete Brick. Confirm that deletion affects all breakpoints.
5. Register drag sources/targets only in the active Wall pane. Scope DOM IDs, focus targets, insertion anchors, and drag payloads by editor/Page, Wall, and node identity. Replace the prototype's document-global canvas target with the active preview canvas. Clean up listeners/transient state when a pane deactivates.
6. Use explicit insertion-target variants, all carrying `wallId`: `{ kind: "row", rowId, beforePlacementId }` inserts horizontally; `{ kind: "stack", stackId, beforeRowId }` creates a Row at a vertical boundary; `{ kind: "section", sectionId }` appends a new Stack and its initial Row; `{ kind: "wall", beforeSectionId }` inserts a Section with its initial Stack and Row. Nullable before-sibling IDs mean append. An empty Row exposes its row target with `beforePlacementId: null`; an empty Stack exposes its stack target with `beforeRowId: null`. Empty Sections/Walls use their own variants, so the drawer never needs a fabricated Row/Stack ID or a fallback destination. Creation is atomic with the chosen Brick/Placement.
7. Insertion controls open the existing Bricks drawer with a query-encoded insertion target. The target includes Wall ID and its destination kind/IDs; derive breakpoint from that Wall. No temporary Placement or Row is persisted on opening the drawer. Decode route input and revalidate destination ownership during the command.
8. Targeted mode shows a prominent + at the module preview's top right. The preview's own content stays interactive. Normally opened catalogs retain browsing links and a module drag grip. Closing/cancelling, leaving the catalog, or changing active breakpoint clears insertion mode without creating records. Malformed/stale targets never fall back to arbitrary placement.
9. Integrate App's empty preview, existing Bricks catalog, module drawer routes, and Brick form routes. Keep shared drawer/viewport components and the useful behavior completed in [Plan 035](035-plan-persistent-library-drawer-navigation.md). Retiring the standalone shell does not require porting that shell or its 56px navigation to App; App adoption remains separate. Preserve App's current drawer accessibility, form cancellation, and scrolling.
10. Reuse the shared controlled tree components from Default and Zoomed Out stories with local fixtures and action callbacks. Keep the existing fixed-50% story and interaction ownership; do not introduce another production zoom feature.

### Annotated markup and insertion examples

```tsx
// 1. The Stack arranges Row models vertically.
<div data-wall-stack={stack.id}>
  {/* 2. A Row arranges Placement models horizontally. */}
  <div data-wall-row={row.id} className="grid min-w-0 items-start">
    <div data-wall-placement={placement.id} data-selected={selected}>
      {/* 3. Grip/menu are siblings of live content, never its wrapper button. */}
      <div data-wall-placement-controls>{/* Drag, Edit, Move, Delete. */}</div>
      <BrickWrapper className="h-auto">
        <brickModule.component state={brick.state} breakpoint={wall.breakpoint} spec={placement.spec} />
      </BrickWrapper>
    </div>
  </div>
</div>
```

```text
1. Stack 1 has Row A: [Placement X, Placement Y].
2. Insert at Row A / before Y → choose module in drawer → [X, New, Y].
3. Insert at Stack 1 / after Row A → choose module → new Row B: [New].
4. The other breakpoint Walls append a new Row; their existing Rows stay intact.
5. Cancel the chooser → no Brick, Row, or Placement was reserved or created.
6. Move X to an empty Row → preserve X's ID/spec and the emptied source Row.
```

## Implementation sequence and intended files

1. Establish App's canonical declarations under the user aggregate. Remove Page's old Wall dependency; transfer/revise Wall, Brick, Placement, and content/spec command bindings; add Section, Stack, and Row. Bind children to the final Page and parent tables. Reconcile current System/release/actor/session registration and affected obsolete declarations without a host factory or compatibility copies.
2. Implement atomic layout commands, create-Page hierarchy, actor selections/guards, snapshots, and publication comparison. Adapt breakpoint derivation in generation and content/spec programs. Follow installed Zerospin authoring/evolution guidance; change authored data only through seeds or command execution/replay.
3. Decouple shared module forms and provider algorithms from the standalone session type. Move App's session work to its initialized user-session owner, adapting existing module factories/executors through their inputs. Preserve App's generation, provider completion, lifetime, and refusal behavior before removing old session files.
4. Add canonical module specs and uniform unconfigured placeholders/forms. Extract the module playground and breakpoint preview presentation, create the ten module stories, wire live API actions, and retain Storybook CSS/assets. Preserve App's module chooser and production forms.
5. Extract controlled wall components and adapt Default/Zoomed Out Storybook fixtures. Add App's persisted `WallEditorProvider` and separate `WallEditorContext`; wire its preview, catalog actions, insertion-query boundaries, selected-form routing, and focus behavior. Library directly depends on the two packages the extracted controls consume: Pragmatic Drag and Drop 4.0.0 and live-region 2.1.0. Remove App's four former prototype dependency declarations through pnpm; neither package's new implementation consumes hitbox or react-drop-indicator. Use installed Base UI primitives and existing Button.
6. Retire the standalone routes/layout/session/Vite application and package startup entries after replacements and App consumers are ready. Remove obsolete imports/exports and standalone-only dependencies through pnpm. Keep the package, existing Storybooks, shared module source, API contracts/services, and uploads. Export retained shared entrypoints directly from defining modules; add no barrels, casts, or unapproved named types.
7. Update startup/origin documentation and perform the approved fresh local development cutover and manual verification below. Preserve concurrent drawer, catalog-sizing, Article, and research edits throughout. Removing the standalone shell must preserve useful concurrent shared-component changes.

Legend: `+` create; `~` modify; `-` remove after transferring retained behavior. Brace groups list files sharing a status. Directory entries cover the stated concern within that directory, not unrestricted cleanup. File moves appear as a removal and creation; the existing `@qrk.sh/library` package remains in place.

```text
qrk.sh/
├── README.md                                                   ~ (runtime services and Storybook)
├── pnpm-lock.yaml                                              ~
├── apps/library/
│   ├── AGENTS.md                                               ~ (shared source and Storybook ownership)
│   ├── package.json                                            ~
│   ├── README.md                                               ~
│   ├── .storybook/{main,preview}.ts                            ~ (only discovery/style wiring needed)
│   ├── vite.storybook.config.ts                                ~
│   ├── storybook.css                                           + (retained globals from app/)
│   ├── libraryModule/                                          - (transfer persisted declarations)
│   ├── lib/
│   │   ├── {ModuleFilmstrip,ModulePreview}.tsx                   ~
│   │   ├── types.ts                                            ~ (remove standalone form/session coupling)
│   │   ├── ModulePlayground.tsx                                + (existing module detail presentation)
│   │   ├── BreakpointPreviewRow.tsx                            + (moved from standalone module route)
│   │   ├── makePlacementId.ts                                 + (retained deterministic identity)
│   │   ├── useUpdateBrick.tsx                                  - (standalone-only hook)
│   │   └── wall/
│   │       ├── WallTree.tsx                                    +
│   │       ├── WallSection.tsx                                 +
│   │       ├── WallStack.tsx                                   +
│   │       ├── WallRow.tsx                                     +
│   │       ├── WallPlacement.tsx                               +
│   │       ├── WallMoveDialog.tsx                              +
│   │       ├── WallModuleAction.tsx                            +
│   │       ├── InsertionSeparator.tsx                          +
│   │       └── wallInsertionTargetSchema.ts                    +
│   ├── make/{makeModuleVersion,makeModuleContracts,makeModuleSpecContractVersion}.ts ~
│   ├── make/makeModuleView.tsx                                 ~ (form callbacks, no standalone session)
│   ├── make/{makeBrickModel,makePlacementModel}.ts             + (retained generic makers, supplied parents)
│   ├── modules/ (declarations/views, forms, supplied contract/runtime inputs) ~
│   ├── modules/{image,article,mapPlace,swatchAndIcon}/*Placeholder.tsx +
│   ├── modules/article/Article.stories.tsx                      +
│   ├── modules/figmaThumbnail/FigmaThumbnail.stories.tsx        +
│   ├── modules/githubActivity/GitHubActivity.stories.tsx        +
│   ├── modules/githubProfile/GitHubProfile.stories.tsx          +
│   ├── modules/githubRepo/GitHubRepo.stories.tsx                +
│   ├── modules/image/Image.stories.tsx                          +
│   ├── modules/instagram/Instagram.stories.tsx                  +
│   ├── modules/link/Link.stories.tsx                            +
│   ├── modules/mapPlace/MapPlace.stories.tsx                    +
│   ├── modules/swatchAndIcon/SwatchAndIcon.stories.tsx          +
│   ├── app/                                                   - (after moving playground/CSS helpers)
│   ├── routes/                                                -
│   ├── {router.tsx,routeTree.gen.ts,vite.config.ts}              -
│   └── session/
│       ├── {createLibraryStandaloneSession,librarySessionDefinition}.ts -
│       ├── librarySession.worker.ts                            -
│       └── {startLibrarySessionWork,startBrickSpecGeneration}.ts - (move App-required work)
├── apps/app/
│   ├── README.md                                              ~
│   ├── components/ZerospinUser.tsx                             ~
│   ├── components/PragmaticTree.stories.tsx                     ~
│   ├── app/[username]/site/[siteId]/page/[pageId]/
│   │   ├── {EditorLayout,Grid}.tsx                             ~
│   │   ├── WallEditorProvider.tsx                              + (App session/queries/staging)
│   │   ├── WallEditorContext.ts                                + (stable context across provider hot updates)
│   │   ├── Modules/Modules.tsx                                 ~
│   │   ├── BrickDetail/BrickDetail.tsx                         ~
│   │   ├── (drawer)/(bricks)/modules/[moduleId]/page.tsx         ~
│   │   └── (drawer)/DrawerHeader.tsx                           ~
│   ├── routes/ (catalog insertion-search boundary)              ~
│   └── zerospin/
│       ├── userSessionDefinition.ts                            ~
│       ├── startLibrarySessionWork.ts                          + (transferred existing orchestration)
│       └── startBrickSpecGeneration.ts                         + (App queries/staging)
├── apps/zerospin/
│   ├── README.md                                              ~
│   └── src/
│       ├── system.ts                                          ~ (current affected release registration)
│       └── aggregates/user/
│           ├── models/page/                                   ~ (remove single-wall dependency)
│           ├── models/wall/WallV1.ts                           +
│           ├── models/section/SectionV1.ts                     +
│           ├── models/stack/StackV1.ts                         +
│           ├── models/row/RowV1.ts                             +
│           ├── models/brick/BrickV1.ts                         +
│           ├── models/placement/PlacementV1.ts                 +
│           ├── models/{wall,section,stack,row,brick,placement}/ + (model identities/Placement ID helper)
│           ├── actors/userActorV3.ts                           ~
│           ├── UserV3.ts                                      ~
│           ├── userSessionDefinitionProps.ts                  ~
│           ├── contracts/createPage/CreatePageV3.ts             ~
│           ├── contracts/wall/
│           │   ├── AddBrickContractV1.ts                       +
│           │   ├── AddWallSectionContractV1.ts                 +
│           │   ├── MovePlacementContractV1.ts                  +
│           │   ├── MoveStackContractV1.ts                      +
│           │   └── DeleteBrickContractV1.ts                    +
│           ├── contracts/brick/                               + (canonical content/provider/spec bindings)
│           ├── contracts/{publishSite,publishPage,publishPageUpdates}/*V2.ts ~
│           ├── snapshots/{pageSnapshotSchema,makePageSnapshot}.ts ~
│           └── superseded affected releases/actors/contracts   - (after registration/import reconciliation)
├── apps/api/
│   ├── README.md                                              ~
│   └── http.ts                                                ~ (development origins only)
└── wiki/
    ├── glossary.md                                             ~ (after implementation)
    ├── brick-layout-conventions.md                             ~ (after implementation)
    └── archive/plans/036-plan-wall-tree-editor.md                       ~
```

## Cutover and manual verification

1. The user approved fresh affected development state. Stop local QRK backend development and move only `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1` aside using the documented backup-directory procedure. Start matching current definitions and require `system spec accepted` readiness. App's changed browser declaration lock opens a new partition; retain old App/Library partitions, authentication, preferences, uploads, unrelated stores, and production state. Storybook requires no persisted partition. The executed backup location is recorded below.
2. Recreate a development Site/Page through ordinary App commands. Verify Page creation yields four Walls, each with one Section and empty Stack, without render-time writes. Verify matching current System, user actor, and browser declarations; do not restore a standalone seed/session as a workaround.
3. Exercise horizontal insertion before/after Placements, vertical insertion before/after Rows, empty Row/Stack targets, Section-background insertion, cancellation, stale/cross-Wall targets, Stack capacity, and existing module count limits. Check new Brick creation affects all four Walls and adds a new Row at the other widths.
4. Move Placements within/across Rows and Stacks, move Stacks across Sections, and confirm IDs/specs and empty containers survive. Check the active Wall changes independently of other breakpoints. Confirm deletion removes all four Placements and the shared Brick while retaining Rows/Stacks/Sections.
5. Verify null placeholders and blank forms for all modules, shared content edits, form Cancel, late saves/provider completion after deletion, and refusal presentation. Check App persistence after reload, provider resolution after leaving its form, spec generation against the containing Wall's breakpoint, and session disposal. Inspect finalized outcomes through existing tooling rather than treating local staging as server completion.
6. Exercise live module links/forms, keyboard Move and focus restoration, selected versus active chrome, menu/dialog focus, touch-available controls, inactive-pane exclusion, all widths, scrolling, reduced motion, and Default/Zoomed Out stories.
7. Confirm arrangement changes affect publication dirty state and snapshots retain the complete ordered Row/Placement hierarchy. Do not introduce public website rendering.
8. Open all ten module playground stories and verify metadata, local configuration Save/Cancel, Generate spec/input, all four Component/JsonRender previews, and Brick Definition JSON. Check fixture/remount isolation, null/provider-state examples, CSS/fonts/icons, Mapbox configuration, and existing Image/lookup controls. Verify live generation success/error handling using the API Worker, and ordinary fixture previews with no persisted user session. Never count a fixture as proof of a finalized App command/provider outcome.
9. Verify normal development startup exposes App, Web, API, and Zerospin without starting the retired Library application. Start Library's Storybook separately through its retained Nx target. Check App's Bricks catalog/forms remain available, shared/API imports resolve, and Storybook no longer imports standalone routes/session/globals paths. Verify removed package exports and origins have matching consumer/configuration updates; preserve uploads and old browser partitions.
10. Use existing Nx serve/Storybook targets when needed. Add no automated tests, backend integration suites, builds as new gates, or standalone check gates. Record browser observations, canonical outcomes, and source-review conclusions separately.

## Documentation and completion

1. Root AGENTS.md records the user-requested distinction: selected means an open Brick edit form; active means DOM focus.
2. Root/Library/App/API/Zerospin READMEs, Library's local AGENTS guidance, layout conventions, the existing glossary, and the obsolete Library-module named-type prescription are reconciled with the implemented ownership. Historical verification remains historical.
3. No ADR was created. This development-line change uses the agreed direct ownership model and does not introduce a separate hard-to-reverse decision needing an ADR.
4. Retain the existing generic Brick/Placement makers as shared parameterized declarations; App instantiates canonical identities and parents. No whole-Library host factory, compatibility assembly, named TypeScript alias/interface, or cast was added.

## Completion evidence

1. **Development cutover and startup.** Moved only the affected backend directory to `apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-20261020T221436Z-pre-plan-036`. The backend reported `Ready on http://127.0.0.1:8788/ (system spec accepted)`. Portless lists exactly Web, App, API, and Zerospin; the retired Library route is absent. App and Library Storybooks run separately at 10020 and 10021. Authentication, old browser partitions, uploads, unrelated state, and production storage were preserved.
2. **Persisted App scenario.** Created development Site `sit_nuWxB298Z8dgRT663j1Y3` and Page `pag_N9hVACeh2k--xA1E9L8CN` through App. Page creation yielded four Walls, four Sections, and four empty Stacks. Added two Swatches, saved their colors, inserted them horizontally in lg while the other Walls appended separate Rows, moved one Placement into a new Row, and moved its complete Stack into a new Section. IDs/specs survived and emptied containers remained. Add Section created its empty Stack. Delete Cancel retained content; confirmation removed a shared Brick and all four Placements.
3. **Forms and provider work.** Null Swatch/Article forms opened blank. An unsaved Article remained a null Brick after cancellation; attempting a second Article displayed the existing Page limit and created no canonical command or extra records. GitHub Profile resolved `octocat` after its form closed. Canonical configure and completion outcomes finalized successfully; saved state is ready, error-free, revision 2. Deleting the selected Article closed its form and retained all four empty Rows. Full App reload restored saved layout/content and showed no unpublished changes after Publish Updates.
4. **Canonical outcomes and publication.** Finalized Success outcomes include Move Placement #20, Move Stack #21, GitHub configure/complete #23–24, Swatch deletion #25, Add Section #26, Publish Site #27, Article creation/deletion #28–29, and Publish Updates #30. Final canonical counts are four Walls, six Sections, five Stacks, sixteen Rows, two Bricks, eight Placements, and two snapshots. Both snapshots store shared Bricks once and ordered sm/md/lg/xl hierarchies through Placements. Shared content remained the same while Rows grew from twelve to sixteen; retained empty Article Rows made publication dirty and appeared in the newer snapshot.
5. **Shared interaction studies.** Default and fixed-50% Zoomed Out stories exercised native Placement/Stack/module dragging, horizontal and vertical destinations, keyboard Move, new containers, deletion Cancel/Confirm, announcements, and focus restoration. Equal-width cells, live button/input interaction, selected-versus-focused chrome, and retained empty containers were observed. App width switching showed independent layouts; switching widths cleared insertion mode. Coarse-pointer/mobile inspection kept controls visible on unselected Placements; reduced motion and scrolling were checked. Browser emulation overrides were restored.
6. **Module playgrounds.** Opened all ten module stories with metadata, local form configuration, Generate spec/input, four Component/JsonRender pairs, and Brick Definition JSON. Save/Cancel and remount isolation, null fixtures, resolving/failed examples, Mapbox containers, and existing lookup/upload controls were inspected. Live API generation displayed a validation error, recovered for another request, and then updated generated previews successfully. No file upload bytes or every external provider were exercised. A final visual check found and fixed a color-only Swatch collapsing to zero height; its owning component now has a 64px minimum and App visibly renders the saved color.
7. **Source-reviewed seams.** Focused review confirmed canonical ownership, stable-anchor membership, cross-Wall restrictions, Stack capacity, missing/deleted-resource guards, and request/revision checks. Provider completions and spec completion cannot recreate deleted records. App spec generation derives breakpoint through Row → Stack → Section → Wall. Session replacement/disposal unsubscribes, closes requests, and prevents late completion. These race/refusal paths and persisted spec generation were reviewed in source; they were not injected as runtime scenarios. Ordinary provider completion, moves, deletion, and the local module-limit refusal were exercised as described above.
8. **Verification scope.** Used existing Nx development/Storybook targets, manual browser interaction, read-only canonical inspection, and focused source review. Scoped formatting covered changed source. No test suite, backend integration test, build/typecheck gate, or standalone automated check was added or required. Public rendering, production deployment, and the explicitly excluded editor capabilities remain outside this plan.

## Navbar follow-up, October 20, 2026

1. The user requested App adoption of the persistent drawer navbar after this plan's initial completion. App now supplies its existing `DrawerHeader` through `persistentHeader`, reserves 56px while closed, and keeps Cards beside Display placeholders. The original floating Page controls remain available. Local preview toggles do not write Site settings.
2. Restored the historical `SiteHeader` and `Wordmark` inside the active breakpoint frame, above Wall content. The header retains its 64px height, saved site-name link, and Site Settings draft/Cancel behavior. This is editor preview presentation; public rendering remains outside scope.
3. Browser verification covered catalog/module/form navigation, close/reopen and focus restoration, working card styling and catalog placeholders, site-name draft/Cancel, and unsaved Brick-form close/reopen. At 390×844 the navigation slot stays 56px, scrolls horizontally, and the open drawer is 422px. Viewport/media overrides were restored. No persisted data or declarations changed.

## Remaining work

None.
