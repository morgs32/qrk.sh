# Machine actors design

**Date:** 2026-09-28

**Status:** Approved for planning

## Problem Statement

Automations observe confirmed commands and return a command or an empty result.
That interface does not describe a durable process which waits for a business
deadline, performs asynchronous work, reacts to changed inputs while working,
and resumes after interruption. Those processes need explicit private state and
a lifecycle independent of any browser session or aggregate version.

`@zerospin/machine-workers` already supplies schema-bearing States, machine
routes, Durable Object ownership, persisted operations, alarms, and protection
against obsolete route results. It currently has no domain-chain subscription
or selected projection. Its combined activation sleep/retry policy and durable
retry counters also differ from the interface specified here.

## Solution

1. Replace aggregate and service automations with durable machine actors built
   using `machine-workers`. Each actor owns its selected domain projection,
   private machine state, source progress, and pending work in one Durable
   Object.
2. Register machine declarations in a system-level `machines` collection. Each
   declaration identifies its source version, selections, permitted contracts,
   States, and behavior.
3. Consume terminal source occurrences through the existing fanout machinery.
   Local callbacks atomically update the projection and decide whether work
   changes. Asynchronous work runs outside that transaction.
4. Express durable waiting through `wakeAt` and `onWake`, asynchronous
   computation through `onActivation`, and one outgoing contract command
   through `command` and `onResult`.
5. Use Effect schedules inside asynchronous programs for transient retries.
   Persist business deadlines and unfinished operations, rather than Effect
   schedule progress.

## User Stories

1. As an application author, I can register an aggregate or service machine
   without reshaping the existing aggregate version registry.
2. As an aggregate machine author, I have one machine instance per aggregate
   instance and machine name, whose identity survives changes to its source
   version pin.
3. As a service machine author, I can observe a pinned service-version chain
   with the same lifecycle and command capabilities as an aggregate machine.
4. As a machine author, I can distinguish selected domain data from private
   work state, including accepted inputs and intermediate results.
5. As a machine author, I receive every new terminal source occurrence,
   including failures and no-ops, and can leave current work unchanged.
6. As a calendar user, I can receive an email reminder thirty minutes before
   an event, with pending reminders rescheduled or cancelled when appropriate.
7. As a calendar user, an unrelated edit does not reset a reminder deadline.
   An attendee change can update the selected recipients without restarting
   that timer.
8. As a calendar user, changing attendees while a briefing is being prepared
   invalidates that attempt and starts preparation with the new inputs.
9. As a machine author, a late result from an invalidated attempt cannot become
   the current briefing or cause a new command to be issued by that attempt.
10. As a machine author, I can explicitly commit to sending an email, freezing
    its recipients, content, and delivery key before calling the provider.
11. As a machine author, I can choose between handing off one command durably
    and waiting for its terminal outcome, without managing command IDs or a
    browser Node.
12. As a machine author, I can use Effect retry schedules around the particular
    external operation that needs retries.
13. As an operator, I can recover an interrupted activation or a waiting machine
    without resetting its state instance, business deadline, or frozen command.
14. As an operator, an operation recorded as failed remains inspectable and is
    not silently revived by a restart.
15. As a machine author, first initialization and a source-version change have
    explicit callbacks and do not invoke ordinary command reactions for all
    historical entries used to build a projection.

## Implementation Decisions

### Registration, identity, and authority

1. Extend `makeSystem` with a `machines` collection beside `aggregates` and
   `services`. Retain the existing aggregate version-map shape. Machine
   declarations live in this registry, not inside individual aggregate or
   service versions.
2. Each declaration references its concrete aggregate or service source
   version. Derive the source family and explicit version pin from that
   reference. Keep the source, selections, permitted contracts, and behavior
   together in the declaration.
3. An aggregate machine instance is identified by
   `{ systemId, aggregateName, aggregateId, machineName }`. A service machine
   instance is identified by `{ systemId, serviceName, machineName }`.
   `machineName` is its system registry key. The source version is subscription
   configuration, not part of instance identity. Selecting another family
   addresses another owner; it is not an in-place version change.
