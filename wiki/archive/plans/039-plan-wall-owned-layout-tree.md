# Wall-owned layout tree

**Status:** complete and verified October 21, 2026, including the authorized local hard cutover and successful live provider generation after movement. All changes remain uncommitted.

## Problem and agreed scope

1. A Wall's arrangement is currently spread over Section, Stack, Row, and Placement records, with parent references and numeric positions. Reading and changing a tree requires reconstructing it through SQL and recording sibling updates. The former whole-Page deletion query exceeded Workerd's SQL expression-depth limit; subsequent focused implementations still expose storage bookkeeping in domain code.
2. Store each Wall's ordered structure in one required `layout` value. Preserve Sections, named Stacks, Rows, Placement identities, and every current editing behavior. Keep shared Brick content and independently editable Placement specs outside that value.
3. Cut over the current development baseline completely. Remove obsolete tables, relationships, numeric positions, operations, and query paths. Add no migration, payload adapter, fallback decoder, duplicate representation, compatibility release, or automatic storage repair.
4. The user authorized implementation, the exact local hard cutover below, and verification on October 21, 2026. Preserve unrelated staged and unstaged WIP, including the existing module/rendering and snapshot changes. Keep all QRK changes uncommitted. No upstream Zerospin package change is planned.
5. Behavior references: [Plan 036](./036-plan-wall-tree-editor.md), [Plan 038](./038-plan-development-brick-drops.md), the current [layout conventions](../../brick-layout-conventions.md), and [glossary](../../glossary.md). Current source and intentional WIP establish the implemented baseline where historical documents differ.
6. The follow-up user request explicitly authorized diagnosing and fixing the existing API generation failure so the final live check could finish. This bounded repair changes only provider response handling/validation and its documentation; it does not change the model, endpoint, persistence declarations, or cutover scope.

## Ownership and stored shape

1. `Wall` retains its ID, `pageId`, and breakpoint. Add required `layout: { sections: [...] }`, validated with Effect Schema. Array order is authoritative at every level.
2. A Section node contains `id` and `stacks`. A Stack node contains `id`, `name`, and `rows`. A Row node contains `id` and ordered `placementIds`. Nodes have no parent IDs, numeric positions, Brick state, or Placement specs.
3. `Brick` remains Page-owned shared content: module identity, nullable/unconfigured state, and `stateRevision`. Content changes continue to affect all four appearances.
4. `Placement` remains a separate model. Replace `rowId` and `position` with required `wallId`, related directly to Wall with inverse `placements`. Retain `brickId`, `variantId`, `spec`, `specRevision`, and the complete generation request/revision/status/error fields. Keep deterministic `makePlacementId(brickId, breakpoint)` identities. Replace the obsolete Row/position index with a unique Wall/Brick index, enforcing one appearance of a Brick per Wall.
5. A Placement's Row is determined only by its occurrence in `Wall.layout`. Its breakpoint comes only from its Wall. A Placement appears exactly once in its Wall's tree, belongs to that Wall, and references a Brick on that Wall's Page. Every tree reference resolves to a Placement record. Commands maintain these invariants atomically; specs and content are never copied into the persisted tree.
6. Section, Stack, and Row IDs retain their existing prefixes and deterministic construction. Define node ID schemas beside the layout schema. The installed `makeIdSchema` and `prefixId` accept an abbreviation object, so node IDs need no fake model declarations or table registration.
7. Remove the Section, Stack, and Row model/version/identity files and all their active registrations. Keep the current `V1` development baseline, System name `qrk-sh`, and System ID `sys_qrk_sh_1`; introduce no parallel old/new definition graph.

### Annotated stored example

```ts
// 1. Only structure and ordered references live on Wall.
layout: {
  sections: [{
    id: "sec_example",
    stacks: [{
      id: "stk_example",
      name: "Main",
      rows: [{ id: "row_example", placementIds: ["plc_a_sm", "plc_b_sm"] }],
    }],
  }],
}

// 2. Separate Placement records hold spec, revisions, variant, and generation.
// 3. Separate Brick records hold shared module content and its revision.
// 4. Moving plc_b_sm changes array membership/order, preserving both records.
```

