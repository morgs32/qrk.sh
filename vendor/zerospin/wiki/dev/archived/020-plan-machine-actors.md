# Machine actors implementation plan

**Date:** 2026-09-28

**Status:** Implemented and verified

**Source:** [Machine actors design](../archived/020-spec-machine-actors.md)

## Scope and completion rule

1. Replace aggregate and service automations with system-registered durable machine actors. The cutover includes declarations, runtime, fanout, command authority, fixtures, tests, and affected documentation. Do not ship a second automation path or compatibility storage decoder.
2. Keep the existing aggregate version registry, ordinary actor and session behavior, source chains, and authoritative command admission. Changed fixed schemas require empty storage.
3. Consider the plan complete only when the machine actor Workerd scenarios, declaration type fixtures, affected consumers, and resolved Nx checks pass and obsolete automation paths are gone.

## Execution sequence

1. **Declaration boundary.** Define a system-level machine declaration in `@zerospin/core` that references a concrete aggregate or service source version. Type its selected models, permitted bound contracts, schema-bearing States, machine callbacks, and application Effect requirements. Add `machines` to `makeSystem` validation, resolved system types, and system specs. Keep package dependencies acyclic: core owns the erased declaration and machine receiver contract; `machine-workers` owns the concrete Repo and imports System Worker primitives; System Worker addresses that Repo only through its Durable Object namespace interface. Export the concrete class at the existing Worker composition boundary in `dev-worker`, which may depend on both packages.
2. **Durable state model.** Replace the `machine-workers` route policy, user-submitted command routes, retry counters, and current operation schema. Persist source pin and cursor, selected projection, current State and revision, absolute wake deadline, operation status and diagnostic, and the frozen outgoing command and outcome. Preserve the inherited alarm registry and Repo facilities. Use an empty-storage cutover for changed fixed tables.
3. **Projection and source receipt.** Build the machine-selected database using the established actor selection/projection code. For each terminal occurrence, atomically apply its projection change, call the current State's `onCommand`, validate an explicit returned State, and advance the source cursor. Treat `undefined` as unchanged. Reject duplicate prefixes and deliveries from an obsolete pin; a handler failure rolls the whole receipt back. Acknowledge fanout after this local durable commit. The existing `executionResultsFanout` targets actor Repo names, so add separate machine subscriber rows and a machine queue bound to the same retained source entries. Reuse `makeFanoutQueue` and `makeFanoutSubscriber`; do not copy their delivery protocol.
4. **Initialization and source changes.** Capture a bounded frontier for first creation, build the projection without historical reactions, call `onBootstrap` once, then consume the suffix normally. On a changed source pin, suspend automatic work, rebuild the disposable projection through a captured frontier, preserve private State and frozen command responsibility, and call `onVersionChange` once. On ordinary restart, catch up unseen occurrences through a captured destination before resuming due work.
5. **State work.** Implement mutually exclusive `wakeAt`/`onWake`, `onActivation`, and `command`/`onResult` forms. Persist waiting deadlines once per state entry. Run asynchronous Effects outside the local gate; interrupt obsolete Fibers and independently reject stale completions. Restart interrupted activations under the same revision with fresh in-process Effect schedules; retain terminal failures without automatic retry. Validate all proposed States before committing a transition.
6. **Outgoing authority and recovery.** Implement one command slot per state revision with identity derived from machine identity and revision. Freeze command bytes, delivery mode, target pin, and identity before dispatch. Route `push` to durable handoff and `execute` to terminal outcome through existing admission and result recovery; apply normal guards and declared authority. Retain outcome/progress so a crash between remote completion and local transition resumes the same logical command. A late outcome never transitions an obsolete state.
7. **System integration and hard cut.** Add aggregate and service machine destinations to the existing fanout queues/subscribers and register machine owner namespace and lifecycle in the System Worker. Remove aggregate/service automation declarations, execution groups, staging, storage, output authority, and related exports/callers in one cutover. Migrate computer-turn and service-work fixtures to machines. Keep unrelated actor/session paths intact.
8. **Behavior and type verification.** Use real Workerd tests with controlled barriers for bootstrap, ordered receipt and rollback, waiting and eviction, invalidation, restart, pin change, push/execute and command recovery. Add focused declaration type fixtures for per-state inference, source/selection/contract compatibility, and exclusive work forms. Reuse existing runtime and fanout coverage; remove automation-only tests whose contract is superseded.
9. **Docs and gates.** Update the glossary, architecture pages, `machine-workers` guidance, and affected source READMEs to describe current code after cutover. Inspect resolved Nx targets for changed projects, run one scoped task graph for typecheck, lint, Node tests and Workerd tests, then check affected consumers. Archive this plan only after implementation and verification are complete.

