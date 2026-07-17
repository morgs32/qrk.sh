# 031 — Abbreviation Ownership and Frontend WebSocket Admission Implementation Plan

**Source spec:** `../archived/031-spec-abbreviation-ownership-and-frontend-websocket-admission.md`

## Summary

1. Reduce `coreAbbreviations` to shared protocol identifiers, move Durable Object prefixes into an internal system-worker registry, and move public API-key prefixes into `zerospin-apps/apis`.
2. Replace caller-selected `/ws-subscriber/{repoName}` routing with authenticated, 30-second, one-use WebSocket tickets stored by hash in generation-local `SystemRepo` state.
3. Keep the final browser connection as a native direct `FrontendBlockRepo` upgrade so Cloudflare hibernation remains intact.
4. Enforce generation admission at both credential boundaries: mint through write admission and consume through read admission.
5. Migrate the browser, standalone examples, default dispatch Worker, and hosted apps gateway atomically with no old route, old abbreviation module, or compatibility shim.
6. Verify the behavior at the Shopping end-to-end seam, focused lifecycle and React seams, both Nx workspaces, and synchronized architecture documentation.

## Implementation

1. Establish the two-worktree baseline and protect unrelated work.
   1. Record `git status --short` in Zerospin and `../zerospin-apps` before editing; preserve every unrelated tracked and untracked change, including other active plans/specs.
   2. Search both worktrees for `cloudIdAbbreviations`, `coreAbbreviations`, `systemRecord`, `defaultSession`, the four obsolete run prefixes, every repo-prefix member, `/ws-subscriber`, and direct `FRONTEND_BLOCK_REPO.getByName` forwarding.
   3. Treat the migration as one behavior change: do not leave a deprecated route, forwarding export, alternate ticket schema, fallback identifier name, or old persisted-state reader.
   4. Add no dependency, generated package, shared Worker wrapper, named type alias, or helper beyond the explicitly approved modules and public methods.

2. Split abbreviation ownership in the public Zerospin workspace.
   1. Keep `packages/core/src/utils/coreAbbreviations.ts` as the shared exported registry and replace its contents with the exact approved cursor, entity, deployment, session, and command keys: `stagedCursor`, `pushedCursor`, `serviceCursor`, `accountCursor`, `account`, `actor`, `system`, `deploy`, `generation`, `session`, and `command`.
   2. Preserve every existing prefix value. Rename `systemRecord` to `system` and `defaultSession` to `session`; update production schemas, ID factories, session tables, CLI validation, dispatch claims, type-level prefix references, tests, and comments without changing encoded values.
   3. Move command creation and session ID generation from `cloudIdAbbreviations` to the shared `command` and `session` members. Keep unrelated local variable names such as a test's `defaultSession` when they describe a value rather than an abbreviation field.
   4. Add `packages/system-worker/src/systemWorkerAbbreviations.ts` as one unexported object containing only `authorizationAttemptCursor`, all approved `*Repo` prefixes, `systemLogRepo`, and `frontendBlockRepo` with their existing values.
   5. Update system-worker repo utilities, registration schemas, lookups, cursor factories, replay schemas, workerd fixtures, and repo-name assertions to import the internal registry for system-worker-owned names while continuing to import shared cursors/entities from core.
   6. Remove browser/example construction of `frontendBlockRepo` names as part of the route migration before deleting that member from core.
   7. Delete `packages/core/src/utils/cloudIdAbbreviations.ts` only after a repository search proves no Zerospin production or test import remains. Add no re-export or deprecated module.
   8. Preserve the existing literal-prefix type precision. Do not add scattered assertions; retain or relocate only the registry-level literal preservation required by existing ID and repo-name inference.

