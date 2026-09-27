# Aggregate-owned autonomous and state-machine actors

**Date:** 2026-09-23
**Status:** Archived at the maintainer’s request on 2026-09-23; implementation present, acceptance verification deferred.

**Historical note:** [Plan 013](./013-plan-state-machine-modules.md) supersedes the state-machine module ownership and activation design below. The steps here describe the earlier proposal, not the supported declaration API.

See the [implementation plan](./006-plan-autonomous-and-state-machine-actors.md#archive-checkpoint--2026-09-23) for the archive checkpoint and [TODOS.md](../../../TODOS.md#plans-005006007--deferred-acceptance-verification) for outstanding verification.

## Problem Statement

Zerospin's authored actors currently depend on browser-capable authentication
and externally driven execution. Applications need server-owned actors that
continue working with every browser closed. Simple autonomous decisions and
durable multi-step workflows need different authored interfaces while sharing
activation, command delivery, and recovery infrastructure.

Shopping currently separates customer purchase creation from payment initiation
and relies on manual payment and promotion operators. Its existing promotion
reservation prerequisite does not by itself close the gap between creating a
purchase and committing the reservation in another owner.

## Solution

1. Add `makeAutonomousActor` for an authored autonomous program. Demonstrate it
   with a new Tic-Tac-Toe example alongside Shopping.
2. Add `makeStateMachineActor` for an authored E Pluribus Machina machine.
   Demonstrate it with Shopping's complete checkout, promotion, and payment
   workflow. This name replaces the proposed `makeSagaActor`; do not introduce
   an alias or a second step-function language.
3. Register both kinds under their owning aggregate. The game aggregate owns
   its opponent actor; the shopper aggregate owns its checkout actor, with
   separate durable machine instances for checkout workflows. Cross-owner
   commands do not transfer ownership of the destination's resources.
4. Zerospin supplies durable activation, state/input recovery, command delivery,
   and deadline wake-ups. Application authors supply the program or machine and
   its permitted reads and commands. Persisted work determines what remains;
   notifications only prompt reconciliation.

## User Stories

1. As an actor author, I can register a server-owned actor with an aggregate
   without requiring an open browser or browser authentication handshake.
2. As an autonomous-program author, I can react to selected aggregate state and
   issue authorized commands without implementing subscription and restart loops.
3. As a machine author, I can use E Pluribus Machina states and routes, wait for
   relevant changes or a deadline, and resume persisted state after interruption.
4. As a Tic-Tac-Toe player, I play X first against an O actor that randomly
   chooses legal moves, takes only its own turns, and stops at a win or draw.
5. As a shopper, I can apply a promotion and see its reservation confirmed before
   confirming a discounted checkout. Expiration does not silently renew it.
6. As a shopper, confirming checkout commits me to paying the accepted quote.
   I do not perform a second action to start its first payment.
7. As a shopper, a declined payment leaves my purchase and committed promotion
   available for explicit retry, or I can cancel the purchase.
8. As a shopper, I cannot cancel a payment intent or cancel a purchase while an
   intent is active, including when its outcome is uncertain.
9. As an operator, I can restart execution without losing an accepted checkout,
   changing a saved random payment outcome, or creating a second active intent.

## Implementation Decisions

### Authored interfaces and ownership

1. The two factories create aggregate-owned server actor declarations compatible
   with the aggregate's actor registry. Preserve the existing versioned model,
   selection, contract, guard, and execution-layer concepts; add the execution
   form appropriate to each factory. Do not introduce a system-level actor registry.
2. `makeAutonomousActor` accepts an Effect program. `makeStateMachineActor`
   accepts an E Pluribus Machina machine definition, with instance construction
   able to supply the persisted initial state. Use that library's existing
   schema-backed states, routes, activation programs, and save hook rather than
   copying its runtime or inventing a parallel machine DSL.
3. Runtime identity is server-owned and scoped by the system, aggregate,
   versioned actor, and durable instance identity. A game has its own opponent
   execution; checkout workflows have independent machine state. Restarting
   reuses identity and storage rather than creating another instance.
4. Actor authority comes from the authored server actor and its permitted
   commands. Customer inputs retain customer authorization. Server execution
   must not impersonate a browser operator, require a browser session, or gain
   unrestricted cross-owner mutation access.
5. The checkout actor may invoke promotion-service contracts. The promotion
   service remains authoritative for capacity, reservation validity, commitment,
   release, and redemption; the shopper aggregate owns purchases and payment
   intents. Coordinate with commands and observations, not direct cross-owner
   database writes or a transaction spanning owners.

### Persistence, delivery, and time

1. Durably accept triggering inputs before acknowledging them. Discover pending
   work after activation or missed notifications; do not depend on an in-memory
   callback, browser connection, or one successful broadcast.
2. Serialize execution for an instance. Authoritative contracts still validate
   current state because actor reads and external command execution are not a
   shared transaction. Duplicate wake-ups must not become additional game turns,
   purchases, or payment requests.
3. Integrate E Pluribus Machina's `save({ origin, destination })` before publishing
   and activating a destination. Restore the stored state when constructing the
   machine. A failed save must not activate the destination or permit subsequent
   external actions from it.
4. Persist an operation's identity and retry-relevant input before delivering it.
   Keep them stable through lost responses and restarts. Reconcile the
   destination's durable result when an external command may have succeeded
   before the local transition was saved. A machine save does not provide atomic
   commit across owners or exactly-once external execution.
5. A machine can wait for a relevant change or a durable absolute deadline. On
   restart, restore the wake-up or process it immediately if overdue. Reconcile
   current state after waking; a stale deadline cannot release an already
   committed promotion.
6. Use the common Repo activation and alarm infrastructure. Persist deadlines,
   not countdowns; do not add a separate expiry actor or private alarm dispatcher.
   Correctness must survive delayed alarms. No automatic reservation renewal.

### Shopping checkout and promotion lifecycle

1. Use only the state-machine actor for Shopping payment orchestration, with and
   without promotions. The autonomous actor example is Tic-Tac-Toe.
2. Applying a promotion starts the promoted checkout workflow. It requests a
   reservation, records the authoritative confirmation, and waits for customer
   checkout confirmation. A denied, removed, or expired reservation does not
   authorize discounted payment. The customer must apply again or explicitly
   choose checkout without the promotion; never silently change the price.
3. A checkout without a promotion starts its workflow at customer confirmation
   and skips the promotion steps.
4. Checkout confirmation durably records the accepted quote and checkout
   identity, allocating the eventual purchase ID before external commitment.
   Validate ownership, items, prices, and any required reservation at this point.
   Freeze the accepted checkout against cart edits or a competing checkout so
   recovery does not reconstruct it from subsequently changed cart contents.
5. For a promoted checkout, commit the reservation to the allocated purchase ID
   before creating the purchase. The promotion commitment must support this
   ordering even though the purchase row does not exist yet. If commitment fails,
   do not create a purchase or initiate payment; expose the checkout failure so
   the customer can make a new explicit choice.
6. After commitment, or immediately for an unpromoted checkout, create the
   purchase, frozen purchase items, and first payment intent atomically in the
   shopper aggregate. Creation means committed intent to pay. A replay uses the
   same IDs and accepted quote; it does not create another purchase or intent.
   A crash after promotion commitment resumes creation of that same purchase.
7. The state machine owns this ordering. Replace the current customer-driven
   purchase-then-payment path; a browser cannot independently bypass the workflow
   to create a discounted purchase before commitment.
8. Uncommitted reservations retain their existing expiry. The promotion service
   must reject commitment after expiry and exclude expired reservations from
   capacity even if cleanup or workflow wake-up is delayed. Waiting machines
   reconcile expiry and stop waiting on that reservation; no automatic renewal.
9. A payment decline leaves the promotion committed to the unpaid purchase.
   Explicit payment retry reuses that commitment. Customer cancellation, allowed
   only with no active intent and before payment success, leads the machine to
   release the commitment. Retry interrupted release until reconciled.
10. Payment success marks the purchase paid. The machine then redeems any
    committed promotion, resuming interrupted redemption without charging again
    or reverting the paid purchase. Promotion redemption is part of this
    workflow; goods fulfillment is not.

### Payment intent and simulation

1. A purchase owns its frozen items, currency, and total. A separate
   `paymentIntent` belongs to it and owns a payment request's identity, progress,
   provider reference when present, and failure information. Keep the internal
   intent ID distinct from a provider ID. Every purchase has at least one intent;
   retain historical intents and allow at most one active intent per purchase.
2. `initiatePayment` creates an intent. Initial initiation is included in the
   atomic purchase creation. After a confirmed decline, explicit customer retry
   initiates a new intent. Restart, delivery retry, and duplicate wake-up resume
   the existing intent and never constitute customer retry.
3. Pending, executing, and uncertain payment work remains active. Uncertainty
   blocks another intent and purchase cancellation until resolved. Customers
   cannot cancel a payment intent. A terminal declined intent permits purchase
   cancellation or explicit retry; a paid purchase cannot start another payment.
4. Observations identify their exact payment intent. Apply them idempotently
   and validate transitions against that intent and purchase. A delayed or
   conflicting observation cannot silently settle a different intent or reopen
   a terminal one.
5. The simulator's Effect program randomly chooses success or decline with equal
   probability. Randomness runs outside deterministic contract programs. Tests
   provide deterministic outcomes through the program's dependency seam.
6. Save an outcome-chosen machine state containing the intent identity and
   chosen outcome before delivering the payment observation. A useful sequence
   is `ChooseOutcome → OutcomeChosen → RecordOutcome`. Every delivery retry
   uses the saved choice. A crash before saving a choice has no delivered result;
   a crash after saving must never reroll it.
7. A confirmed decline resolves the intent as declined and leaves the purchase
   unpaid. Success resolves the intent as succeeded and marks the purchase paid
   in the same aggregate operation, preserving the successful checkout's cart
   cleanup. Program or transport failure is not a simulated decline: it leaves
   unresolved work for recovery.
8. Keep simulated payment execution restricted to development, matching the
   example's existing simulator restriction. Do not implement a real payment
   provider or imply separate authorization and capture phases in this example.

### Tic-Tac-Toe example

1. Add `examples/tic-tac-toe` beside Shopping, using the repository's example
   and Nx conventions. Provide a small playable board and a way to start a new
   game; no opponent-strength settings or multiplayer matchmaking.
2. The human plays X first. The aggregate-owned autonomous actor plays O by
   randomly selecting a legal empty square only when an unfinished game is on
   O's turn. The authoritative move contract validates turn, square, and game
   completion; wins and draws prevent further moves.
3. Trigger from persisted game state and resume O's outstanding turn after a
   restart with all browsers closed. Retried delivery preserves the selected
   move and operation identity. A new game uses a new game identity so old work
   cannot affect it.

### Cutover and documentation

1. Hard-cut the in-scope Shopping UI, contracts, actors, tests, and documentation
   to the machine-owned workflow and payment-intent model. Remove superseded
   manual payment/promotion execution paths; do not retain a parallel operator
   route to make the old workflow work.
2. Reuse E Pluribus Machina from its maintained source. Its local Core package
   currently includes the required save hook; verify dependency compatibility
   and packaging in implementation planning. The Visualizer is not required.
3. Preserve unrelated WIP. Changed fixed schemas require empty storage at
   cutover; add no row translations, compatibility decoders, or aliases. This
   specification does not authorize deleting existing databases.
4. Keep affected actor, runtime lifecycle, and example documentation current
   when implementation lands. This document describes intended behavior, not
   an implementation already present in the repository.

## Testing Decisions

1. Test authored factories and their observable runtime behavior as the primary
   seam. Use existing command/contract integration and Workerd storage tests for
   authoritative behavior and cold activation. Avoid production-only test hooks
   or a second runtime built for tests.
2. Typecheck both factory results in aggregate registries, their selected models
   and permitted contracts, Effect requirements, and machine state/route inference.
   Verify server-only execution and customer-versus-actor authorization.
3. Test durable start, duplicate notifications, missed wake-ups, independent
   instances, cold restart, pending delivery, and stale state at command execution.
   Assert outcomes and resource state rather than private scheduling details.
4. Test machine save failure before next activation, crash after save, and crash
   after remote success but before local acknowledgement. Resume the same command
   and state without duplicate business effects. E Pluribus Machina's existing
   save-hook tests are prior art; test Zerospin's integration rather than copying
   the library's internal test suite.
5. Test promotion reservation success, denial, removal, and expiry; no automatic
   renewal; delayed/duplicate alarms; and the expiry-versus-commit race. A valid
   commitment survives the old deadline. Expiry before commitment prevents
   purchase creation and payment.
6. Test no-promotion checkout, accepted quote freezing, commitment before
   purchase creation, interrupted commitment recovery, and atomic purchase/items/
   first-intent creation. Reject conflicting IDs or changed accepted input.
7. Test both payment outcomes deterministically, saved outcome delivery retries,
   execution failure without decline, uncertain intent blocking, repeated
   customer retry commands, one active intent, historical intent retention,
   conflicting or delayed observations, and atomic intent-success/purchase-paid.
8. Test declined payment with its promotion retained, customer cancellation with
   release recovery, and paid purchase with redemption recovery. No retry of those
   orchestration steps may initiate another payment or alter the accepted price.
9. Test Tic-Tac-Toe legal moves, human-first ordering, actor-only turns, wins,
   draws, stale moves, duplicate wake-ups, restart during an O turn, and isolation
   between games. Use deterministic random choices for assertions.
10. Exercise the user journeys through the example UIs, including browser closure
    while work is pending and reopening to see the resolved state. Run the actual
    affected Nx typecheck, test, lint, and build targets after implementation;
    discover their configured names rather than guessing them.

## Out of Scope

1. Goods fulfillment, refunds, separate authorization/capture, and real payment
   provider integration.
2. Automatic payment retry after decline, automatic promotion renewal, customer
   payment-intent cancellation, or purchase cancellation while an intent is active.
3. A generic compensation language, cross-owner atomic transactions, or a claim
   of exactly-once external execution.
4. A new system-level actor registry, a separate expiry/countdown actor, the
   E Pluribus Machina Visualizer, and Tic-Tac-Toe matchmaking or strategic AI.

## Further Notes

1. Factory names, aggregate ownership, E Pluribus Machina reuse, example roles,
   checkout ordering, payment rules, and alarm ownership were agreed in chat.
   The earlier idea of a payment-only autonomous actor and a separate saga actor
   has been superseded by this design.
2. Low-level factory type spelling, physical Repo/schema placement, dependency
   packaging, and generator selection belong in the implementation plan; this
   spec fixes the authored capabilities and observable guarantees they must meet.
3. No implementation plan or implementation changes are included with this spec.