4. Machine declarations use the schema-bearing States and route model from
   `machine-workers`; its durable machine runtime remains the execution
   foundation. Integrate machine owners into the System Worker lifecycle,
   namespace bindings, registration, and source fanout. Applications should
   not need to construct a browser session or manually host each instance.
5. Machine command authority is limited to explicitly declared aggregate or
   service contracts and their bound targets. Normal admission, validation,
   and authoritative guards still apply. There is no optimistic staging or
   client synchronization layer in this capability.
6. Keep package dependencies acyclic. The current machine runtime depends on
   System Worker Repo primitives; adding System Worker consumers must account
   for that direction rather than introduce a reciprocal package dependency.
   Reuse the existing Repo and queue implementations instead of copying them.

The system registration shape is:

```ts
makeSystem({
  aggregates: {
    game: { '1.0.0': gameV1 },
  },
  services: {},
  machines: {
    computerTurn,
  },
});
```

### Projection and private state

1. The machine owns an actor-style declared selection of its source domain.
   The selected projection and private machine state share the same Durable
   Object and local commit boundary.
2. The projection is derived, disposable domain data. Private machine state
   records what the machine is doing and the inputs or results needed for that
   work. Do not mirror the whole projection into private state.
3. Lifecycle and observation callbacks read the selected database. They do not
   mutate authoritative domain rows directly; domain writes go through declared
   contract commands.
4. Accepted work inputs belong in the entered State. An asynchronous activation
   uses that State as `origin`; later projection changes do not silently change
   the inputs of the running attempt. The per-state command reaction decides
   whether those changes require new work.
5. Persist the current State and revision, the source identity and consumed
   position, business wake deadlines, operation status and diagnostic, and any
   frozen outgoing command and outcome needed for recovery. Do not persist
   ordinary Effect retry counters or schedule continuation state.

### Local callbacks and state transitions

1. `onBootstrap({ db })` is a machine-level synchronous callback. After the
   initial selected projection is ready, it chooses the initial State. It is
   initialization, not a callback on every Durable Object activation.
2. `onVersionChange({ origin, db, previousVersion, version })` is a
   machine-level synchronous callback. After rebuilding the projection for a
   new pin, it reconciles the preserved private State and either returns a new
   State or leaves current work unchanged.
3. `onCommand({ origin, db, command })` belongs to each State's route. It
   receives that route's specifically typed `origin` and the complete terminal
   occurrence after its projection changes have been applied. It returns a
   new State or leaves current work unchanged. An absent handler leaves work
   unchanged while the projection and cursor still advance.
4. Use `undefined` for an unchanged decision. Returning a State explicitly
   enters it, including when it has the same `stateName` as `origin`. Re-entry
   advances the revision and creates a new state instance. An unchanged
   decision does not advance that revision, replace a deadline, or restart
   an activation.
5. Local callbacks perform synchronous, local decisions only. They do not
   make external calls or await outgoing command execution. Validate their
   returned State through its declared schema before committing.
6. Applying one occurrence, invoking its local handler, committing the chosen
   State or unchanged decision, and advancing the source cursor are atomic.
   A callback failure must not acknowledge or skip the occurrence.
7. A transition immediately invalidates unfinished work for the old revision
   at the same local commit. Attempt to interrupt its running Fiber, and reject
   any late completion independently of whether interruption succeeds.
8. Observations do not compete as asynchronous command routes under the
   existing first-completion-wins rule. Once a relevant occurrence has been
   consumed and its transition committed, the previous attempt is obsolete.
   This guarantee is local to consumption; it does not claim instantaneous
   visibility of a change not yet delivered by the source.

### State work

1. A State may be idle, wait using `wakeAt` and `onWake`, compute asynchronously
   using `onActivation`, or issue one contract command using `command` and
   `onResult`. These automatic-work forms are mutually exclusive on one State.
   A per-state `onCommand` can accompany any form.