## Existing behavior to preserve

1. `createPage` atomically creates a Page and four deterministic Walls at `sm`, `md`, `lg`, and `xl`. Each layout starts with one Section and an empty named Stack, with no Rows. Explicit empty scaffolding remains valid.
2. `addBrick` creates one shared null Brick and four deterministic Placements, with the current default variant/spec and initial revisions/generation. The active Wall follows its stable insertion target. Other Walls append a **new Row to the last existing Stack anywhere in ordered Sections**; trailing empty Sections do not override that Stack. If no Stack exists, use the last Section or create it, then create the Stack.
3. Row targets insert before the named Placement or append. Stack targets create a Row before the named Row or append. Section targets create a new Stack and Row. Wall targets create a Section, Stack, and Row before the named Section or append. Keep Section Stack limits of 1/2/3/4 at the four breakpoints, module limits, ownership checks, and existing refusal messages.
4. `addWallSection` retains its stable before-Section anchor and creates a Section with an empty Stack. Preserve Stack names and deterministic IDs through all operations.
5. Production `movePlacement` and `moveStack` remain within one Wall. Preserve Placement IDs/specs and Stack IDs/names/contents. Validate anchors before changing a candidate tree. Genuine self-before moves return unchanged and perform no cleanup.
6. Movement currently prunes **all** empty Rows, Stacks, and Sections in the affected Wall after the edit, then checks final Stack capacity. Preserve that policy. Moving an existing Placement continues to permit layouts that `addBrick` would refuse; adding variable-height enforcement to movement remains deferred.
7. `deleteBrick` removes the shared Brick, its Placement records, and their tree references in one command. Prune only ancestors emptied by those removals; preserve unrelated empty scaffolding. Walls survive as drop targets. The source should name the fetched record `brickRow`, and use `brickId` explicitly rather than a misleading `content` variable. Keep the current command payload and call sites; changing command subject binding is unnecessary for this storage cutover.
8. The `/dev/` preview remains palette-to-Wall only. Preserve hovered-Row compatibility, minimum-width fitting, incompatible-Row insertion immediately below, blank-Stack append, bottom insertion, seeded-Stack reuse, and truly empty Wall creation. Preserve selected preview widths, full-width 320px-minimum empty/bottom zones, truthful feedback, current-data re-resolution on drop, one command per accepted drop, refusal of stale/foreign/malformed drops, and undraggable existing Bricks. Do not introduce grid movement there.
9. Fixed-height variants can share despite differing heights; variable-height variants occupy a Row alone. Keep `canShareRow` shared by additions and the development resolver. Pixel fitting remains in the browser; existing mixed Rows remain renderable.
10. Production additions open the Brick form after local staging Success; development drops remain on the preview. Preserve Cancel behavior, selection versus focus, keyboard-accessible Edit/Delete menus, Delete confirmation cancellation/focus restoration, native drag behavior and announcements, and session-owned failure presentation.
11. Brick state edits retain shared revision increments and generation supersession across all four Placements. Spec edits affect only the selected Placement and its revision/generation. Movement must preserve in-flight generation. Completion continues to ignore deleted, superseded, stale, wrong-module, or revision-mismatched work. No spec/content edit or generation completion writes `Wall.layout`.
12. Preserve publication behavior and the existing `PageSnapshotSchema` payload: ordered Wall trees, stable IDs, Stack names, and separate Brick content plus Placement variant/spec payloads. All three producers—`publishSite`, `publishPage`, and `publishPageUpdates`—and the browser's Publish updates comparison must use the same snapshot builder. Public-site rendering remains outside this plan; there is no active renderer migration to invent.

### Annotated behavior examples

```text
Row [A, B, C] + insert D before B → [A, D, B, C]
# Stable ID anchors and array order replace numeric position changes.

Delete B from [A, B] → [A]
# Only the reference and separate B records disappear; no sibling update.

Delete the sole Brick in Row R → remove R; prune its Stack/Section only if emptied.
Unrelated empty Stack E → keep E.
# Deletion preserves the focused cleanup behavior added after Plan 038.

Move A elsewhere in the same Wall → insert A, then prune all empty containers.
Move A before itself → unchanged tree, including unrelated empty containers.
# Movement cleanup and no-op behavior remain deliberately different.

Edit A's spec → update Placement A only.
Edit A's content → update its shared Brick and current generation supersession.
# Neither operation rewrites the structural document.
```

