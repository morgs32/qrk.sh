# QRK Zerospin grid save design

**Date:** 2026-07-12
**Status:** Implemented — archived
**Archived:** 2026-07-13

## Problem Statement

The editable grid at `/site/[siteId]/page/[pageId]` currently exists only as a seeded Zustand layout. Dragging or dropping a brick changes browser memory, but there is no Zerospin browser session, current standalone Worker, authenticated actor, aggregate grid command, explicit Save action, or refresh persistence.

The existing `packages/zerospin` prototype is useful domain groundwork, but it targets removed Zerospin surface, fanout, Worker, and React APIs. The repository also has no Nx workspace, so its Next and Zerospin development servers are not coordinated through the task runner used by the Zerospin reference application.

## Solution

Set up `apps/web` as a minimal Nx project with separate continuous `next:dev` and `zerospin:dev` targets and one combined `dev` target. `zerospin dev` will run from `apps/web`, load `apps/web/wrangler.jsonc`, and serve the current standalone Zerospin Worker implemented by `packages/zerospin` on port 4001 while Next remains on port 4000.

Migrate the QRK domain package to current Zerospin account, actor, frontend, block-repo, and React contracts. Authenticate the owner frontend with a real Clerk session token. The Worker-side owner authentication will verify that token and derive both the Clerk user identity and actor identity only from verified claims. A missing User will be created during authentication.

Keep the editor draft in the existing Zustand grid store. Key the draft by Clerk user plus route, and hydrate it from the current Zerospin frontend-session database when a persisted Grid exists. When no Grid exists, preserve the current seeded layout as a dirty draft. A first Save creates the Grid and every current GridItem through one `createGrid` command. Later Saves compare the Zustand draft to the latest frontend-session rows and send one `updateGrid` command whose mutations include only changed, created, or deleted GridItems. Every real aggregate update also advances a Grid revision so a stale draft cannot overwrite a newer GridItem-only Save.

Automatic command pushing and SharedWorker use remain disabled. The explicit Save action stages the required command or commands, manually pushes them, and reports success only after FrontendRepo admission completes. Zerospin DevTools remains mounted for session inspection and manual recovery.

## User Stories

1. As an authenticated QRK owner, I want `pnpm dev` or the equivalent Nx target to start Next and the local Zerospin API together, so that the page editor has one repeatable development command.
2. As an authenticated QRK owner, I want my Clerk session token verified before a Zerospin actor is selected, so that client-supplied identity text is not trusted.
3. As a first-time QRK owner, I want authentication to create my missing User resource, so that a fresh local Durable Object state can initialize without manual data insertion.
4. As an owner opening a page without a Grid, I want the current seeded layout to appear as an unsaved draft, so that the existing design remains visible and the first Save persists it.
5. As an owner editing a persisted page, I want the draft hydrated from Zerospin and protected from live-query overwrites while dirty, so that server convergence does not erase in-progress edits.
6. As an owner, I want one `createGrid` command to create the Grid and however many GridItems are visible, so that the first save is one aggregate grid operation.
7. As an owner, I want one `updateGrid` command to create, update, and delete however many GridItems changed, so that a page save remains one aggregate grid operation.
8. As an owner, I want unchanged Grid and GridItem resources to produce no update mutations, so that saves record only meaningful changes.
9. As an owner, I want omitted persisted GridItems deleted by Save, so that the submitted draft is the authoritative page-grid snapshot.
10. As an owner, I want Save disabled when clean or already saving and enabled when dirty, so that its state is unambiguous.
11. As an owner, I want a failed stage or push to preserve my draft and show inline failure state, so that I can retry without rebuilding the layout.
12. As a developer, I want Zerospin DevTools mounted with automatic push paused and SharedWorker disabled, so that I can inspect and manually reason about the exact session.
13. As an owner switching Clerk accounts or page routes, I want the previous account's session and draft hidden immediately, so that I cannot inspect or save stale cross-account state.
14. As an owner with a dirty draft, I want a newer GridItem-only Save from another session to reject my stale aggregate revision, so that Save cannot silently overwrite it.

## Question Record