## Worked examples

These snippets are **illustrative target behavior, not implemented APIs or final type signatures**. The approved spec settles the invariants; implementation should use repository naming and actual contract/result types as they are resolved. In particular, `source`, `selections`, `push`, and `execute` below illustrate roles without locking in a constructor shape.

1. **System registration keeps the source version outside the instance key.** A new deployment can change `computerTurn` from `gameV1` to `gameV2` while addressing the same aggregate machine owner. A different aggregate family addresses a different owner.

   ```ts
   const computerTurn = makeMachine({
     source: gameV1,
     selections: { game: selectedGame },
     contracts: { playO },
     states: { idle: Idle, choosing: Choosing, submitting: Submitting },
     onBootstrap: ({ db }) => Idle.make({ lastObservedGameId: readGameId(db) }),
     routes: computerTurnRoutes,
   });

   const system = makeSystem({
     name: 'ticTacToe',
     aggregates: { game: { '1.0.0': gameV1 } },
     services: {},
     machines: { computerTurn },
     layer: computerMoveLayer,
   });

   // Owner identity: (systemId, 'game', aggregateId, 'computerTurn').
   // Source pin: gameV1.version, stored separately from that identity.
   ```

2. **Private State stores accepted inputs, while the selected database stays disposable.** A preparation attempt captures the attendees and event revision it accepted. The projection can continue changing while that Effect runs.

   ```ts
   const Preparing = makeState({
     stateName: 'preparing',
     input: {
       eventId: Schema.String,
       eventRevision: Schema.Int,
       attendees: Schema.Array(Schema.String),
     },
   });

   // Projection: complete selected event and attendee rows, rebuilt from source.
   // State: the particular event revision and recipients accepted for this work.
   const next = Preparing.make({
     eventId: event.id,
     eventRevision: event.revision,
     attendees: event.attendeeIds,
   });
   ```

3. **Unchanged and re-entered are distinct decisions.** An unrelated edit advances the consumed source position and projection, but leaves the timer and State revision intact. An edit that moves the meeting enters a new `waiting` instance even though its name is unchanged.

   ```ts
   onCommand({ origin, db, command }) {
     const event = readSelectedEvent(db, origin.eventId);
     if (isUnrelated(command, event)) return undefined;
     if (event.cancelled) return Cancelled.make({ eventId: event.id });
     if (event.startAt !== origin.startAt) {
       return Waiting.make({ eventId: event.id, startAt: event.startAt });
     }
     return undefined;
   }

   // undefined: keep revision 12 and its persisted wake deadline.
   // Waiting.make(...): enter revision 13 and compute a fresh wake deadline.
   ```

4. **A waiting State owns one absolute deadline.** The deadline is computed on entry, persisted, and recovered from storage after eviction. `onWake` reads current selected data before committing the next State.

   ```ts
   waiting: {
     wakeAt: ({ origin }) => origin.startAt - 30 * 60_000,
     onWake: ({ origin, db }) => {
       const event = readSelectedEvent(db, origin.eventId);
       if (event.cancelled) return Cancelled.make({ eventId: origin.eventId });
       return Preparing.make({
         eventId: event.id,
         eventRevision: event.revision,
         attendees: event.attendeeIds,
       });
     },
     onCommand: reactToEventChange,
   },
   ```

5. **Preparation may retry in process; the State is the durable unit.** A restart begins the Effect again under the same State revision. The authored Effect can recover an expected failure into an explicit State, while an unhandled failure leaves a recorded failed operation for inspection.

   ```ts
   preparing: {
     onCommand: reactToAttendeeChange,
     onActivation: ({ origin }) =>
       prepareBriefing(origin).pipe(
         Effect.retry(transientRequestSchedule),
         Effect.map(briefing =>
           ReadyToSend.make({
             eventId: origin.eventId,
             attendees: origin.attendees,
             briefing,
           }),
         ),
         Effect.catchTag('NoBriefingAvailable', () =>
           Effect.succeed(BriefingUnavailable.make({
             eventId: origin.eventId,
           })),
         ),
       ),
   },
   ```