## Layout module and command execution

1. Put the browser-safe schema, node ID schemas, and pure layout behavior under `aggregates/user/layout/`. Define canonical insertion/movement target schemas there with the existing payload shapes. Import them directly from App and commands; remove the App-owned duplicate schema file without leaving re-exports.
2. Keep one concrete layout module with four domain operations: `insertPlacementInLayout` for `addBrick`, `movePlacementInLayout` for `movePlacement`, `moveStackInLayout` for `moveStack`, and `removePlacementFromLayout` for `deleteBrick`. These functions own stable-node lookup, array editing, and their applicable cleanup policy. Keep shared lookup/pruning steps private when genuinely reused. Inline simple Section scaffolding in its owning create command.
3. Functions receive a layout, stable IDs/target, and any already allocated new node IDs or concrete capacity needed for that operation. They return the next layout through Effect's existing `Result` for expected structural refusals, preserving existing messages. They perform no database reads, command submission, navigation, random ID allocation, or recording operations. Use inferred or schema-derived inline types; add no generic tree engine, model/version injection, factory, named type framework, or persistence adapter.
4. Preserve input trees. Build an edited candidate, validate it, then return it; do not mutate query results while exploring a destination. Return the original layout for genuine no-ops so commands record no Wall update. Movement validates destination/self-before behavior before removal and performs whole-Wall pruning only after insertion.
5. Commands retain authorization, module limits, record existence and Wall/Page membership checks. Read current canonical data during execution, calculate each changed layout once, and record one `updateWall` per changed Wall alongside the ordinary Brick/Placement operations. Submit intent and IDs from the browser, never a replacement layout. Use the existing atomic evaluation/application and optimistic reconciliation; add no layout revision, lock, retry layer, or second write path.
6. Schema validation checks node shape, ID prefixes, and uniqueness of node/Placement references within a layout. Commands validate record membership at insertion and movement seams, including Placement Wall identity and Brick Page ownership. Creation includes the proposed new records in those checks. The complete checked operation batch applies together; recorded creates/deletes are not visible to subsequent reads during evaluation.
7. A missing referenced Placement during rendering/snapshot construction is a broken trusted invariant. Surface it through the owning error path; do not skip it, manufacture a placeholder record, fall back to an old table, or reconstruct an alternate saved tree. Keep normal route misses distinct from invariant failures.

### Annotated deletion shape

```ts
// Proposed command sequence, after existing ownership checks:
// 1. Read this Brick's Placement records and their current Walls.
// 2. For each affected Wall, remove its Placement reference from that tree.
//    removePlacementFromLayout owns pruning only the emptied ancestor path.
// 3. Record one Wall update and the matching Placement deletion.
// 4. Record the shared Brick deletion; the complete batch applies atomically.
// No sibling-position updates, parent SQL traversal, or caller-supplied tree.
```

## Implementation sequence