1. **Question:** Should persistence cover only `/site/[siteId]/page/[pageId]` and leave homepage and dashboard grids unchanged? **Answer:** Yes. Only the per-site page editor grid is in scope.
2. **Question:** Should local Zerospin packages be published before integration? **Answer:** No. Use local `file:` dependencies and repository overrides for now.
3. **Question:** Should identity use a fixed development user or the existing Clerk user? **Answer:** Use Clerk. Send a Clerk session token as the frontend signature, verify it during owner authentication, derive the actor from the verified Clerk user ID, and store that Clerk user ID on User.
4. **Question:** Should authentication trust a neighboring `clerkUserId` signature field as the current shopping example does? **Answer:** No. Use the stronger verified-token design requested by the user and derive identity only from verified claims.
5. **Question:** When no Grid exists, should the current mock layout be the unsaved draft and should the first Save call `createGrid` with every item? **Answer:** Yes.
6. **Question:** Should automatic pushing and SharedWorker use be enabled? **Answer:** No. Pause automatic push, omit SharedWorker enablement, manually push from Save, and mount DevTools.
7. **Question:** Should `updateGrid` treat submitted GridItems as the complete authoritative snapshot and delete omissions? **Answer:** Yes.
8. **Question:** May implementation iterate directly through GridItems in `createGrid`, `updateGrid`, and the browser diff? **Answer:** Yes. Keep those loops direct and annotated without extraction into shortening helpers.
9. **Question:** Where should changed-resource detection happen when contract programs cannot read a database? **Answer:** Compare the Zustand draft with the latest Zerospin frontend-session rows in the Save flow, encode explicit item mutation intent in the command, and recheck that intent in FrontendRepo guards before mutation generation.
10. **Question:** Should an update-intent item that is unchanged still emit an update mutation? **Answer:** No. The browser omits update intent for unchanged resources, and the update guard rejects mismatched intent.
11. **Question:** Which repository owns the standalone Worker implementation? **Answer:** Keep domain and Worker ownership in `packages/zerospin`; let `apps/web/wrangler.jsonc` point to that entrypoint instead of adding a pass-through Worker wrapper.
12. **Question:** Are `siteId` and `pageId` URL segments new opaque resource IDs? **Answer:** No. Preserve current URL semantics as slugs. Derive stable resource IDs from the verified User identity and route slugs.
13. **Question:** How should a fresh user save when Site and Page resources do not yet exist and standalone `zerospin dev` does not replay deploy seeds? **Answer:** On the first Save, stage the existing `createSite` and `createPage` contracts when needed, then stage the aggregate `createGrid` command. Manually push the staged batch once. `createGrid` itself remains responsible only for Grid plus GridItems.
14. **Question:** Should grid item identity require a second browser-side mapping table? **Answer:** No. Preserve `item.i` as `itemKey` and derive the GridItem resource ID deterministically from the Grid ID plus `itemKey`.
15. **Question:** When does Save count as successful? **Answer:** After the explicit `pushStagedCommands()` call returns the staged grid command as admitted or already pending and returns no matching failure. Local staging alone is not success.
16. **Question:** What happens if the local session snapshot changes while a draft is dirty? **Answer:** Do not rehydrate over the dirty draft. Diff against the latest frontend-session database rows at Save time; the server-side guard rechecks ownership, complete-snapshot coverage, and mutation intent.
17. **Question:** Should concurrent edits introduce a core conditional-mutation mechanism? **Answer:** No. Keep concurrency policy inside the QRK aggregate by adding an integer Grid revision, capturing it with the Zustand draft, and checking it in the current FrontendRepo guard. A generic Zerospin-core compare-and-swap primitive remains outside this change.
18. **Question:** Should User require unverified username or display-name fields during authentication? **Answer:** No. Persist verified `clerkUserId` and derived `actorId`; keep profile fields nullable because the ordinary Clerk session token does not guarantee them.
19. **Question:** Should the existing stale `/zerospin` smoke page remain as a second browser integration? **Answer:** No. Remove it when the real site-layout integration replaces it; do not preserve removed `makeReactSession` APIs.
20. **Question:** Should QRK remain a plain pnpm workspace? **Answer:** No. The user explicitly requested Nx. Add a minimal Nx workspace, register the existing packages as projects, and coordinate the two continuous development targets without introducing framework generators or moving source files.
21. **Question:** Is an Nx generator appropriate for this repository? **Answer:** No existing local or plugin generator matches this in-place integration. Initialize Nx around the existing pnpm layout and configure the existing projects directly.
22. **Question:** Where should the Clerk and Zerospin React providers live? **Answer:** Use the existing site layout as the client runtime boundary because both Grid and SiteToolbar require the same session. Keep the configured React frontend as one shared binding modeled after the shopping example.
23. **Question:** Should the Clerk token be copied into a command payload or persisted model? **Answer:** No. It exists only in the frontend authentication signature; command payloads and User rows store no session token.
24. **Question:** How should local token verification obtain Clerk key material? **Answer:** Use the official Clerk backend verifier in the Worker with the existing ignored `CLERK_SECRET_KEY` environment value and an exact configured authorized party. Never hard-code that secret in tracked files.
25. **Question:** Should `expectedUpdatedAt` cross the command JSON Schema boundary as integer epoch milliseconds when `primitives.date()` produces an unsupported `DateFromSelf` schema? **Answer:** No. Review showed that a GridItem-only update does not touch the Grid timestamp. Replace timestamp concurrency with an integer `expectedRevision` owned by the Grid aggregate.
26. **Question:** Should the incompatible User schema and aggregate `createGrid` command continue under QRK system version 1.0.0? **Answer:** No. Use system version 2.0.0 in the system and both Wrangler configurations so old local state is isolated rather than supported through compatibility code.
27. **Question:** Which Wrangler version should `apps/web` use when the current local Zerospin CLI resolves `wrangler/bin/wrangler.js`? **Answer:** Pin Wrangler 4.90.0 exactly. Wrangler 4.105 hides that subpath behind package exports and makes `zerospin dev` fail before startup; do not add a QRK wrapper around the CLI.
28. **Question:** What should Save do after a transport failure leaves optimistic commands staged in the session database? **Answer:** Detect and retry those exact staged commands before diffing. Otherwise their optimistic rows could match Zustand and be mistaken for persisted state.
29. **Question:** What should happen if the user edits the layout or navigates while Save is awaiting stage or push? **Answer:** Keep a reference to the layout being saved, preserve a later layout as dirty, and scope success or failure state updates to the page that initiated Save.
30. **Question:** Should Save compare a React live-query closure or read the database at the click boundary? **Answer:** Read Site, Page, Grid, and GridItems directly from the initialized frontend-session database after any retry. Continue using live query for Grid hydration and convergence rendering.
31. **Question:** How should duplicate local `@zerospin/core` peer contexts be handled when the web app resolves React 19.2.6 and the linked QRK domain package resolves 19.2.7? **Answer:** Align the web app on React and React DOM 19.2.7 so pnpm resolves one structural Zerospin type context; do not cast the frontend controller.
32. **Question:** Should tests add an authentication bypass solely to automate Clerk bootstrap and full `FrontendRepo.pushCommands`? **Answer:** No. Keep production `verifyToken` as the only authentication path. Exercise contracts and real database guards in workerd, verify the Worker through build and live readiness, and leave authenticated browser automation pending until explicit test credentials or a production-approved verifier seam exists.
33. **Question:** May a Clerk account switch reuse the previous mounted Zerospin owner Provider? **Answer:** No. Key the Provider by verified Clerk user ID so React disposes the old account session and mounts a new one.
34. **Question:** May two Clerk users on the same route share the same Zustand draft key? **Answer:** No. Include Clerk user ID with `siteId` and `pageId`, and hide the Grid plus disable Save until that exact account-route key is hydrated.
35. **Question:** May the standalone Worker's development API-key resolver accept any supplied key and return a fixed identity? **Answer:** No. Validate the configured system ID without a cast and accept only an exact match for the ignored publishable or secret key, returning HTTP 401 semantics for every other value.
36. **Question:** Are the one-Grid-per-Page and stable-GridItem identities only browser conventions? **Answer:** No. Guards require ``Grid.prefixId(`${pageId}/main`)`` and ``GridItem.prefixId(`${gridId}/${itemKey}`)`` so serialized account commands cannot race under alternate IDs.
37. **Question:** How can an item-only update participate in stale-draft detection while unchanged Saves emit no mutations? **Answer:** Create Grid at revision zero. Whenever `updateGrid` has a real Grid or GridItem create/update/delete, emit one Grid update to advance the revision; when every intent is `none` and there are no deletes, emit no mutation at all.
38. **Question:** What revision should a new edit use after retrying a previously staged Grid command? **Answer:** Decode staged Grid commands, match the exact current canonical Grid ID, and require its post-retry revision to be exactly the draft revision plus one before bypassing the ordinary stale check. A staged Grid command for another page grants no exception.
39. **Question:** May Save iterate through staged command rows to scope retry recovery? **Answer:** Yes. Keep the loop inline and annotated, decode only `createGrid` and `updateGrid` rows with their defining contracts, and do not extract a retry helper or add a named shape.
40. **Question:** Should a query or catalog-resolution failure mark the new account-route draft hydrated while retaining the old layout array? **Answer:** No. Clear the layout, keep `isHydrated` false, show the inline load error, and leave both Grid interaction and Save disabled.