6. **A changed input invalidates an old preparation before publication.** Use a controlled barrier in a Workerd test to hold the old Effect. Consuming the attendee change enters a replacement State and revision. Releasing the old barrier afterward must produce no committed briefing and no outgoing command from that attempt.

   ```text
   revision 7: Preparing([Ada]) ───── external work pending ─────┐
                 attendee change consumed                        │
   revision 8: Preparing([Ada, Bo]) ── new work starts            │
                 old work resolves ◀───────────────────────────────┘
                 commit guard sees 7 != 8; discard old result
   ```

7. **The commitment boundary is a State entry.** Entering `sending` freezes the email and application delivery key. A later attendee change does not silently edit the already committed request. The provider may deduplicate repeated calls using that key.

   ```ts
   const Sending = makeState({
     stateName: 'sending',
     input: {
       recipients: Schema.Array(Schema.String),
       subject: Schema.String,
       body: Schema.String,
       deliveryKey: Schema.String,
     },
   });

   sending: {
     onActivation: ({ origin }) =>
       sendEmail({
         to: origin.recipients,
         subject: origin.subject,
         body: origin.body,
         idempotencyKey: origin.deliveryKey,
       }).pipe(Effect.as(Sent.make({ deliveryKey: origin.deliveryKey }))),
   },
   ```

8. **One command State describes one outgoing command.** `push` supplies a durable handoff receipt; `execute` supplies a terminal outcome, including a domain failure. `onResult` chooses a following State. A second dependent command requires that following State, not a second call in the same callback.

   ```ts
   submitting: {
     command: ({ origin }) =>
       execute({
         contract: playO,
         target: { aggregateName: 'game', aggregateId: origin.gameId },
         payload: { id: origin.gameId, square: origin.square },
       }),
     onResult: ({ origin, result }) =>
       terminalSucceeded(result)
         ? Idle.make({ lastObservedGameId: origin.gameId })
         : Rejected.make({ gameId: origin.gameId, failure: failureOf(result) }),
   },

   notifying: {
     command: ({ origin }) => push(origin.notification),
     onResult: ({ origin, result }) =>
       HandedOff.make({ requestId: origin.requestId, receipt: result }),
   },
   ```

9. **Freeze the command before calling another owner.** The retained slot uses the machine identity and State revision. A crash after remote completion must recover the same bytes and identity; re-running `command({ origin })` could invent different bytes and is therefore not a recovery path.

   ```text
   local transaction:  state revision 21
                       → command slot 21 { id, mode, targetPin, encodedCommand }
   remote step:        submit frozen command under id
                       → durable handoff or terminal result
   local transaction:  retain outcome and enter revision 22 via onResult

   crash between steps: recover slot 21; query/retry its existing logical id.
   state changed before result: retain delivery responsibility; reject stale transition.
   ```

10. **A source receipt has one local commit boundary.** The callback sees the projection after the occurrence has been applied. No Effect, future alarm, provider call, or outgoing command is awaited while acknowledging the incoming fanout page.

    ```ts
    // Pseudocode for one occurrence; the whole block commits or rolls back.
    transaction(() => {
      assertCurrentSourcePin(occurrence.source);
      if (occurrence.index <= storedCursor) return; // committed redelivery
      assertNextIndex(occurrence.index, storedCursor);
      applySelectedProjection(occurrence);
      const decision = currentRoute.onCommand?.({
        origin: currentState,
        db: selectedDb,
        command: occurrence,
      });
      if (decision !== undefined) enterValidatedState(decision);
      setSourceCursor(occurrence.index);
    });
    // Only now acknowledge the source fanout delivery.
    ```

11. **Bootstrap, restart, and pin change take different paths.** Each catch-up uses a captured destination so a busy source cannot keep initialization open indefinitely.

    ```mermaid
    flowchart TD
      A[Open machine owner] --> B{Persisted State?}
      B -- No --> C[Capture source frontier]
      C --> D[Build projection through frontier]
      D --> E[Run onBootstrap once]
      B -- Yes, same pin --> F[Catch up unseen suffix through captured position]
      B -- Yes, new pin --> G[Suspend automatic work and rebuild projection]
      G --> H[Run onVersionChange once]
      E --> I[Subscribe from committed cursor]
      F --> I
      H --> I
      I --> J[Resume due State work]
    ```

