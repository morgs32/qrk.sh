# Studio live Library session

Status: implemented. Phase 1 of the Studio overhaul supersedes the remaining grid state-edit/hide verification; the historical results below are not evidence for the new empty-frame UI.

## Agreed behavior

1. Studio uses its existing authenticated user aggregate and `userSession` for Library editing. Library's own app remains standalone.
2. Fresh content replaces legacy grid/brick storage. No migration, automatic storage reset, or standalone-backup deletion.
3. Page creation creates a referenced wall atomically. Library retains ownership of its generic models and editing contracts.

## Implementation

1. Register Library models and contracts in the user aggregate, actor database, and session definition; remove legacy Grid/Brick declarations and commands.
2. Add Page.wallId and create the wall in createPage. Filter actor selections through Page ownership.
3. Replace Studio's standalone session with userSession. Scope grid, detail, and breadcrumb queries to the current page wall.
4. Generalize ILibrarySession to the existing aggregate-session surface; preserve standalone Library behavior and existing UI WIP.
5. Update affected documentation and verify before archiving this plan.
6. Approved scope extension: fix Zerospin's WebSocket attachment limit and sync the narrow fix into the sibling upstream checkout. Keep unrelated WIP intact.

## Annotated examples

```ts
// A page owns one deterministic wall; breakpoints share that wall's bricks.
const wallId = prefixId(libraryModule.models.wall, pageId);
// Example: pag_home -> wal_pag_home; pag_about -> wal_pag_about.
```

```ts
// A valid brick ID from another page must still produce "Brick not found".
where: { id: { eq: brickId }, wallId: { eq: page.wallId } }
```

```ts
// Both the standalone Library app and Studio's larger aggregate satisfy this surface.
// Library's exact contracts/models preserve command payload and query inference.
type ILibrarySession = IAggregateSession<
  IAggregateSessionDefinition<
    string,
    string,
    string,
    typeof libraryModule.contracts,
    typeof libraryModule.models
  >
>;
```

```ts
// Full locks can exceed workerd's 16 KB WebSocket attachment limit.
// Keep the lock in durable SQL storage; the existing connection ID resolves it
// for resume, command admission, and broadcasts after hibernation.
const retainedLock = db.query.connectionLocks
  .findFirst({
    where: { connectionId: { eq: connection.id } },
  })
  .sync();
// A missing row closes the connection with the existing state-required failure.
// onClose deletes the retained row.
```

## Verification

1. Build Library's public output as required by the app. Repository tests and standalone automated checks are deferred under root `AGENTS.md`.
2. Defer automated backend verification until the future end-to-end compatibility suite is agreed. Do not scaffold integration tests.
3. The original live grid/layout verification below is historical. The Studio overhaul removes those controls; current verification follows its approved phase-1 plan in chat.
4. Reset only incompatible development state if needed; leave old standalone backups and deployed data untouched.

## Historical verification results

1. Library public build passed. Scoped Nx typechecking and lint passed for Library, Studio, and backend, including Library worker typechecking. No Library tests were written, modified, or run.
2. Backend workerd suite passed: 12 tests in 2 files, including Library command staging, state updates and invalid-state rejection, breakpoint visibility, removal, wrong-wall rejection, distinct page walls, actual actor ownership selections, Clerk authentication, and site/page settings. No Library tests were written, modified, or run.
3. The local backend initially rejected the changed V1 schema with `actor-spec-mismatch`. Ran the approved development reset through `pnpm nx run @qrk.sh/zerospin:dev -- --clean`; workerd then reported readiness and system-spec acceptance. Old standalone browser backups were untouched.
4. The first live connection exposed a **91,535-byte** WebSocket attachment, exceeding workerd's **16,384-byte** limit. After explicit approval, Zerospin now stores the full admitted lock in `connectionLocks`, keyed by connection ID. Attachment state remains compact; resume, admission, and broadcast resolve the durable row. Closing a socket removes its row. A fresh development reset was required for the new fixed schema; deployed data was not reset.
5. Zerospin's focused onMessage suite passed **17 tests**, including a lock larger than the attachment limit, resume from durable storage, and missing-lock rejection. `system-worker:ts` and scoped native upstream lint passed. The six changed source/test/doc files match `../zerospin` byte-for-byte. Sync is local and uncommitted; no subtree operation, commit, or push was performed because both checkouts contain unrelated WIP. The full vendor dependency graph encountered unrelated fulfillment type errors; focused verification used already-built dependencies.
6. In the existing authenticated Chrome session, verified adding a swatch brick, moving it, resizing it, reload persistence, synchronization in a second tab, detail drawer navigation, removal by dragging outside the canvas, and Page/Site Settings saves. A new page was empty, and opening the first page's brick ID under the second page displayed **Brick not found**, including scoped breadcrumbs.
7. Initialization failure was observed before the vendor fix: the route displayed the initialization error instead of mounting an unusable editor. Existing command failure callbacks/toasts remain wired, and backend tests verify failed staging leaves state unchanged. A browser command-failure toast was not deliberately induced.
8. At this plan's original verification, state-edit/hide checks were unavailable through Studio. The approved phase-1 overhaul removes the grid, visibility contract, and placed-brick activation; those remaining checks are superseded. Retained module forms and session ownership are documented in the App and Library READMEs. No phase-1 runtime verification is claimed here.

## Remaining work

None for this session cutover. Phase-1 implementation and verification are tracked in its active chat.