## Implementation Decisions

1. Add Nx to the pnpm workspace and configure `@qrk.sh/web` with continuous `next:dev` and `zerospin:dev` targets plus a combined `dev` target.
2. Run Next on `${PORT:-4000}` and Zerospin on `${ZEROSPIN_PORT:-4001}`. Set the browser API URL to `http://localhost:4001` in local environment configuration.
3. Add `apps/web/wrangler.jsonc` with the current twelve Durable Object bindings, two SQLite migration tags, the QRK system alias, and current SystemWorker block-repo topology.
4. Use current local `file:` dependencies for the CLI, core, React, DevTools, dispatch Worker, SystemWorker, frontend closure, and errors. Do not publish packages.
5. Update the Worker to use `ZerospinApis`, `makeDispatchRuntime`, the Worker-export resolver, and an exact configured API-key identity resolver. The application-level Clerk token remains verified by owner authentication.
6. Change owner frontend signature shape to `{ sessionToken: string }` and verify it with Clerk's Worker-compatible `verifyToken` API.
7. Add `clerkUserId` to User, derive `actorId` with the current Zerospin actor prefix utility, and create a missing User during authentication before returning account and actor IDs.
8. Use one account named `user`, one actor named `owner`, and one frontend named `web`, following current Zerospin controller APIs.
9. Keep Site, Page, Grid, and GridItem as separate resources. A Page has one canonical primary Grid for this editor; a GridItem has a canonical ID derived from its Grid and stable `itemKey`, plus geometry, `collectionName`, and `brickName`.
10. Make `createGrid.gridItems` a JSON array and return one Grid create mutation followed by one GridItem create mutation per array element.
11. Make `updateGrid.gridItems` the complete desired item snapshot with explicit `create`, `update`, or `none` intent, plus deleted GridItem IDs and `expectedRevision`. Return GridItem mutations only for changed entries and advance Grid revision once for every real aggregate change; return no mutations for a fully unchanged aggregate.
12. Add direct frontend guards for create ownership and update ownership, canonical aggregate IDs, full-snapshot coverage, changed-versus-unchanged intent, and stale Grid revision.
13. Extend the existing Zustand grid store with Clerk-user-and-route-keyed hydration, aggregate revision, dirty, saving, and inline error state. Do not add a parallel draft store.
14. Hydrate persisted rows by resolving their `collectionName` and `brickName` against the existing catalog. Invalid persisted catalog identities are an explicit load error rather than silently substituted bricks.
15. Add Save to SiteToolbar. The handler stages missing Site/Page bootstrap commands only when necessary, then exactly one aggregate grid command, and manually pushes once.
16. Preserve the draft on stage, guard, transport, admission, or stale-revision failure. Rehydrate and mark clean only after successful admission and live-query convergence.
17. Mount Zerospin DevTools in the site layout, configure `makeReactFrontend({ isPushPaused: true })`, and leave `isSharedWorkerEnabled` false.
18. Remove the obsolete standalone `/zerospin` smoke page after the real site integration supersedes it.