12. **The fanout queue and machine owner remain separate responsibilities.** The source chain retains ordered terminal occurrences and delivery diagnostics. The machine commits selected rows, its State decision, and its cursor locally. Source acknowledgement follows that commit; slow preparation never holds the source queue.

    ```mermaid
    sequenceDiagram
      participant Chain as Source version chain
      participant Fanout as Machine fanout queue
      participant Owner as Machine owner DO
      participant External as External service
      Chain->>Fanout: Terminal occurrence, including failure/no-op
      Fanout->>Owner: Deliver ordered page
      Owner->>Owner: Apply projection + onCommand + cursor atomically
      Owner-->>Fanout: Acknowledge local commit
      Owner->>External: Run current activation or command separately
      External-->>Owner: Result
      Owner->>Owner: Commit only if revision is still current
    ```

13. **Test the observable edge, not just the callback.** A real Workerd fixture should retain a source history, open the owner, and inspect its State and emitted command after source delivery, alarm advancement, or eviction. A controlled barrier makes the stale-result assertion deterministic.

    ```ts
    // Test outline, not a test helper API.
    await appendTerminalOccurrence({ index: 8, status: 'failed' });
    await waitForMachineCursor(8);
    expect(await readMachineRevision()).toBe(3); // unchanged decision

    await holdPreparationAtBarrier();
    await appendTerminalOccurrence({ index: 9, attendees: ['Ada', 'Bo'] });
    await waitForMachineCursor(9);
    await releaseOldPreparation();
    expect(await readOutgoingCommandsFromOldRevision()).toEqual([]);
    ```

14. **A service machine has the same lifecycle without an aggregate ID.** Its source is one service-version chain; the registry key identifies the service machine instance for that family. It can still issue a declared command to a bound aggregate or service target.

    ```ts
    const fulfillmentFollowUp = makeMachine({
      source: fulfillmentServiceV1,
      selections: { fulfillment: selectedFulfillments },
      contracts: { recordFulfillmentResult },
      states: { idle: Idle, checking: Checking, reporting: Reporting },
      onBootstrap: ({ db }) =>
        Idle.make({ lastKnownIndex: readSelectedServiceIndex(db) }),
      routes: fulfillmentRoutes,
    });

    makeSystem({
      name: 'shop',
      aggregates: { shopper: { '1.0.0': shopperV1 } },
      services: { fulfillment: fulfillmentService },
      machines: { fulfillmentFollowUp },
    });

    // Owner identity: (systemId, 'fulfillment', 'fulfillmentFollowUp').
    // The source service version is configuration, not another owner key.
    ```

15. **A pin change is a projection rebuild, not a private-State reset.** Returning `undefined` from `onVersionChange` keeps the current State revision and deadline; returning a State intentionally re-enters work. An old-pin delivery arriving afterward must be rejected before it touches rows or cursor.

    ```ts
    onVersionChange({ origin, db, previousVersion, version }) {
      const current = readSelectedEvent(db, origin.eventId);
      if (current && stillMatchesAcceptedWork(current, origin)) {
        return undefined; // keep the persisted deadline or running revision
      }
      return current
        ? Waiting.make({ eventId: current.id, startAt: current.startAt })
        : Cancelled.make({ eventId: origin.eventId });
    }

    // Rebuild through a captured frontier; suppress historical onCommand calls.
    // Commit the new pin, projection, cursor, and reconciliation together.
    // Retain any frozen outgoing command slot from the previous State.
    ```

16. **A failed operation stays failed until a new State instance is entered.** Recovery neither increments a persisted retry counter nor silently invokes `onActivation` again. A later relevant occurrence may explicitly create a new revision, which can start new work.

    ```text
    revision 4, onActivation: pending → running → failed(diagnostic)
    Durable Object eviction and reopen: revision 4 remains failed
    unrelated source occurrence: cursor advances; revision 4 remains failed
    relevant source occurrence: onCommand enters revision 5
    revision 5, onActivation: pending → running
    ```

## Current source constraints

1. `machine-workers` currently imports `system-worker/makeMigratableDORepo` and `makeAlarmRegistry` through that base, so a direct System Worker import of its runtime would create a cycle.
2. The existing machine runtime has `activationPolicy`, named user-submitted command routes, and persisted retry counters. Its operation model does not yet have domain projection, source progress, waiting States, outgoing contract commands, or source fanout.
3. Aggregate automation execution lives in `AggregateActorVersionRepo/automations`; service automation execution lives in `ServiceActorVersionRepo/automations`. Their output staging reaches the chains. The new machine owner needs a distinct source subscription while those automation-only paths are removed.