2. `wakeAt({ origin })` computes an absolute deadline when the State is entered.
   Persist that deadline once and schedule it through the inherited alarm
   registry. An expired deadline is immediately eligible; alarms do not promise
   exact wall-clock execution. Re-entry creates a new deadline; restart does
   not recalculate it.
3. `onWake({ origin, db })` runs a synchronous local decision against the
   current selected projection and returns the next State. It performs no
   external work. Verify the waiting revision before committing, so an old
   alarm cannot wake a replacement state instance.
4. `onActivation({ origin })` runs an authored Effect outside the local commit
   gate and returns its proposed next State. Commit it only while its operation
   and originating revision remain current. Application Effect services supply
   external dependencies.
5. The `command` callback synchronously describes exactly one permitted
   contract command, wrapped in `push(...)` or `execute(...)`. It does not
   dispatch commands itself. Multiple commands, including dependent commands,
   are represented by subsequent States rather than a command array, multiple
   callbacks, or imperative command calls within the activation.
6. `onResult` receives the command State's `origin` and its appropriately typed
   result, and synchronously chooses the next State. A pushed command supplies
   the durable handoff receipt; an executed command supplies its terminal
   outcome, including domain failure. Result handling cannot issue another
   command directly.
7. Remove the superseded combined `activationPolicy` and custom sleep/retry
   configuration from the affected runtime interface and callers. Do not add
   durable mid-program sleep or persisted substep execution. Waiting and
   durable progress are expressed by States.

### Outgoing commands and committed side effects

1. `push(command)` durably accepts responsibility for delivering the command
   and permits `onResult` to continue after that handoff. Its receipt does not
   imply admission or authoritative execution succeeded.
2. `execute(command)` submits through normal admission and waits for the
   terminal result of the selected target version before invoking `onResult`.
   It does not hold the machine's local gate while waiting on another owner.
3. Derive command identity from machine instance identity and the originating
   state revision. One command slot per state instance removes the need for
   authored keys or numbering calls by execution order. Distinguish this
   outgoing contract command from incoming terminal occurrences supplied to
   `onCommand`.
4. Freeze and durably retain the complete command, delivery mode, target pin,
   and identity before any dispatch. Recovery uses those original bytes and
   the same identity; it does not rerun the description callback to invent
   another command. Re-entering the State intentionally creates a new slot.
5. Retain sufficient command outcome/progress to recover a crash after remote
   execution or durable handoff but before the local next-State commit. Use
   existing admission idempotency and terminal-result recovery. Do not treat
   command completion as atomic with the machine's local transition.
6. Once durably handed off, a command remains a delivery responsibility even
   if the machine subsequently transitions. A late result cannot transition
   an obsolete state instance, but invalidation does not retract an already
   committed handoff or undo remote execution.
7. An invalidated asynchronous computation cannot publish its result directly:
   it must first commit a command-producing State. This gives preparation and
   publication an explicit decision boundary.
8. External effects such as email sending use the same explicit commitment
   pattern. Entering `sending` freezes recipients, content, and an
   application-owned delivery key. Changes consumed before this commit can
   change or cancel the reminder; later changes do not alter that committed
   email. Retries and interrupted activations reuse the key where the provider
   supports deduplication. The design does not promise exactly-once effects
   across an arbitrary external provider.

### Fanout, initialization, and source changes

1. Reuse `makeFanoutQueue` and `makeFanoutSubscriber` for machine delivery from
   the pinned aggregate or service version chain. Current actor-targeted
   fanouts do not already deliver to machine owners; add machine destinations
   using the same factory and subscriber conventions.
2. Deliver complete terminal occurrences in source order, including failures
   and no-ops. Each machine maintains its own consumed cursor. Committed-prefix
   redelivery must not invoke a handler or perform a transition again.
3. Acknowledge delivery after the receiver's local durable commit. Do not await
   an LLM request, a future deadline, external sending, or outgoing command
   execution before acknowledging source fanout. Preserve existing queue
   diagnostics and catch-up behavior rather than inventing another delivery
   or retry protocol.
