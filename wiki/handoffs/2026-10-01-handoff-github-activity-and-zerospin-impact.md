# Handoff: QRK GitHub Activity and the Zerospin changes

**Date:** 2026-10-01

**Focus:** Resolve machine-backed brick content ownership and aggregate replication while preserving ordinary aggregate-owned bricks; then resume the GitHub implementation design against the assumed merged/vendor-updated Zerospin baseline.

**Status:** Requirements and impact assessment. GitHub Activity fetching, the new module factory, and durable retry policy are not implemented in this checkout.

## Goal

Deliver a GitHub Activity brick with independently editable input, module-owned fetching and refresh policy, guarded result application, and a useful stale/error presentation. Studio runs its workflow durably on the server. Standalone Library reuses the module's fetch program for interactive Save/Refresh.

This handoff preserves the QRK decisions from the discussion that led to the Zerospin refactors. It separates those requirements from implementation mechanisms that upstream subsequently replaced. It does not authorize a vendor update, storage reset, backend extraction, or source implementation by itself.

## Latest discussion — ownership reopened, no implementation approved

1. **Assumed baseline:** the user asked what remains if all active Zerospin PRs merge and `vendor/zerospin` is updated. At this session's GitHub check, the only open PR was [#37](https://github.com/morgs32/zerospin/pull/37), with head `a4fa927b40137ab67f4b05950767af8b4cccf242`, already assessed below. That assumption therefore supplies the service-machine foundation but does not remove the durable retry/Failed recovery gap. Recheck PRs when resuming; this is a dated observation, not a claim about future upstream work.
2. **User constraints:** the user expects brick state to live in the aggregate and asked whether the aggregate could subscribe to service-owned state through a replicated model. Machines are optional: text bricks do not need one; only selected modules need fetching/workflow capabilities. A refresh interval is module policy, not a requirement for every brick or even every machine-backed module.
3. **Current proposal, not approval:** ordinary bricks retain aggregate-owned editable state. Machine-backed bricks could use a service-owned content model holding accepted payload, result, provenance, and public status, replicated into the aggregate. The machine retains lifecycle State and private execution details. Brick existence, module identity, wall membership, and placement remain aggregate-owned. Unsaved form drafts remain local UI state. `makeModuleVersion` continues serving ordinary modules; the proposed `makeMachineModuleVersion` bundles only machine-backed behavior.
4. **Verified capability versus unverified integration:** upstream aggregate declarations recognize service replicas and the documented aggregate feed consumes enrolled service-model updates. Machine-owned models can be published alongside State changes. This supports investigating the proposal; it does not prove QRK's enrollment, authorization, initialization, removal, or standalone path. Replication targets a separate model; it does not automatically fill the existing `brick.state` JSON field or replicate internal machine State. The intended aggregate-session reading path needs concrete validation before promising that no service session is needed.
5. **Earlier recommendation corrected:** the assistant first preserved aggregate result commands, then proposed service-owned content read through a service projection, then recognized aggregate replication as another option after the user's clarification. None of those assistant recommendations settled ownership. In particular, the historical brick-specific result-command requirement below is now reopened: a replicated content model might eliminate that server result command. Preserve backend ignorance of Zerospin and module-owned fetch/result mapping regardless of the chosen persistence path.
6. **Next discussion:** compare aggregate-owned content updated by a guarded result command with machine-owned content replicated into the aggregate. Follow the latter through creation before the source row exists, Save/Refresh routing under consistent producer identity, replica enrollment and lag, deletion/cancellation, owner isolation, and standalone persistence. Do not invent a new coordination mechanism merely to preserve the earlier design. The existing standalone `stageCommand` result arrangement must be reconsidered explicitly if ownership changes; a shared fetch program alone does not establish a local replica writer.
7. **Naming ambiguity:** the latest user message called the initial machine-backed example the “GitHub profile brick”; this handoff and the inspected sample implementation concern GitHub Activity. Both module names exist. Resolve which module(s) are in scope before implementing; do not silently expand to both.
8. **Work performed:** read-only source/doc review and GitHub PR inspection, followed by this handoff update. No runtime/UI implementation, vendor synchronization, merge, reset, tests, or live backend verification was performed. No plan or ADR was created or archived. Existing Studio, aggregate, and vendored WebSocket changes remain unrelated WIP to preserve.