3. Add generation-local ticket storage to `SystemRepo`.
   1. Define `frontendWebSocketTickets` inline beside the other `systemRepoTables` with non-null `ticketHash`, `deployId`, `repoName`, and `expiresAt` columns.
   2. Make `ticketHash` ordinary text with one uniquely named unique index. Do not use `primitives.primaryKey`, add a prefixed ticket ID, add a separate record ID, or add a new primitive/type abstraction.
   3. Add public `SystemRepo.createFrontendWebSocketTicket` and `SystemRepo.consumeFrontendWebSocketTicket` methods as thin encoded RPC boundaries, each delegating to a same-named `Effect.fn` in its same-named folder per the repo method convention.
   4. In `createFrontendWebSocketTicket`, assert write admission for the supplied deploy before minting; remove rows with `expiresAt` at or before the current time using one SQL delete; generate exactly 32 cryptographically random bytes; encode them as unpadded base64url; hash the raw string with SHA-256; and insert only the base64url digest, deploy, server-derived repo name, and a timestamp 30 seconds in the future.
   5. Return only the raw ticket string through the encoded SystemRepo result. Do not return `repoName`, `expiresAt`, generation identity, or a named response object.
   6. Inline the short Web Crypto encoding/hashing sequence in the two ticket Effects rather than introducing an unapproved utility. Do not add a retry loop for a cryptographically implausible digest collision; surface a unique-insert failure as an unexpected storage error.
   7. In `consumeFrontendWebSocketTicket`, strictly validate a non-empty base64url ticket, hash it, and read the matching stored row without revealing whether it exists. Delete an expired matching row and return the same generic invalid-or-expired domain failure used for absent and replayed tickets.
   8. For an unexpired row, assert read admission using its stored `deployId`, then atomically delete the matching hash/deploy/expiry row with a returning clause and return exactly the stored `repoName`. Require exactly one returned row so concurrent/repeated redemption cannot both succeed.
   9. Preserve the raw ticket nowhere: no database column, structured error extra, telemetry attribute, URL log annotation, test snapshot, or response body may contain it.
   10. At the final generation drain transition, retain all unexpired tickets throughout `draining`, change admission to `drained`, and purge every remaining ticket row. Update the already-drained idempotent branch to purge stale rows before returning so a failed cleanup is repaired on retry without reopening admission.
   11. Do not add an alarm, scheduled cleanup, consumed timestamp, nullable compatibility column, ticket registry Durable Object, or FrontendRepo-owned ticket table.

4. Add the server-side mint boundary and fixed SystemWorker upgrade route.
   1. Add the approved `SystemWorker.createFrontendWebSocketTicket(...)` public RPC as a thin async boundary over a named root `Effect.fn('SystemWorker.createFrontendWebSocketTicket')` in a same-named top-level folder.
   2. Accept the full authenticated frontend identity already held by `FrontendApi`: deploy/generation, account ID/name, actor ID/name, and frontend name. Do not accept a repo name from the browser-facing leaf.
   3. Derive the exact `FrontendBlockRepo` name with its existing repo-name utility, then call the generation's `SystemRepo.createFrontendWebSocketTicket({ deployId, repoName })` and return its decoded raw ticket through the ordinary encoded RPC shape.
   4. Replace the `/ws-subscriber/` branch in `SystemWorker.fetch` with an exact `/ws-frontend-blocks` branch. Reject non-upgrades with `426`; reject missing, repeated, empty, or malformed `publishableKey`/`ticket` parameters with `400`.
   5. Treat `publishableKey` as required public routing input but not proof of authentication inside SystemWorker. Consume the ticket through the generation's SystemRepo, use only the returned stored `repoName`, and forward the original upgrade directly to `env.FRONTEND_BLOCK_REPO.getByName(repoName).fetch(request)`.
   6. Keep SystemWorker and stateless Worker entrypoints out of the upgraded connection after forwarding; SystemRepo must never proxy or own the WebSocket.
   7. Translate absent, expired, replayed, deploy-mismatched, and admission-rejected tickets to the same `401` JSON response. Translate unexpected hashing, storage, decode, and final routing failures to `500`; return the Durable Object's `101` response unchanged on success.
   8. Delete the spent row before the final Durable Object fetch. If that fetch fails, do not recreate the row, retry the request, or reuse the credential.