1. Record the existing behavior above as the acceptance baseline. Inspect the current diff before editing and preserve unrelated WIP. Recheck installed Intent guidance and available existing Nx targets. **Stop the affected Zerospin and App dev watchers and close affected browser sessions/workers before editing model, actor, or session definitions.** Their automatic reload must not start the new graph against old retained storage; keep them stopped until the coordinated cutover. Preserve old browser namespaces and unsent work. No new tests, fixture files, standalone check gates, dependencies, or framework changes are part of this plan.
2. Add the required layout/node schemas and concrete pure operations. Keep IDs deterministic using the existing suffix construction and abbreviation-only ID helpers. Preserve meaningful refusal messages and the two distinct cleanup policies. Move the existing target schemas to their canonical shared defining file without changing encoded target URLs.
3. Change `WallV1` and `PlacementV1`/`makePlacementModel` to the stored shape above. Update the canonical aggregate, actor database/exposure/selections, and App session together. Remove Section/Stack/Row registrations and declarations, obsolete mutation capabilities, and the old `cleanupWall` recording helper. Keep the current development versions and exact canonical objects throughout the graph.
4. Reimplement `createPage`, `addWallSection`, `addBrick`, `movePlacement`, `moveStack`, and `deleteBrick` using Wall trees and ordinary independent record operations. Preserve all refusal/anchor/limit behavior, especially non-active breakpoint insertion and capacity after movement cleanup. No new compatibility rule is added to movement.
5. Update Brick and spec command membership checks to use `Placement.wallId`, the direct Wall's Page/breakpoint, and its tree reference. Remove Row/Stack/Section SQL lookups. Retain request IDs, module checks, revision guards, supersession, and late-completion behavior in `UpdateBrickV1`, `GenerateBrickSpecV1`, and all ten `Update*SpecAtBreakpointV1` commands.
6. Shorten Placement actor visibility to `Placement → Wall → Page → Site → User`. Preserve Wall/Brick ownership paths, existing authentication/provisioning, capabilities, published-snapshot selection, and command write guards. JSON membership does not broaden actor access.
7. Replace editor/preview hierarchy queries with shallow Wall reads including separate `placements` and their `brick` relation. Read structural order from `layout`; never sort by IDs or retain position sorting. Add one concrete App `makeWallLayoutView` that resolves Placement IDs for the production provider and development route. Preserve each owning renderer and `WallTree`'s existing controlled presentation props; do not move React/module rendering into the backend layout module.
8. Update direct node ID validation and imports in wall controls, route context, catalog, and target consumers. Update `startBrickSpecGeneration` to obtain its Wall directly. Preserve its session lifetime, existing locks and attempted-request tracking, disposal, provider behavior, and completion submission.
9. Change `makePageSnapshot` to walk Wall layout arrays and resolve separate Placement records. Remove Section/Stack/Row parameters. Preserve its output schema and deterministic Brick/breakpoint ordering; update all three publication producers and `DrawerHeader`'s saved-versus-published comparison together. Keep snapshot formatting separate from the App's React presentation.
10. Update the existing `WallEditorProvider` Storybook seed: embed structural nodes in Wall resources and give Placement resources `wallId`. Remove the three obsolete resource maps. Retain the existing MockInitializer, empty/populated scenarios, current ordinary commands, and forms; create no additional fixture or test infrastructure.
11. Perform the coordinated local cutover below only when implementation is requested and the exact execution scope is authorized. Do not start the new definitions against retained old storage. Then complete the manual/build verification below.
12. After implementation, update App/backend/module documentation, layout conventions, and the existing glossary. Create an ADR only after the implemented storage trade-off meets the repository's criteria; do not create it during planning. Record actual verification and outstanding gaps in this plan. Archive only when required work is complete.

## Hard cutover and state ownership

1. Source change is a replacement of the development baseline, not a migration. Remove the old structural tables and every reader/writer/registration. Do not preserve obsolete models under aliases or adapt old commands into the new tree. Retained old operations cannot be replayed against the new graph.
2. The concrete proposed **local backend** cutover target is `/Users/morgs32/GitHub/qrk.sh/apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1`. Before execution, confirm the target and local reset authorization; an explicit implementation request accepting this plan's exact local scope supplies that authorization. This planning turn performs no storage operation.
3. Confirm the affected watchers and sessions/workers remain stopped from implementation step 1. Move that exact backend directory to a timestamped backup under `apps/zerospin/.wrangler/zerospin/backups/`, then start the new baseline with empty affected storage. Definitions, admitted history, version materialization, projections, and checkpoints cut over together; resetting only model tables is insufficient. The backup is offline recovery material, not a compatibility source for the new graph.
4. Initialize a fresh matching App session. The installed runtime includes the complete session definition hash in its storage identity, so changed model bindings select a new browser namespace. Preserve the old namespace and its unsent work as old-state data; do not replay/import it into the new namespace or clear all IndexedDB. Preserve Clerk login, cookies, credentials, preferences, unrelated app partitions, API/R2 uploads, and every other backend store.
5. Wait for `Ready on http://127.0.0.1:8788/ (system spec accepted)`. Create new Sites/Pages/Bricks through normal commands. Do not import old layout rows, directly seed canonical SQL, silently recover old sessions, or add automatic reset logic.
6. Production and remote Durable Object state are excluded from this local plan's execution scope. Keep System identity unchanged; do not bypass incompatible retained state with a new ID. A production deployment requires its own exact reset/data scope and authorization. A successful local build is not permission to deploy the cutover over production history.