4. On first creation, capture a source frontier and build the selected
   projection through it without invoking historical `onCommand` handlers.
   Invoke `onBootstrap` against that projection and commit initialization.
   Occurrences after the frontier are processed normally, without a gap between
   catch-up and subscription. Do not start initial automatic work before this
   preparation is complete.
5. On a source-version change, suspend automatic work while replacing the
   selected projection and source progress with those of the new pin. Preserve
   private State and frozen command responsibilities. Rebuild through a
   captured frontier without ordinary command reactions, then invoke
   `onVersionChange` once for that committed change before resuming work.
   Returning unchanged preserves the current state instance and its deadline;
   returning a State replaces it normally.
6. Prevent deliveries from a former source pin from mutating the new projection
   or advancing its cursor. A source switch must not leave the machine reading
   a partly rebuilt projection or accidentally invoke `onBootstrap` again.
7. On ordinary restart, catch up unseen occurrences through a captured source
   position before resuming due work. Process that suffix through the normal
   `onCommand` path. This is neither initial bootstrap nor a version change.
   Use a bounded captured destination rather than wait for a permanently idle
   source.

### Retries, interruptions, and failed operations

1. Authors use `Effect.retry` and Effect schedules around transiently failing
   work inside `onActivation`. They choose the retryable failures, delays,
   backoff, and exhaustion handling with those existing tools.
2. An Effect schedule belongs to the running program; its progress is not
   durable. Remove the machine runtime's custom retry/backoff implementation
   and persisted retry-progress policy fields. Keep operational status and
   diagnostics needed to explain success, failure, and interruption.
3. A delay which must survive restart, including a business decision to try
   tomorrow, is an explicit waiting State using `wakeAt` and `onWake`.
4. On cold recovery, restart an unfinished asynchronous activation from its
   beginning under the same state instance, after source catch-up and checking
   that it is still current. Its Effect schedule starts fresh. External calls
   made before interruption may repeat.
5. Recover a command State through its retained command and outcome, not as a
   fresh outgoing command. Recover a waiting State from its persisted absolute
   deadline. Repeated alarms must not start a duplicate in-flight operation
   within the same live instance.
6. If an activation ultimately fails, retain the current State and record a
   failed operation with its diagnostic. Do not schedule more attempts or
   revive it after restart. There is no new exhausted-failure callback.
7. Authors may handle expected failures inside their Effect and return an
   explicit State such as `BriefingUnavailable`. A later relevant occurrence
   can also transition a machine with a failed operation into fresh work.
   A returned domain command failure is data for `onResult`, not automatically
   a transient runtime failure to retry.

### Cutover and affected documentation

1. Replace aggregate and service automation declarations and their execution,
   output-staging, storage, and authority paths throughout the affected
   repository. Update in-scope callers, examples, tests, exported configuration,
   and documentation. Do not retain automation aliases or a dual execution path.
2. Preserve ordinary actors, source chains, sessions, and domain declarations
   that still serve their existing purposes. Remove automation-only machinery
   rather than renaming it into a second competing machine runtime.
3. Follow the pre-release policy: changed fixed schemas require empty storage.
   Do not translate deprecated automation rows into machine rows or add legacy
   decoders. Runtime source-pin rebuilding is an intentional operation on the
   disposable projection, not a migration of deprecated private state.
4. Keep the glossary, affected architecture pages, and machine runtime guidance
   aligned with the new ownership and lifecycle. Remove obsolete applied-base
   and aggregate-version cutover descriptions from current affected docs:
   current aggregate execution uses an explicitly supplied version. Preserve
   historical archived documents and unrelated changes.

## Testing Decisions

1. Use the real Workerd machine-owner and source-chain seam as the primary
   behavioral test surface. Admit domain commands, observe machine state and
   emitted commands, advance alarms, and evict or interrupt Durable Objects.
   Fake external email and LLM dependencies, not the Durable Object runtime or
   fanout protocol. No real provider account or network scraping is required.