5. Expose ticket creation through the authenticated FrontendApi capability.
   1. Add named `Effect.fn('FrontendApi.createFrontendWebSocketTicket', { root: true })` beside the existing FrontendApi leaf Effects and an empty-tuple API handler using the existing `makeApiHandler` policy.
   2. Read all routing identity from `FrontendAuthResults`; call `SystemWorker.createFrontendWebSocketTicket(...)` with those authenticated values; decode the result; and return the raw ticket string.
   3. Add `FrontendApi.createFrontendWebSocketTicket()` to the RpcTarget surface without adding a props object, response interface, type alias, or secondary capability.
   4. Add the matching method to `FrontendApiFailure` so failed authentication returns its already-captured encoded error and null telemetry link without resolving a SystemWorker.
   5. Preserve per-leaf SystemWorker resolution, telemetry collection, trace linking, error encoding, and capability lifetime exactly.
   6. Extend FrontendApi leaf tests to prove the empty argument boundary, full authenticated identity forwarding, raw string result, linked telemetry, SystemWorker failure encoding, and FrontendApiFailure behavior.

6. Add the frontend ticket program and change React WebSocket acquisition.
   1. Add `packages/frontend/src/createFrontendWebSocketTicket.ts` exporting `Effect.fn('createFrontendWebSocketTicket')`, and add the explicit `./createFrontendWebSocketTicket` package export in `packages/frontend/package.json`.
   2. Follow the existing frontend-program shape: read `PublishableKey` and `ZerospinApisUrl`, generate a fresh signature from the supplied initialized session, open `newSyncRpcSession<ZerospinApis>`, call authenticated `getFrontendApi(...)`, wrap it with existing traceable-target behavior, invoke the empty ticket leaf, map encoded/transport failures consistently, and return the raw ticket.
   3. Add no generic client factory, authentication helper, session capability wrapper, barrel export, or separate ticket type.
   4. Update `acquireFrontendWebSocket` to call the new frontend program and remove account ID, actor ID, generation ID, account/actor/frontend query parameters, signature serialization, `coreAbbreviations.frontendBlockRepo`, and caller-built repo names from its inputs and URL construction.
   5. Construct exactly `/ws-frontend-blocks?publishableKey=...&ticket=...`, retaining the current HTTP-to-WS and HTTPS-to-WSS protocol conversion. Keep the disposable ticket only for the URL construction and do not annotate it into telemetry.
   6. Install the existing message handler and explicit `open`, `error`, and `close` listeners around acquisition. Do not succeed until `open`; fail bootstrap on `error` or `close` before `open`; remove the temporary handshake listeners after settlement; and close/release the socket on failure or scope release.
   7. Preserve all post-open message decoding, stale-index suppression, frontend-block application, cursor/store advancement, per-block telemetry, and scoped close behavior.
   8. Add no reconnect, background ticket refresh, connection retry, or resume protocol. A later explicit bootstrap repeats signature generation and ticket minting.
   9. Update `bootstrapBrowserSession` and its callers for the reduced acquisition arguments without changing unrelated bootstrap state, deployment validation, or SharedWorker behavior.
   10. Extend frontend-program tests and React bootstrap tests for fresh signatures, the exact two-parameter URL, absence of durable identity/signature fields, delayed success until `open`, both pre-open failure events, normal post-open block application, and final close.