## Planned file hierarchy

`+` creates, `~` modifies, and `-` removes. Braced/grouped entries cover the existing concrete files; no replacement barrels are introduced.

```text
qrk.sh/
  apps/api/
    ~ README.md                                      # Provider protocol and canonical validation.
    modules/
      ~ generateSpec.ts                              # Bounded repair to finish live verification.
  apps/zerospin/
    ~ README.md
    src/
      modules/make/
        ~ makePlacementModel.ts
      aggregates/user/
        + layout/wallLayoutSchema.ts
        + layout/wallTargetSchemas.ts
        + layout/wallLayout.ts
        ~ models/wall/WallV1.ts
        ~ models/placement/PlacementV1.ts
        - models/section/{SectionV1.ts,section.ts}
        - models/stack/{StackV1.ts,stack.ts}
        - models/row/{RowV1.ts,row.ts}
        ~ UserV1.ts
        ~ actors/userActorV1.ts
        ~ contracts/createPage/CreatePageV1.ts
        ~ contracts/wall/{AddBrick,AddWallSection,DeleteBrick,MovePlacement,MoveStack}ContractV1.ts
        - contracts/wall/utils/cleanupWall.ts
        ~ contracts/brick/{UpdateBrickV1,GenerateBrickSpecV1}.ts
        ~ contracts/brick/Update*SpecAtBreakpointV1.ts
        ~ contracts/publishSite/PublishSiteV1.ts
        ~ contracts/publishPage/PublishPageV1.ts
        ~ contracts/publishPageUpdates/PublishPageUpdatesV1.ts
        ~ snapshots/makePageSnapshot.ts
  apps/app/
    ~ README.md
    ~ modules/README.md
    ~ zerospin/userSessionDefinition.ts
    ~ zerospin/startBrickSpecGeneration.ts
    + modules/lib/wall/makeWallLayoutView.ts
    - modules/lib/wall/wallInsertionTargetSchema.ts
    ~ modules/lib/wall/*.tsx                         # Direct schema imports; keep presentation.
    ~ routes/$username.site.$siteId.dev.page.$pageId.$breakpoint.tsx
    app/[username]/site/[siteId]/page/[pageId]/
      ~ WallEditorProvider.tsx
      ~ WallEditorContext.ts
      ~ Modules/Modules.tsx                         # Canonical target schema import.
      ~ (drawer)/DrawerHeader.tsx
    ~ components/WallEditorProvider.stories.tsx
  wiki/
    ~ brick-layout-conventions.md                    # After implementation.
    ~ glossary.md                                    # After implementation.
    + plans/039-plan-wall-owned-layout-tree.md
```

## Verification and completion