2. Cover bootstrap against an existing history: historical occurrences build
   the projection, `onBootstrap` establishes one initial state instance, and
   subsequent occurrences are consumed without a subscription gap. Reopening
   the owner must not bootstrap again.
3. Cover successful, failed, and no-op terminal occurrences, ordered catch-up,
   committed-prefix redelivery, and atomic rollback when a local handler fails.
   Acknowledgement must depend on local durable receipt, not slow activation
   completion.
4. Cover reminder waiting, absolute deadlines across eviction, rescheduling,
   cancellation, unrelated edits preserving the same timer, and attendees
   updated before `onWake` prepares the email. Verify that entering `sending`
   freezes the committed email and delivery key.
5. Cover briefing preparation with controlled asynchronous barriers: changing
   attendees consumes a local transition while old work is blocked; the old
   completion cannot commit or issue a command. The replacement uses the new
   inputs. Restart the whole briefing in this version; do not require reuse of
   partial directions or individual attendee research.
6. Cover source-version changes: projection rebuilding suppresses historical
   reactions, preserves private state, invokes `onVersionChange`, rejects
   obsolete source deliveries, and either preserves or replaces pending work
   according to the callback's result.
7. Cover ordinary restart catch-up before due work and automatic restart of an
   interrupted activation under the same revision. Verify fresh in-process
   Effect retry schedules, explicit durable waits, and recorded failures which
   remain failed across restart.
8. Cover both outgoing command modes for aggregate and service targets. Assert
   a push receipt represents durable responsibility while execute supplies a
   terminal outcome; normal guards and declared authority remain effective.
9. Interrupt command delivery after acceptance or remote execution but before
   local completion. Verify stable identity and original bytes, recovery of the
   same command result, no duplicate logical execution, and safe rejection of
   stale local completion after another State has been entered.
10. Migrate existing automation behavior coverage, including computer turns and
    service-driven work, to the new machine interface. Map removed tests to
    preserved behavior or to a deliberately superseded automation contract.
11. Use focused declaration tests and compile-only fixtures for State schemas,
    per-state `origin` inference, source and selection compatibility, declared
    contract payloads, distinct push/execute result types, and mutually exclusive
    automatic-work forms. Do not duplicate Workerd lifecycle tests at lower seams.
12. Reuse the existing machine runtime tests for alarms, eviction, interrupted
    operations, stale results, and atomic transitions, plus existing actor
    fanout and automation scenarios as prior art. Use controlled barriers for
    ordering assertions rather than elapsed sleeps. Run the relevant resolved
    Nx targets for changed projects and consumers during implementation;
    writing this spec does not claim that implementation or validation is done.

## Out of Scope

1. Cloudflare Workflows, Trigger.dev, or XState as execution dependencies, and
   a separate desired-jobs interface.
2. Durable suspension inside arbitrary Effect programs, persisted substeps,
   call-order replay, or a second workflow engine underneath the machine.
3. Multiple outgoing command slots in one state instance, parallel named action
   maps, or user-supplied command idempotency keys for the runtime-owned slot.
4. Optimistic browser staging, a machine-specific browser Node, browser session
   synchronization, and a new machine administration or requeue interface.
5. Exactly-once execution across arbitrary external providers, compensation for
   already issued commands, or retracting an email after committing to send it.
6. Reuse of partially completed briefing research, actual LinkedIn/web scraping,
   production calendar/email/LLM integrations, and broad unrelated refactoring.
7. Compatibility storage migrations, automated migration of private State
   schemas across incompatible declarations, and rewriting historical archives.

## Further Notes

1. This is a new design based on the machine-actor handoff and the completed
   design interview. It specifies intended behavior, not an already implemented
   machine actor integration. No implementation plan accompanies this spec.
2. The reminder and briefing scenarios are behavioral fixtures for scheduling,
   cancellation, and recovery; application-specific eligibility decisions stay
   in the authored callbacks.
3. [Effect's scheduling documentation](https://effect.website/docs/v4/scheduling/using-schedules)
   distinguishes live-runtime schedules from durable jobs. This design uses
   Effect for the former and persisted machine States and alarms for the latter.