7. Replace public Worker route bodies without adding the deferred abstraction.
   1. In the default dispatch E2E Worker, Shopping Worker, and Parking Worker, recognize exact `/ws-frontend-blocks`, perform the explicit upgrade and required-query validation, and forward the request to the same-isolate loopback `SystemWorker` export instead of directly selecting `FrontendBlockRepo` by name.
   2. Keep each entrypoint's ordinary Cap'n Web/DevZerospinApis routing unchanged. Do not extract `handleFrontendWebSocketRequest`, add a Worker superclass, export a route utility, or add a named request type.
   3. Remove every `/ws-subscriber/{name}` branch and any comment asserting that the browser supplies an encoded Durable Object name.
   4. Update Shopping's workerd convergence test to obtain a FrontendApi ticket and open the fixed public route before pushing commands. Preserve the existing authoritative frontend-block assertions and socket close.
   5. Add focused route assertions for exact-path matching, `426`, `400`, generic `401`, successful `101`, and no caller-controlled Durable Object name.
   6. Update Parking and dispatch-worker route tests/config fixtures only where required by the fixed route; do not expand their product behavior or introduce duplicate end-to-end suites.

8. Verify and publish the public Zerospin half before advancing the vendored consumer.
   1. Run focused core, system-worker, dispatch-worker, frontend, React, Shopping, and Parking typecheck/test/lint/build targets listed below while the public workspace still resolves packages directly.
   2. Search for remaining production imports of `cloudIdAbbreviations`, old abbreviation property names, caller-built FrontendBlockRepo names, `/ws-subscriber`, raw signature query parameters, and direct public repo-name forwarding; allow only deliberately historical archived-plan text.
   3. Review the diff for raw ticket disclosure, new assertions/casts, new helpers/types, unrelated formatting, weakened tests, and old compatibility paths.
   4. Commit and publish the verified Zerospin revision required by the existing `zerospin-apps/vendor/zerospin` workflow, then record the exact revision before changing the consumer gitlink. Do not point the app workspace at an unverified or uncommitted vendor state.

9. Migrate abbreviation ownership and the hosted route in `zerospin-apps`.
   1. Update `../zerospin-apps/vendor/zerospin` to the verified public revision, preserving unrelated app-worktree changes.
   2. Add exported `apis/src/cloudIdAbbreviations.ts` with only the six approved system-production and user-dev secret/publishable/key-pair prefixes and their existing values.
   3. Update CloudRepo schemas and API-key creation/verification modules to import those six API-key prefixes from the defining `apis` module. Import shared `system`, `deploy`, and `generation` prefixes from core wherever application storage, validation, and deploy logs use them.
   4. Replace every `systemRecord` property use with `system`; update type-level `typeof` references as well as runtime schemas. Move session/command uses to core `session`/`command` if any app consumer remains.
   5. Inline `'org'` only at the approved sole admin route-schema use. Delete the obsolete run-prefix references rather than recreating them in the app registry.
   6. Add an exact `/ws-frontend-blocks` branch to `apis/src/Worker.ts`. Validate upgrade and the two query parameters, decode/verify `publishableKey`, derive `systemWorkerName`, resolve the dispatched SystemWorker, and repeat the same active deploy/runtime identity checks used by the hosted FrontendApi gateway before forwarding the unchanged fixed request to `systemWorker.fetch(...)`.
   7. Map malformed public input to `400`, invalid key/ticket outcomes to the generic `401`, non-upgrades to `426`, unexpected active-routing/storage failures to `500`, and successful upgrades to the forwarded `101` response without exposing internal lifecycle state.
   8. Delete the existing commented-out `/ws-subscriber` implementation completely. Do not revive its signature parsing, account construction, transient retries, browser-supplied identities, or direct repo-name forwarding.
   9. Keep the hosted Worker route explicit. Do not add a method on `Apis`, reuse a Cap'n Web callback as transport, or create a shared route abstraction in this pass.
   10. Add hosted gateway tests for publishable-key routing, active deploy/runtime matching, fixed request forwarding, malformed requests, inactive/mismatched deployments, generic invalid-ticket handling, and absence of caller-provided repo routing.
   11. Run the app-workspace API, system-worker, core, dispatch-worker, admin, and cloud checks affected by the import migration, then commit the app code and vendor gitlink together after verification.