1. Use existing App build and Storybook build targets through `pnpm nx`; use the existing Zerospin dev target for accepted-definition/runtime evidence. Discover the current targets before executing them. Add no test suite, new fixture files, backend integration-test harness, standalone scripts, or check gates.
2. On fresh local state, verify Page creation yields four layouts with the expected deterministic seed nodes. Verify seeded reuse, truly empty Wall insertion, every stable insertion target, Section capacity, module limits, invalid ownership, and stale/foreign anchors. Inspect canonical command outcomes and model/tree data read-only, distinguishing staging Success from canonical execution.
3. Repeat Plan 038's fitting/overflow/Article/differing-height examples, middle Row insertion, blank Stack append, bottom Section creation, cancellation, malformed/foreign/stale data, and breakpoint replacement during drag. Verify one command per successful drop, 320px minimum zones, fixed preview widths, no existing-Brick drag source in the preview, and persistence/order after synchronization and reload.
4. In the production editor, manually verify Placement and Stack movement within and between parents, stable IDs/names/specs, self-before no-ops, whole-Wall empty-container cleanup, final capacity refusal with no partial change, keyboard-accessible Edit/Delete menus, Delete confirmation cancellation/focus restoration, drag announcements, and unchanged movement compatibility policy. Verify focused Brick deletion preserves unrelated empty scaffolding and removes its four appearances and records atomically.
5. Verify a content edit updates all four rendered appearances without changing any layout. Verify a spec edit changes only one Placement and no layout. Verify generation followed by movement still completes; supersession/content edits and deletion cause late results to be ignored. Preserve current session disposal and failure presentation.
6. Publish a Site, publish a Page, and publish Page updates. Confirm array order, stable IDs/names/specs/content, and unchanged snapshot shape. A fresh publish clears the Publish updates comparison; later content/spec/layout edits make it dirty appropriately. Historical snapshots remain immutable.
7. Use two initialized sessions/tabs to submit independent ordinary edits, then synchronize and reload. Confirm canonical command execution preserves both changes and creates no duplicate Placement references. Inspect a representative recorded structural edit: it updates the Wall's structural JSON once, while unchanged Brick/spec/generation fields remain absent from those mutations.
8. Review the active graph for removed Section/Stack/Row tables and references, `Placement.rowId`/`position`, position sorting, obsolete operation bindings, old target-schema imports, fallbacks, and compatibility paths. Historical archived plans can still describe the old design. Verify new actor selection and command membership refusals at their actual seams.
9. Keep every failed, unrun, or blocked required check below. Reconcile documentation with the implemented result, record the actual local cutover scope/evidence, preserve unrelated WIP, and archive only when no required work remains.

## Implementation and verification evidence