The earlier requirements, result-command acceptance example, and acceptance matrix below remain the historical baseline. Apply the explicit reopened ownership questions above before treating their storage/delivery mechanisms as settled. User-facing behavior remains required unless the user changes it.

## Done and evidence baseline

1. **Upstream Zerospin advanced beyond the original design.** The sibling checkout is at `a4fa927b40137ab67f4b05950767af8b4cccf242` (`Implement machine services and durable captured operations`). [Plan 021](../../../zerospin/wiki/archive/plans/021-plan-model-machines-hosted-by-operator-actors.md) completed actor-hosted model machines; [Plan 022](../../../zerospin/wiki/archive/plans/022-plan-machine-services-and-captured-operations.md#final-outcome--2026-10-01) subsequently replaced that topology with service-owned machines and explicit captured inputs. Use the [current architecture](../../../zerospin/wiki/architecture/server/machineServices.md) and [ADR 001](../../../zerospin/wiki/adrs/001-machine-instance-identity-and-service-ownership.md) for the current contract.
2. **QRK has not consumed that cutover.** QRK HEAD is `b1236529ad78f98073c8c31e8b4c6934850a1cc5`, with existing local changes. Its [vendored machine declaration](../../vendor/zerospin/packages/core/src/machine/makeMachine/makeMachine.ts) still takes `source`, plural `selections`, and `onBootstrap`; its runtime still includes `makeMachineRepo`. This is older than both completed upstream designs. Do not write QRK code against upstream symbols until the vendor integration is reconciled.
3. **Studio's live-session foundation exists.** [Plan 017](../plans/017-plan-studio-live-session.md) records the implementation, verification, and remaining manual checks. Current Studio Grid and BrickDetail use `userSession`; the user aggregate composes Library models/contracts. Library itself remains standalone. Do not repeat this migration or infer that GitHub Activity's new form/refresh controls already exist.
4. **GitHub Activity remains a sample renderer.** Its [declaration](../../apps/library/modules/githubActivity/githubActivityV1.ts) uses `makeModuleVersion`, nests `payload` and `data` inside `state`, and supplies generated contribution samples. Its [view](../../apps/library/modules/githubActivity/githubActivityView.tsx) has no payload form; both the view and [generator spec](../../apps/library/modules/githubActivity/generator/defaultSpec.ts) read `data.contributions`.
5. **Generic Library storage/editing is still whole-state based.** The brick model stores `moduleId`, `wallId`, and unknown JSON `state`; `makeModuleView` gives a form `state`/`onChange(state)`; `updateBrickState` validates the selected module's schema and replaces the state. There is no separate machine-module payload/result authority in these contracts.
6. **Backend access exists, but its freshness contract is insufficient.** [GitHubBackend](../../apps/api/modules/githubProfile/GitHubBackend.ts) exposes `getProfile(url)` through Library RPC. It caches for 24 hours and returns an expired cached result while refreshing in the background. A successful RPC therefore does not prove that this refresh cycle obtained fresh contributions.
7. **Verification provenance:** upstream Plan 022 reports completed Node, Workerd, typecheck, lint, and consumer-build acceptance; Plan 017 records its own checks and limitations. This handoff inspected current source and those records. It did not rerun their suites or perform a live GitHub fetch. Upstream acceptance is not QRK integration acceptance.

## Prior QRK requirements — ownership mechanisms reopened above

### Module and data ownership

1. The agreed factory name is **`makeMachineModuleVersion`**. It should express an actual machine-backed module contract, including input/result ownership and its authored behavior; adding a marker to the existing whole-state shape is insufficient. Its exact signature and returned bundle remain to be designed against the new upstream API.
2. Separate user-authored **payload** from fetched **state**. GitHub Activity's payload supplies the GitHub URL; fetched state contains contributions. The earlier `state.payload` / `state.data` nesting is the shape to replace. Physical brick columns, default values, and auxiliary freshness fields were not finalized.
3. Each module authors its own machine and result mapping. Do not introduce a universal fetch-machine implementation or put GitHub branches/dependencies in Studio, generic Library UI, or generic contracts. The host composes capabilities; the module owns its behavior.
4. A fetch returns a domain result. The module decodes it and constructs a **brick-specific result command payload**. The host supplies command identity and delivery. The backend never creates or executes Zerospin commands.
5. The form edits payload independently. A user-facing generic whole-state update must not let the payload form overwrite machine-produced results. Existing non-machine modules still need their ordinary editing behavior.
6. Each brick has an independent workflow, even if two bricks use the same GitHub URL. A backend may share cache/in-flight network work without merging brick lifecycle, result guards, or refresh timing.
7. `refreshInterval` belongs to the module's policy, not a per-brick user setting and not a mandatory field on every kind of machine module. The GitHub Activity interval discussed was **24 hours**.

### Backend boundary

1. Keep the backend ignorant of **everything Zerospin**: machine State, brick IDs, actor/session identity, commands, retry schedules, and alarms. Its public request/result/error vocabulary is about fetching the requested domain data.
2. The backend extraction from Library is separate work owned by the user. Integrate with the resulting capability; do not make extraction a prerequisite for drafting the QRK module contract or perform that extraction as incidental work.
3. A scheduled fresh cycle must attempt upstream fetching/revalidation and report that attempt's result. Silently applying the old cache response as a newly successful refresh violates the intended freshness behavior. Reusing the current stale-while-revalidate `getProfile` call unchanged would do exactly that.
4. Backend transport, authenticated access, and the fresh-result API remain open. Preserve server-held credentials. Do not silently introduce browser secret access, a CORS/trust-boundary move, or a custom RPC transport to solve deployment wiring.

### Studio and standalone Library

1. **Studio:** use its live aggregate/session integration. The fetch/refresh workflow is server-owned and keeps progressing when all browser tabs are closed. A tab or viewer actor must not create a competing workflow for the same brick.
2. **Library:** keep its standalone session. Run a fetch on payload **Save** and explicit **Refresh**, using the same module-authored Effect program that fetches, decodes, and maps the result into the result-command payload. Stage that result contract locally with `stageCommand`.
3. The reusable unit is the module's program, not a direct call from UI into the machine's `onActivation` callback. Studio supplies the program's backend capability in its server activation; Library supplies its interactive backend capability.
4. Library's existing `newSyncRpcSession<LibraryApi>("/rpc")` usage is a transport precedent, not the final extracted-backend API. Browser-safe declarations must not import a server adapter or backend credentials.
5. Library can use the program's authored in-process `Effect.retry`. No closed-tab durability guarantee or background durable machine host was agreed for standalone Library. New service-session capabilities upstream do not themselves change that decision.

### Refresh, stale results, and cancellation

1. A payload change starts a new refresh cycle immediately. Manual Refresh also initiates a cycle; concurrent/repeated Refresh semantics still need a precise rule.
2. After success **or terminal failure of the current cycle**, schedule the next fresh cycle relative to completion:

   ```ts
   // Module policy, not a cron boundary or a generic runtime default.
   nextRefreshAt = cycleFinishedAt + refreshInterval;
   ```

3. Retain the last successful contributions during a refresh. On a URL/account change, retain the old result with a visible stale indication and its original payload/account provenance; never display it as if it belonged to the new account.
4. A late response from a superseded payload/cycle must not overwrite current brick data. Runtime activation revision checks help, but the result contract must still check the current owning brick: the payload can change before the service receives that fact, and an already admitted command can outlive its activation.
5. Brick removal must stop future refresh work and prevent late result writes. Payload edits/removal must remain effective during retries and a terminal failed cycle. The new runtime needs explicit inputs for these facts; row deletion alone does not cancel it.

### Retry and failure semantics

1. Preserve **two distinct retry layers**. The module author writes `Effect.retry` inside the fetch/activation implementation for retries during one invocation. Durable retry happens after an invocation fails and persists enough state to resume through the Durable Object alarm registry. A runtime-wide `Effect.retry` wrapper does not implement the latter.
2. The user accepted authoring an Effect retry schedule and persisting its **materialized finite delays**, not serializing a live Schedule closure. The discussed technique was `Schedule.toStep` for deterministic, finite, input-independent schedules. Revalidate the installed Effect API before implementation; arbitrary schedules are not promised serializable.
3. Conceptually retain `delaysMs`, the next step/cursor, and absolute `retryAt`. A failed attempt selects the next delay; the operation remains recoverable pending work until its deadline. Recovery reads retained progress instead of restarting at the first delay. The alarm registry wakes the owner; persisted data remains the source of truth.
4. The module supplies the retry budget. **Throw when cumulative retry delays exceed half the refresh interval:**

   ```ts
   // Illustrative materialized values; the final GitHub retry timetable is open.
   const delaysMs = [60_000, 120_000, 240_000, 480_000];
   const totalDelayMs = delaysMs.reduce((total, delay) => total + delay, 0);

   // Equality is allowed. This counts waits, not fetch execution time.
   if (totalDelayMs > refreshInterval / 2) {
     throw new Error("Cumulative retry delay exceeds half the refresh interval");
   }
   // For a 24-hour refreshInterval, the allowed cumulative waits total 12 hours.
   ```

5. Ordinary retryable typed failures consume the durable schedule. The author can yield a **`NonRetryable`** error to skip the remaining retries. Exhaustion produces the runtime's **`ExhaustedRetries`** reason.
6. The agreed direction is a runtime-owned **`Failed` State** carrying the terminal reason and enough origin/cause/time context for recovery. The user rejected making `onFailure` responsible for excessive workflow knowledge. The exact error/State schemas, reserved name, and callback typing were not settled.
7. **Failed ends only the current refresh cycle.** It does not disable the brick permanently. The module schedules another fresh cycle after `failedAt + refreshInterval`; a payload change can start sooner. Keep this module policy out of the generic runtime.
8. Earlier recovery sketches used `wakeAt`/`onWake`. Current upstream instead attaches an optional `wakeAt` to a server activation. Preserve the timing requirement while redesigning its expression; do not copy the old route API.
9. Serialized retry schedules, `NonRetryable`, and automatic `Failed`/`ExhaustedRetries` behavior were excluded from the isolated Zerospin refactor and are **still absent** from the inspected current machine API/runtime. Today an activation's recorded `status: 'failed'` remains stopped and retains a diagnostic string; that is not the agreed recoverable domain State.

## What changed upstream, and the impact on QRK

The original QRK discussion led to one model-machine concept, with independent brick/row workflows sharing an operator actor's confirmed replica and alarms. That satisfied the user's rejection of a replica or Durable Object per machine. It is now historical implementation guidance: Plan 022 uses **one service-version host with many independent instances**, explicit input operations, and no implicit source replica or row-enrollment query. The no-replica-per-brick requirement remains satisfied through a different mechanism.

| QRK need | Current upstream capability or constraint | Remaining QRK impact |
| --- | --- | --- |
| Independent work for each brick without duplicated replicas | Service-version DO/database/alarm registry shared by independent instances | Choose module service composition and bind instance identity to the producing owner plus brick identity. Do not register `{ actor, machine }` hosts. |
| React to payload changes | `defineServiceOperations` binds typed addressed inputs; successful contracts capture and deliver them | Payload Save must emit the needed facts. No automatic watch of `state.payload`, source-row query, or `onCommand` reaction remains. |
| Start work for new bricks | Only explicitly initializing operations create missing State | The appropriate create/configure command must emit initialization. Decide treatment of existing sample bricks and creation without usable payload. A scan is not supplied by the runtime. |
| Cancel when a brick is removed | Superseding transitions cancel activation work; completed State and destination version pins remain retained | Removal must emit a cancellation fact. Do not equate deleted brick rows with deleted machine identity or reuse of an old lifetime. |
| Fetch without blocking unrelated bricks | `makeMachineServer` runs async work outside the owner transaction, from frozen State | Module supplies the backend Effect and explicit next State; synchronous input handlers must not fetch or suspend. |
| Apply the result to the correct aggregate brick | Declared outgoing actor/contract bindings, live activation authority, source-scoped aggregate targets, ordinary guards | Author the result contract and service-authorized destination actor. Preserve wall/user/module checks and cycle freshness checks; never manufacture shopper/user claims. |
| Keep form input separate from generated data | Exclusive write ownership for machine-owned State/models; ordinary commands mutate their own domain data | Choose the actual payload/result storage boundary. Existing mixed-use `brick` cannot simply become a machine-owned model while generic contracts still write it. |
| Refresh on durable deadlines | Optional `wakeAt` plus retained activation work and alarms | Express completion-relative refresh States against this API. Timers still need module policy and explicit transitions. |
| Retry after recorded failures and resume next cycle | Pending/running recovery exists; recorded failure is deliberately stopped | Serialized retry policy and recoverable `Failed` behavior remain a separate upstream/design gap, not a benefit already delivered. |
| Prevent old results from restoring obsolete state | Revision fencing, cancellation, live authority; admitted remote work can still finish | Supply domain repeat safety and payload/cycle guards at the result contract. Runtime fencing alone is insufficient. |
| Surface workflow status | Authorized State/model projections and writable service sessions exist; private activation rows stay private | Decide whether QRK needs a service projection/session or publishes chosen status into the brick through its result/status contracts. Do not add a second session automatically. |
| Reuse behavior in standalone Library | Shared synchronous declarations are browser-safe; providers remain server-only | Share the fetch/decode/result mapping program via host-supplied capabilities. Standalone local result staging remains QRK work; service durability is not automatically available there. |

### Consequences to carry into the QRK design

1. **Explicit input completeness replaces source selection completeness.** Audit add/configure, payload changes, Refresh, removal, and any alternate import/creation path. Successful commands with no captured input do not notify the machine. Failed commands must emit no committed machine work. Do not route the result command back into a new fetch loop merely because it changes brick state.
2. **Initialization, identity, and version pins are durable.** Upstream scopes instance IDs by trusted producing owner and excludes producer code version. Choose one consistent producing owner for a brick's inputs. Moving Refresh to a thin service contract while Save originates in an aggregate may change that owner scope; it cannot be assumed to address the same instance. Receiving service version pins survive completion.
3. **The earlier brick-specific result command remains feasible.** A module machine can own workflow State, then use an authorized source-scoped aggregate command to update the aggregate-owned brick. This fits the earlier agreement without moving the whole brick into service-owned storage. Directly projecting a service-owned result model would be a different QRK ownership design and needs an explicit decision.
4. **Thin-command success is not workflow completion.** Saving payload may commit an input before the service handles it; handling can precede or fail before a successful fetch. UI must not label a fetch complete merely because its initiating command succeeded. Choose shared status deliberately instead of exposing internal queue/activation rows.
5. **Operator actors now express command access, not hosting.** The original `checkoutOperator` idea should not become an extra QRK replica host. A service-authenticated actor may still be needed to authorize the module's result command at the user aggregate; its exact identity/name/access policy is open.
6. **Read current consumer examples.** Tic-tac-toe demonstrates captured facts → service activation → guarded aggregate command. Fulfillment demonstrates machine-owned data with authorized service sessions. Checkout/promotion ordering was the runtime's proving case, not functionality to copy into QRK. The later service cutover removed the earlier aggregate fulfillment-operation relay, so the old machine inventory is not a template.

## Annotated end-to-end acceptance example

This is a behavioral sketch, not proposed final operation names or an API implementation:

```text
Save GitHub payload for brick B under user aggregate U
  1. The owning contract validates B and persists its payload.
  2. Its committed output includes the module service's addressed input.
     # Include the necessary facts; the receiver does not query U's replica.
  3. The service handles that input and supersedes B's old refresh cycle.
     # New State/work commit before any backend call starts.
  4. The activation runs the module's fetch/decode/result-mapping Effect.
  5. It submits B's result command through its declared aggregate binding.
     # The contract checks that B still exists and this cycle is current.
  6. On success, retain the result and arrange the next cycle after 24 hours.
     # On exhausted/non-retryable failure, retain stale data and also arrange
     # the next cycle. That terminal-failure recovery is still missing upstream.

Meanwhile the payload changes from A to B, then back to A
  # Equality of URL alone may accept an old A response.
  # Choose a cycle identity/guard that enforces the intended freshness rule.

Remove the brick while the provider call is in flight
  # Explicit cancellation stops subsequent work; the result guard rejects
  # late writes even before the cancellation input reaches the service.
```

## Remaining work

1. **Reconcile the vendor baseline.** Use the configured sibling/main subtree workflow when beginning implementation. Preserve the existing Studio/WebSocket lock changes and other WIP; Plan 017 records their earlier local upstream synchronization. Check current diffs before deciding what needs carrying forward. The service cutover includes fixed-schema changes; this handoff authorizes no data reset or compatibility strategy.
2. **Resolve the few material QRK ownership/API choices below.** Write the GitHub Activity implementation plan in QRK's `wiki/plans/` under the current numbering convention. Use this handoff as the requirement record, current upstream docs as runtime facts, and Plan 017 as the Studio baseline. Do not revive the superseded operator-host API.
3. **Specify the remaining retry capability against the new runtime.** Preserve author-owned Effect retries, serializable finite delays, the cumulative half-interval budget, terminal reasons, and recovery after Failed. Decide exact materialization/validation and error semantics before adding a runtime API. No module-specific refresh policy belongs in generic Zerospin.
4. **Define the module-owned bundle.** Specify `makeMachineModuleVersion`, payload/result schemas and defaults, input operations, the shared machine/server adapter split, backend dependency, result contract, and standalone execution seam. Keep module-specific code with the module and import defining modules directly.
5. **Wire lifecycle facts and the selected content delivery path.** Compose the selected service into QRK's system; emit initialization/change/refresh/removal inputs through the chosen contracts. If results stay aggregate-owned, authorize and guard result commands; if service-owned replication is approved, establish replica enrollment, publication, and removal behavior. Audit existing-brick onboarding, owner isolation, retained identities, and repeat safety in either case.
6. **Integrate backend freshness.** Agree a request/result/error capability that waits for the required fresh attempt and can be supplied by both hosts. The module maps it to contribution state and classifies errors. Keep backend extraction and deployment wiring coordinated with their separate work.
7. **Build the QRK experience.** Add the payload form and explicit Refresh to the appropriate Library/Studio UI; update module view and generator state paths; show stale provenance and chosen failure/loading state. Preserve current brick identity, grid, group, and page/wall isolation. Studio currently lacks the generic state-edit/visibility controls noted in Plan 017; do not assume that plan already provides this UI.
8. **Verify the integrated behavior and update its docs.** Use the acceptance matrix below. Report actual QRK results independently of upstream's recorded acceptance, and preserve unrelated failures/WIP. Complete/archive the eventual implementation plan only through the implementation workflow; creating this handoff does not archive Plan 017.

## Acceptance matrix for measuring Zerospin's impact

These are future checks, not passes claimed by this handoff. Use backend/runtime integration coverage where appropriate and manual Library checks. **Never write, run, restore, or maintain tests for `apps/library` / `@qrk.sh/library`.** Discover available Nx targets before execution.

| Scenario | Required observable result | Capability being assessed |
| --- | --- | --- |
| Save valid payload in Studio, then close every tab | Fetch completes and a later refresh occurs without a browser | Captured delivery, service lifecycle, alarms, QRK composition |
| Save in standalone Library | Same module program fetches and stages a valid local result; reopen shows persisted result | Shared program/result contract, standalone integration |
| Invalid/unauthorized Save | Payload not committed; no authoritative fetch input emitted | Owner/contract guards and input capture |
| Same URL in two bricks; equal brick keys under distinct owners | Independent cycles/status; no cross-owner result write | Instance scoping, authority, module identity mapping |
| Backend has an expired cached response | A fresh cycle waits for/reports the requested upstream attempt | Backend freshness contract, module error handling |
| Payload A → B while A fetch is slow; also A → B → A | Only the current cycle can update the brick; retained old data is visibly stale | Revision fencing plus destination cycle guard |
| Delete while fetching or waiting for a retry | No later result recreates the brick and no future refresh is scheduled | Explicit cancellation and guarded result application |
| Restart during durable retry wait | Same retained deadline/cursor resumes; delay sequence does not restart | Missing serialized retry capability |
| Retry waits sum to exactly half the interval, then exceed it | Equality accepted; excess throws during validation/materialization | Module-supplied cumulative budget |
| NonRetryable or exhausted retries | Current cycle becomes Failed; stale data remains; next fresh cycle is scheduled | Missing runtime failure State/recovery semantics |
| Restart after result command was accepted but before outcome observed | Safe repeat, no regression to an older cycle, correct next-refresh timing | Command recovery plus QRK domain repeat rules |
| Repeated Save/Refresh input or service input redelivery | Behavior follows the chosen repeat rule without competing loops | Explicit lifecycle semantics and delivery deduplication |
| Save command succeeds before machine handling/fetch finishes | UI distinguishes saved input, pending handling/fetch, and committed result | QRK status projection and command/handling separation |
| Browser bundle/build and ordinary modules | No server-only backend imports; existing module edits and page isolation remain valid | Shared/server boundary and scoped integration |

For Library, use typechecking, lint, builds when needed for consumer imports, and manual Save/Refresh/error/stale/reload checks. Use QRK backend and Zerospin runtime tests only in their owning projects. Plan 017's unexercised Studio controls remain its documented limitation, not an implicit pass here.

## Open decisions

1. **Factory and storage boundary:** the exact `makeMachineModuleVersion` props/return shape; where payload, result, stale provenance, and public status persist; aggregate-owned content via result commands versus service-owned content replicated into the aggregate. The latter is the latest proposal, not an approved decision. Resolve source-row creation/enrollment, module content lookup, write authorization, and standalone execution/persistence. Ordinary text bricks remain aggregate-owned and do not acquire machines. Do not silently mark the shared brick model machine-owned.
2. **Service composition and input identity:** per-module versus another explicitly chosen service composition, configured names/versions, initial operation, payload-change/Refresh/removal vocabulary, consistent producing owner, and treatment of pre-existing sample bricks. No QRK service/operator name was approved in the earlier discussion.
3. **Payload/cycle guard and repeats:** normalization/equality, A → B → A, same-payload Save, repeated/concurrent Refresh, reusing deleted brick IDs, and which committed event counts as cycle completion. Preserve independent cycles and completion-relative timing while settling these details.
4. **Retry representation:** accepted finite Schedule subset, materialization point, upper bounds and invalid delays, cursor semantics, persistence/versioning, exact GitHub delay sequence, terminal-error encoding, interruption/defect behavior, and any attempt timeout. The cumulative budget applies to waits and does not bound hanging backend execution.
5. **Failure/public status:** precise built-in Failed schema and recovery API; typed/sanitized cause; what users see during pending, stale, NonRetryable, and exhausted states; aggregate status fields versus authorized service projection. An internal failed activation row is not the product model.
6. **Backend capability:** result shape restricted to relevant contribution data, freshness/revalidation behavior, errors and retry classification, server binding versus browser RPC, and how the separately extracted backend is configured in each host.
7. **Initial presentation and compatibility:** empty initial data versus deliberate preview samples, placeholder behavior, module-version and persisted-state changes, generator state-path updates, and development/deployed data treatment. Upstream's hard cutover does not itself authorize deleting QRK data.

## Suggested skills

1. `$spec` — resolve these material choices and produce the QRK implementation plan without reopening settled requirements.
2. `$rubber-duck` — use when the user wants to explore an unresolved ownership or lifecycle trade-off before settling it.
3. `$use-morgs32-wiki-patterns` — consult QRK/local patterns and current upstream machine/service conventions before shaping the bundle or coordination.
4. `$update-vendor` — reconcile the completed upstream work into QRK using its configured subtree workflow and preserve consumer WIP.
5. `$nx-workspace` / `$nx-run-tasks` — discover the actual projects/targets, then run scoped verification; observe the Library test prohibition.
6. `$implement` — execute the agreed plan, complete its verification, reconcile affected documentation, and archive only after completion.

## Pointers

1. [AGENTS.md](../../AGENTS.md)
2. [README.md](../../README.md)
3. [wiki/plans/017-plan-studio-live-session.md](../plans/017-plan-studio-live-session.md)
4. [apps/library/modules/githubActivity/githubActivityV1.ts](../../apps/library/modules/githubActivity/githubActivityV1.ts)
5. [apps/library/modules/githubActivity/githubActivityView.tsx](../../apps/library/modules/githubActivity/githubActivityView.tsx)
6. [apps/library/modules/githubActivity/generator/defaultSpec.ts](../../apps/library/modules/githubActivity/generator/defaultSpec.ts)
7. [apps/library/make/makeModuleVersion.ts](../../apps/library/make/makeModuleVersion.ts)
8. [apps/library/make/makeModuleView.tsx](../../apps/library/make/makeModuleView.tsx)
9. [apps/library/libraryModule/libraryModule.ts](../../apps/library/libraryModule/libraryModule.ts)
10. [apps/library/libraryModule/models/brick/makeBrickModel.ts](../../apps/library/libraryModule/models/brick/makeBrickModel.ts)
11. [apps/library/libraryModule/contracts/updateBrickState/UpdateBrickStateContractV1.ts](../../apps/library/libraryModule/contracts/updateBrickState/UpdateBrickStateContractV1.ts)
12. [apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts](../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts)
13. [apps/library/libraryModule/contracts/removeBrick/RemoveBrickContractV1.ts](../../apps/library/libraryModule/contracts/removeBrick/RemoveBrickContractV1.ts)
14. [apps/api/modules/githubProfile/GitHubBackend.ts](../../apps/api/modules/githubProfile/GitHubBackend.ts)
15. [apps/api/modules/LibraryApi.ts](../../apps/api/modules/LibraryApi.ts)
16. [apps/library/app/routes/bricks/$brickId.tsx](../../apps/library/app/routes/bricks/$brickId.tsx)
17. [apps/library/session/createLibraryStandaloneSession.ts](../../apps/library/session/createLibraryStandaloneSession.ts)
18. [apps/studio/zerospin/userSession.ts](../../apps/studio/zerospin/userSession.ts)
19. [apps/zerospin/src/aggregates/user/UserV1.ts](../../apps/zerospin/src/aggregates/user/UserV1.ts)
20. [apps/zerospin/src/system.ts](../../apps/zerospin/src/system.ts)
21. [../zerospin/wiki/architecture/server/machineServices.md](../../../zerospin/wiki/architecture/server/machineServices.md)
22. [../zerospin/wiki/archive/plans/022-plan-machine-services-and-captured-operations.md](../../../zerospin/wiki/archive/plans/022-plan-machine-services-and-captured-operations.md)
23. [../zerospin/wiki/adrs/001-machine-instance-identity-and-service-ownership.md](../../../zerospin/wiki/adrs/001-machine-instance-identity-and-service-ownership.md)
24. [../zerospin/packages/core/src/machine/defineServiceOperations.ts](../../../zerospin/packages/core/src/machine/defineServiceOperations.ts)
25. [../zerospin/packages/core/src/machine/makeMachine/makeMachine.ts](../../../zerospin/packages/core/src/machine/makeMachine/makeMachine.ts)
26. [../zerospin/packages/core/src/machine/makeMachine/makeMachineServer.ts](../../../zerospin/packages/core/src/machine/makeMachine/makeMachineServer.ts)
27. [../zerospin/packages/system-worker/src/serviceMachines/README.md](../../../zerospin/packages/system-worker/src/serviceMachines/README.md)
28. [../zerospin/packages/system-worker/src/serviceMachines/makeServiceMachine.ts](../../../zerospin/packages/system-worker/src/serviceMachines/makeServiceMachine.ts)
29. [../zerospin/examples/tic-tac-toe/src/computerOperations.ts](../../../zerospin/examples/tic-tac-toe/src/computerOperations.ts)
30. [../zerospin/examples/tic-tac-toe/src/computerTurn.ts](../../../zerospin/examples/tic-tac-toe/src/computerTurn.ts)
31. [../zerospin/examples/tic-tac-toe/src/computerOperatorV1.ts](../../../zerospin/examples/tic-tac-toe/src/computerOperatorV1.ts)
32. [Zerospin PR #37](https://github.com/morgs32/zerospin/pull/37)
33. [../zerospin/packages/core/src/aggregate/make/makeAggregateVersion.ts](../../../zerospin/packages/core/src/aggregate/make/makeAggregateVersion.ts)
34. [../zerospin/packages/core/src/models/make/makeReplica.ts](../../../zerospin/packages/core/src/models/make/makeReplica.ts)
35. [../zerospin/wiki/architecture/server/admitCommands.md](../../../zerospin/wiki/architecture/server/admitCommands.md)
36. [../zerospin/examples/shopping/src/zerospin/aggregates/shopper/models/productReplica/ProductReplicaV1.ts](../../../zerospin/examples/shopping/src/zerospin/aggregates/shopper/models/productReplica/ProductReplicaV1.ts)

Sibling-checkout links intentionally identify the implementation inspected on this date. After vendor synchronization, use the corresponding vendored files and refresh this baseline rather than assuming the old vendor API or an archived checkpoint still describes current behavior.