10. Synchronize architecture, glossary, and pattern documentation with implemented behavior.
   1. Use the repository update-architecture workflow after source behavior is complete; do not document the ticket route as current before then.
   2. Expand `wiki/architecture/DeploySystem.md` with the approved readiness/admission state diagram, admission matrix, normal drain order, retry semantics, and the distinction between `generationState.readiness` and the local `/__zerospin/ready` gate.
   3. Add `wiki/architecture/FrontendWebSocket.md` for the authenticated ticket mint, hash-only SystemRepo storage, hosted/standalone fixed routing, one-use consume, direct hibernating FrontendBlockRepo ownership, error surface, and no-reconnect boundary.
   4. Update `wiki/architecture/FrontendApi.md` and `wiki/architecture/Blockchain.md` to remove `/ws-subscriber`, caller-built repo-name, and stale core repo-prefix ownership claims while preserving command/block topology.
   5. Update `wiki/glossary.md`, `wiki/index.md`, and any overview entry needed to define generation readiness, admission, WebSocket ticket, and the new architecture page; distinguish shared protocol prefixes from internal repo-name prefixes.
   6. Update directly stale `llm-wiki/patterns` examples/stubs and pattern indexes that import repo-prefix values from core. Do not create a new pattern unless implementation reveals a genuinely reusable rule beyond this plan.
   7. Refresh every affected wiki source path, line range, and `git hash-object` SHA; append the required wiki log entry; run freshness and Mermaid checks available in the workflow.
   8. Keep the Worker-simplification item in `TODOS.md`; do not implement or predesign that abstraction in this pass.

11. Perform the final atomic-removal audit.
   1. Prove no production source in either current worktree imports the deleted core `cloudIdAbbreviations` module or references `systemRecord`, `defaultSession`, the four removed run-prefix fields, or core-owned system-worker repo prefixes.
   2. Prove no browser code or public Worker accepts a frontend repo name, generation ID, account/actor identity, or signature in the WebSocket request.
   3. Prove raw tickets appear only transiently in the mint response and browser URL construction, never in persisted rows, logs, telemetry, errors, fixtures, or documentation examples.
   4. Prove mint fails outside `ready + open`; consume succeeds in `ready + open` and `ready + draining`; consume fails after expiry, replay, deploy mismatch, or `drained`; and existing connected sockets are not actively closed by drain.
   5. Prove a failed final upgrade leaves its ticket spent and that bootstrap reports the failed handshake instead of an initialized live session.
   6. Keep this plan active until both workspaces, the vendor revision, architecture freshness, and the highest Shopping seam are implemented and verified. Archive it only after all required checks are green.

## Testing and Verification

1. Run focused public-package checks through Nx after the abbreviation and RPC layers are coherent.

   ```text
   nx run-many -t ts,test,lint,lib -p @zerospin/core system-worker @zerospin/dispatch-worker @zerospin/frontend @zerospin/react
   nx run system-worker:test:workerd
   ```

2. Run the standalone Worker and highest WebSocket seams.

   ```text
   nx run shopping:ts
   nx run shopping:lint
   nx run shopping:test:workerd
   nx run shopping:test:vitest:browser
   nx run parking:ts
   nx run parking:lint
   nx run parking:test:workerd
   ```

3. Run broader public-workspace affected checks and build declarations after focused checks pass.

   ```text
   nx affected -t ts,test,lint,lib
   ```

4. After updating the vendor revision, run focused `zerospin-apps` checks through that workspace's Nx graph.

   ```text
   nx run-many -t ts,test,lint,lib -p @zerospin/core system-worker @zerospin/dispatch-worker apis
   nx run apis:test:e2e
   nx run admin:ts
   nx run admin:lint
   nx run cloud:ts
   nx run cloud:lint
   nx affected -t ts,test,lint,lib
   ```