1. The affected App/backend watchers were stopped and old App tabs closed before schema edits. The exact local backend directory was moved to `apps/zerospin/.wrangler/zerospin/backups/sys_qrk_sh_1-plan039-20261021T222956Z`. Browser namespaces, Clerk login, unrelated storage, and unrelated WIP were preserved.
2. The current baseline now has required Wall layout arrays and separate Placement records with direct `wallId`. Section/Stack/Row declarations and registrations, the old recording cleanup, and the App-owned target schemas were removed. Four pure layout operations preserve movement/deletion cleanup differences. App, generation, all publication producers, snapshots, and the existing story were updated together.
3. `pnpm nx run-many -t build,build-storybook -p @qrk.sh/app --parallel=1` passed both existing targets (8.9 seconds total). The new dev graph reported `Ready on http://127.0.0.1:8788/ (system spec accepted)`. Formatting and `git diff --check` passed. No new test/check infrastructure or dependency was added.
4. Read-only canonical inspection confirms no Section/Stack/Row tables, a required Wall `layout`, and Placement `wallId` without `rowId`/`position`. UI Site/Page creation finalized Success at indices 4–5. Page `pag_5XZw7793iR3Wvz2P0_5Cz` on Site `sit_2lOxSrW-VOn1tnj8XvdKu` has the expected four deterministic seed layouts.
5. Seven UI preview drops finalized Success exactly once at indices 6–12: first Icon reused the seed Stack; another shared its Row; Map overflow created a Row; an Icon went below Map; Article inserted below Map before that Icon; another Icon went below Article; Link bottom insertion created a second Section. All 28 Placement references resolve with correct Wall ownership and no duplicates/orphans. Each command recorded exactly one Brick create, four layout-only Wall updates, and four Placement creates. Other breakpoint Walls retained their one-new-Row-per-Brick behavior.
6. Preview widths measured 360/720/1080/1440px. Empty Walls fill the available height, and populated bottom zones retain at least 320px. Existing Bricks have no draggable elements. A second Article displayed the Page-limit refusal; outside and cancelled drops created nothing. An eighth Link at `md` shared the first Icon's Row despite their different fixed heights; synchronization and reload preserved ordering. Held native drags showed the compatible Row ring and the line immediately below Article. Replacing the breakpoint during a held drag cleared feedback and created no Brick.
7. A blank-Stack drop finalized Success at index 59. Temporarily changing only the hovered DOM Row's target ID to a stale ID, then malformed data, produced no further `addBrick` commands; the DOM was restored. The existing initialized-session SDK validation seam refused eleven capacity, Article-sharing, foreign-Wall/Page, unavailable-Page, and stale/foreign anchor cases. Those were local validation results, not admitted canonical commands; all queried layouts and Brick/Placement counts remained identical afterward. Actor visibility and ownership guards were also reviewed in their defining declarations.
8. Production pointer moves at indices 20–26 covered Placement sharing/reordering, movement beside Article, new bottom Section creation, Stack movement between Sections, Stack reordering, and cross-Stack Row creation. Every move recorded exactly one `Wall.layout` update, with no Brick or Placement mutation. A read-only reconstruction confirmed stable IDs/specs/revisions/generation and unchanged other Walls. Small-breakpoint capacity refusal and self-drops created no command. Keyboard Edit/Delete menus, Delete cancellation/trigger focus, successful deletion's surviving-control focus, and drag announcements were observed. There is no keyboard Move dialog in the existing product; the baseline wording was corrected without adding controls.
9. Disposable Page `pag_4DA7UwzicS5FQVRd94_Li` was created through the existing initialized-session command API. Its Brick deletion at index 49 finalized Success with exactly nine operations: four layout updates, four Placement deletes, and one Brick delete. `sm`/`md`/`lg` became truly empty; the unrelated empty `xl` Section/Stack survived. Late provider and manually submitted ready completions at indices 50–51 each recorded zero operations. A subsequent UI drop at 55 created all missing parents in the three empty Walls and reused the preserved `xl` Stack.
10. Persisted self-before Placement and Stack commands at 82/91 recorded zero operations. An ordinary move at 84 removed its emptied source Stack and unrelated empty scaffolding before enforcing the small breakpoint's capacity of one. Commands 85–90 verified before-Section, before-Placement, before-Row, new-Stack, isolated Article Row, and before-Stack ordering. Further ordinary commands exercised moving a Stack into a new Section before an existing Section and `addWallSection`'s before-Section anchor. Capacity refusals left no partial mutations.
11. Article content Save at 27 changed the shared Brick and four generation fields, with no layout/spec writes. Independent Article/Icon edits from two initialized tabs survived reinitialization and rendered together. Spec update 60 changed only the small Icon Placement. A later small Article spec changed only that appearance's heading to `Small-only Placement spec`; medium, large, and extra-large retained the shared content heading. Production palette insertion opened the new Image form, and Cancel reset an unsaved title without recording a content edit.
12. Generation start/movement/valid ready completion at 70–72 preserved the moved layout and updated only the selected Placement's spec/revision/generation. The ready result was manually submitted through the existing ordinary completion command; it was not provider success. Spec and content supersession at 74–79 made their late completions no-ops, as did subsequent provider responses. Navigation/reinitialization during generation and the session-disposal guards were checked. No content/spec/generation completion wrote a layout.
13. `publishSite` (28), `publishPageUpdates` (34), and `publishPage` (47) finalized Success. Read-only comparison against each publication's recorded layout confirmed exact Section/Stack/Row/Placement array order, stable IDs/names, and the unchanged snapshot leaf shape (`id`, `brickId`, `variantId`, `spec`). All historical snapshot content remains byte-for-byte equal to its create operation after later edits. Publish Updates appeared after content, spec, and layout changes and disappeared after publication. Independent structural additions from two initialized tabs (92–93) both persisted across all four Walls and rendered in both tabs after reinitialization. The canonical check at head 107 found 68 Placement records and 68 unique matching references, with no dangling references or Page/Wall membership errors.
14. Active-source review found no removed structural model registrations, old parent/position reads, old target-schema imports, or fallback hierarchy. App/backend/module documentation, layout conventions, glossary, and [ADR 001](../../adrs/001-wall-owned-layout-tree.md) describe the implemented ownership and trade-offs. All changes remain uncommitted, and unrelated WIP is preserved.
15. The existing API worker was started through its Nx dev target for live generation. Both Icon requests and an uninterrupted Article request returned `generate-failed` / `OpenAI returned no message content` with `retryable: true`. The Article request persisted `generation.status: "failed"` and left its spec unchanged. The error originates in the unchanged API response-content parser after an HTTP-success provider response; current logs do not reveal which missing/empty-content branch occurred. No provider success is claimed, no credentials were read, and no adjacent API change was made.
16. Final canonical head 115 contains 18 Bricks, 72 Placements, and exactly 72 unique correctly owned tree references across the two verification Pages, with no orphans. Both latest published snapshots exactly match current layout arrays, Placement specs/variants, shared Brick content, and Page metadata. All five historical snapshot contents remain byte-for-byte equal to their create operations. All exercised layout/spec/publication commands finalized Success. Final source search and `git diff --check` passed. Temporary DOM target changes and viewport emulation were removed, the duplicate browser tab was closed, and the local editor remains available for review. [Screenshot evidence](/tmp/plan039-layout-verified.png).
17. The follow-up captured only provider response shape metadata: the preserve-layout request completed normally with `finish_reason: "stop"` and a string content length of zero. The installed `buildUserPrompt` requests only JSON Patch lines needed for a change; requesting no changes therefore produced a valid empty patch set that the API parser incorrectly rejected. A genuine title edit produced 85 characters of patch text, then failed catalog validation because `elements.brick-1.children` was omitted. The canonical module schema and existing stored defaults allow omitted leaf children. These are two application-side validation errors; no model or endpoint change was needed. All temporary diagnostic logging was removed.
18. The API now requires a normal stop, rejects refusal/tool/incomplete/non-string responses, compiles empty patch text against the existing spec, and always validates the result with the existing `makeModuleSpecDocumentSchema(entry.components)`. Blank fresh generation still fails the schema's required root/elements checks. Validation stays at the same untrusted provider-response boundary and uses the canonical spec-command validator; no stored schema, payload, dependency, or reset changed. The API README records this behavior. The response finish-reason contract is documented in the [official Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
19. Live provider request `plan039-live-edit-fixed` started at canonical index 121, followed immediately by movement at 122. Provider-driven completion 123 (`cmd_-0mqZp1sSWdttLZW_u30V`) finalized Success and updated only the xl Article Placement: revision 0→1, ready/error null, literal title `Live generated spec`, with subtitle/content bindings preserved. The Wall remained byte-identical to movement 122; shared Brick state and the other three specs were unchanged. This was an actual API/provider result, with no manually submitted completion.
20. Live no-change request `plan039-live-noop-fixed` at 124 completed through the provider at 125 (`cmd_1aj3ONJ4XAgGxyAudz4yQ`). It finalized Success, raised the selected Placement revision 1→2 through the existing completion lifecycle, and preserved the spec byte-for-byte. Layout, shared content, other breakpoint specs, and all 72 unique owned references remained unchanged. The UI rendered `Live generated spec` after full session reinitialization/reload. Publish Updates appeared for the real edit and disappeared after republishing.
21. `pnpm nx run @qrk.sh/api:build` passed the existing Worker dry-run build target (1.5 seconds). Existing App/Storybook build and layout verification evidence above remains valid; no App/layout source changed for this repair. Final boundary review and whitespace checks passed. No test suite, fixture, standalone check gate, or new dependency was introduced. The two provider failures in item 15 are resolved by the live checks above.
22. Final canonical head 129 confirms Publish Updates 126 (`cmd_jvJzGkJEvglFv_r0timmc`) created snapshot `psn_aIFHpQ_bHQ_4JJEhO4mI7`. Both published Pages exactly match current layouts, Placement specs/variants, Brick content, and Page metadata. All six historical snapshot contents remain immutable. The 18 Bricks, 72 Placements, and 72 unique correctly owned references remain consistent after provider completion, publication, and reload. [Live provider screenshot](/tmp/plan039-provider-verified.png).

```text
Existing spec + empty patch text + normal stop → validate unchanged spec → ready
# A no-change edit needs zero patch lines, not a fabricated provider failure.

Existing leaf without children + title patch → canonical module validation → ready
# Optional children stay optional; the provider result uses the same contract as saved specs.
```

## Remaining work

None.