## Testing Decisions

1. Contract tests prove `createGrid` emits one Grid mutation plus zero or many GridItem mutations and `updateGrid` omits unchanged resources while emitting mixed create, update, and delete mutations in one command.
2. Workerd tests prove aggregate mutation output, item-only revision advancement, fully unchanged omission, canonical identity enforcement, full-snapshot coverage, changed-versus-unchanged intent, and stale revision rejection against a real resource database.
3. Browser-facing tests prove initial seed draft state, dirty Save enablement, one aggregate grid command, successful refresh persistence, and draft preservation on failure when a Clerk-authenticated test session is available.
4. Nx project inspection proves both QRK projects and their resolved targets. Nx runs package typecheck, lint, build, and workerd tests through configured targets.
5. A local readiness check starts the combined continuous dev target, waits for Wrangler's `Ready on http://` line and Next's `Ready in` line, verifies both ports respond, and proves an invalid dispatch key returns the encoded `qrk-api-key-invalid` 401 failure. It does not wait for either long-running process to exit.
6. Prior art is the Zerospin shopping standalone Worker, paused React frontend, DevTools integration, and workerd push-command tests.

## Out of Scope

1. Publishing any Zerospin package.
2. Persisting the homepage or dashboard grid.
3. Implementing Site or Page settings persistence beyond the minimum missing-resource bootstrap required for Grid Save.
4. Adding GridItem content schemas for individual brick implementations; this change persists catalog identity and geometry already represented by the editor.
5. Enabling automatic push or SharedWorker operation.
6. Adding a cross-account or cross-frontend global compare-and-swap primitive to Zerospin core.
7. Adding production deployment, secret provisioning, or hosted dispatch configuration.
8. Refactoring existing grid drag helpers, toolbar components, or catalog code merely for concision.

## Further Notes

1. The spec and its derived implementation plan remained unarchived after implementation so the user could compare both artifacts with the code. The user approved archiving on 2026-07-13.
2. Local Durable Object state using the removed prototype topology should be wiped rather than supported through compatibility fields or alternate code paths.
3. `docs/styleguide/README.md` is referenced by QRK's AGENTS file but is currently absent; the existing relevant section documents were consulted directly. Repairing that unrelated docs link is not part of this goal.
4. The implementation plan derived from this spec is `001-qrk-zerospin-grid-save.md`; it was archived alongside this spec after the comparison checkpoint.