5. Run explicit stale-surface searches in Zerospin.

   ```text
   rg -n "cloudIdAbbreviations|systemRecord|defaultSession|finalizePushedRun|publishFinalizedRun|publishFinalizedSystemRun|fanoutAccountCommandsRun" packages examples
   rg -n "ws-subscriber|accountName=.*signature|frontendBlockRepoName" packages examples
   rg -n "coreAbbreviations\.(systemRepo|accountRepo|authorizationRepo|actorRepo|frontendRepo|serviceRepo|accountBlockRepo|actorBlockRepo|frontendBlockRepo|serviceBlockRepo|systemLogRepo|authorizationAttemptCursor)" packages examples
   ```

6. Run corresponding stale-surface searches in `zerospin-apps` after the vendor/import migration.

   ```text
   rg -n "@zerospin/core/utils/cloudIdAbbreviations|systemRecord|defaultSession|ws-subscriber" apis admin cloud system-worker system
   rg -n "finalizePushedRun|publishFinalizedRun|publishFinalizedSystemRun|fanoutAccountCommandsRun" apis admin cloud system-worker system
   ```

7. Validate architecture freshness and repository hygiene in Zerospin.

   ```text
   .llmwiki/freshness.sh --stale-only
   git diff --check
   git status --short
   ```

8. Validate final repository hygiene in `zerospin-apps`.

   ```text
   git diff --check
   git status --short
   ```

9. Classify any pre-existing WIP or unrelated target failure separately with exact evidence; do not alter unrelated files to make aggregate checks green.
10. Do not archive this plan while any required public package, SystemRepo lifecycle case, Shopping WebSocket seam, hosted gateway test, app import migration, vendor revision, or documentation freshness check remains incomplete.

## Guardrails

1. Preserve unrelated WIP in both repositories. Do not rewrite imports, manifests, plans, wiki pages, or package configuration outside the exact migration surface.
2. Do not add an `ALLOWED_CAST` marker. If an unavoidable assertion appears necessary, stop for explicit human authorization.
3. Do not add `as const` or other assertions opportunistically. Preserve only required existing registry literal behavior and fix inference at the owning registry/factory rather than at call sites.
4. Add no named type alias or interface. Keep new RPC props/results inline and use existing session, repo-key, error, and encoded-RPC types.
5. The approved new implementation units are the two SystemRepo ticket Effects/methods, the SystemWorker mint Effect/method, the FrontendApi leaf, the frontend ticket program, and the two abbreviation registry modules. Add no other helper, wrapper, utility, service, registry, route handler, or one-consumer shape file.
6. Add no data-processing loop for ticket generation, hashing, cleanup, routing, or abbreviation migration. Use Web Crypto byte operations and set-based SQL; keep explicit call-site edits explicit.
7. Keep SystemRepo out of the WebSocket lifetime. It stores and consumes admission credentials only; the stateless Worker/SystemWorker forwards the final upgrade directly to hibernating FrontendBlockRepo.
8. Keep full command and frontend-block objects intact. Do not rebuild, narrow, or reshape them while changing admission and routing.
9. Do not add persisted compatibility fields, nullable defaults, fallback route parsing, old-row support, or alternate code paths for deprecated state.
10. Do not add Cap'n Web WebSocket callbacks, a custom transport, a proxy Durable Object, an alarm, reconnect, ticket retry, two-phase redemption, or ticket restoration.
11. Do not actively close existing sockets during generation drain. Do not weaken read/write admission or active-deploy checks to accommodate ticket redemption.
12. Keep public response detail generic: no ticket-existence oracle, admission-state leak, repo name, generation identity, or internal error payload in the `401` response.
13. Implement happy path, expiry, replay, wrong deploy, draining, drained, pre-open failure, final-forward failure, and cleanup in the same pass; leave no stub or discarded result.
14. Do not implement the Worker abstraction TODO. Explicit entrypoint routes are the approved temporary shape.
15. Do not archive this plan until the complete two-repository rollout and all required verification are green.
