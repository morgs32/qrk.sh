# Aggregate-hosted state machines

> Historical: superseded by [Plan 013](../archived/013-plan-state-machine-modules.md). Domain factories return plain model, contract, and automation bundles; AAVR and SAVR own automation execution.

**Date:** 2026-09-26
**Status:** Implemented

The declaration and ownership decisions below are superseded by
[Spec 013: State-machine modules](../archived/013-spec-state-machine-modules.md). Activation,
transaction, recovery, and delivery behavior remains the foundation.

## Problem Statement

Actor listeners scatter lifecycle rules across contracts, guards, selected
queries, and asynchronous programs. Their persistence also copies triggering
commands into reaction records and treats returned commands as separate listener
outputs. Understanding one lifecycle requires reconstructing those relationships.

Applications need one declaration that explains which commands are permitted in
each state and what automatically happens on state entry. That declaration must
preserve ordinary contracts, normalized models, relationships, and atomic
multi-model mutations. Protecting state only through an optional contract guard
would allow other contracts to bypass the machine's rules.

## Solution

1. Introduce `makeStateMachine` declarations registered under an aggregate's
   `machines`. A machine is a behavior module hosted by an existing owner. The
   aggregate retains authoritative storage, command ordering, and transactions.
2. Designate an existing ordinary model and one of its enum columns. Each model
   row is an independent machine instance; enum values identify named states.
3. Register ordinary contracts as machine routes. The aggregate enforces the
   machine's rules for every attempted write to its designated state model.
4. Add a state-entry mutation that participates in a contract's existing atomic
   work. Entry, including re-entry into the same named state, can schedule a
   durable activation after commit.
5. Keep machine-related selection queries together as named views that actors
   bind to identity and activations bind to their instance.
6. Replace existing listener usage. Demonstrate the design in tic-tac-toe and
   focused fixtures without migrating Shopping's production checkout workflow.

## User Stories

1. As a machine author, I can designate a game or purchase model as machine
   state without creating another row that mirrors its lifecycle.
2. As a contract author, I can change related models and enter machine state in
   one command, with all changes and activation enrollment committed atomically.
3. As a machine author, I can restrict writes to prescribed commands in permitted
   states, including writes attempted by ordinary contracts defined elsewhere.
4. As an actor author, I can bind a machine-defined view to my actor identity
   without repeating its relationship and selection rules.
5. As a player, I can choose X or O. X starts, and choosing O causes the computer
   to make the opening move without another human command.
6. As a player, I cannot play out of turn, on an occupied square, against a stale
   board, or after the game has ended.
7. As a machine author, I can re-enter `playing` after a move. Its activation
   submits a computer move when appropriate or returns nothing while waiting
   for the human. Returning nothing does not itself create another entry.
8. As an application author, I can commit later commands while asynchronous
   activation work runs, without changing that activation's captured input.
9. As an operator, I can recover pending work and retry saved commands without
   rerunning completed or interrupted activation programs.
10. As a client, I receive the permitted command projection while the server
    retains the complete command and internal activation information.

## Implementation Decisions

### Declaration and ownership

1. Register machines on the aggregate alongside its models and actors. Do not
   introduce another owner kind, a machine-owned database, or a synthetic actor
   for automatic behavior.
2. A machine declaration identifies its state model, enum column, creation
   contracts, state routes, activation programs, and named query views. Its
   definition is versioned with its aggregate; contracts and models retain their
   existing versions.
3. A designated model belongs to one machine within an aggregate version. Each
   row is one instance. Other associated models remain ordinary models unless
   separately designated as another machine's state model.
4. State names come directly from the designated enum column. Other fields and
   related rows remain normal business data. Do not duplicate that information
   in a separate machine-state object.
5. Actors remain independently registered and expose permitted contracts through
   the existing access mechanism. Associating a machine view with an actor does
   not grant access to every machine command or model row.

### Contracts, mutations, and authoritative enforcement

1. Contracts remain ordinary Zerospin declarations with their own model
   dependencies, payloads, guards, and mutation programs. A contract does not
   need a special factory to receive machine protection: registering the machine
   on the aggregate installs enforcement.
2. Programs continue returning mutations. One command can create a purchase,
   create its related items, and enter machine state atomically. No separate
   activation command or client round trip is required.
3. An entry mutation identifies the machine instance and destination state. It
   expresses intent to enter or re-enter; producing the mutation does not grant
   permission to perform the transition.
4. Protect the entire designated state row. Every authoritative command that
   attempts creation, update, or deletion is checked against the machine's
   permitted contracts and routes. Ordinary mutation operations cannot bypass
   this protection.
5. Inside the command savepoint, validate route eligibility against authoritative
   state, caller authority, and authored guards. Commit accepted resource
   mutations, entries, and captured activation inputs together. Any rejection
   rolls back the complete command, including changes to associated models.
6. A declared creation contract establishes the initial state and its first
   entry. Later changes to the discriminator require an entry mutation. An
   authorized update to other fields does not automatically create an entry.
   Allow one entry per instance per command.
7. Machine entry is distinct from changing the enum value: entering `playing`
   from `playing` creates a new entry. Re-delivery of the same committed command
   does not create another entry.
8. Integrate machine enforcement with the existing authoritative execution path.
   Do not add a general-purpose aggregate-wide guard framework as part of this
   change. Preserve ordinary actor staging and optimism; authoritative checks
   remain mandatory regardless of earlier validation.

### Views and activation inputs

1. A machine exposes named sets of explicitly authored Drizzle selection queries.
   Actors bind a selected view's parameters to their identity. Different actors
   may choose different views, such as a player view and a spectator view.
2. Validate model compatibility and required parameter bindings. Do not infer
   visibility by traversing every foreign key. Behavioral tests establish that
   the queries select the intended rows and related data.
3. Activation programs select a machine-defined view bound to the instance.
   Machine execution is independent of any human actor's selected replica,
   optimistic state, browser connection, or session lifetime.
4. Capture the resulting state row and the activation's declared read view after
   the command's mutations, within the committing transaction. Retain that input
   for delayed execution and restart. Later commits must not change it.
5. Each committed entry with automatic behavior retains its own activation input.
   Newer entries do not supersede queued activations. An activation observes its
   captured view rather than reading a newer live graph.
6. Route guards and activation programs receive the full model row, with its
   designated state field typed to that route's value. The worker validates a
   saved activation row against the model schema and its saved instance and state
   before invoking the program; machine authors do not decode state again.

### Activation execution and recovery

1. Run activation programs outside the command transaction. Process activations
   serially per instance; independent instances may progress concurrently.
   Commands may continue committing while an activation runs.
2. An activation returns one permitted same-aggregate command or `null`. It does
   not directly mutate authoritative model state. An output command must pass
   authoritative validation when it executes.
3. Output commands carry verified machine-instance and activation provenance,
   without impersonating a human actor or borrowing browser claims. Verify their
   originating entry is still current for that instance. Authored guards also
   protect assumptions about related data and payloads.
4. An accepted entry does not pre-authorize its eventual output. A delayed
   computer move can be rejected after the game changes, even though its
   activation legitimately ran against the earlier captured board.
5. Save the activation result before submitting its command. Preserve command
   identity and content through delivery retries. Explicit `null`, program
   failure, and interruption are durable outcomes.
6. Recover pending activations using their captured input. Persist a started
   marker before invoking a program. After restart, a started activation without
   a saved result becomes `interrupted`; do not automatically invoke it again.
7. Retry delivery of saved commands without recomputing their programs. Domain
   rejection remains a recorded outcome rather than a reason to run the
   activation again. Reuse existing durable alarm and delivery infrastructure.

### Command storage and client delivery

1. Retain complete commands in server-side command storage. Support saved,
   unsubmitted activation commands and their subsequent lifecycle results.
2. Activation records reference their triggering and output commands. Delete
   duplicated triggering-command fields and the separate listener-output storage
   concept. Preserve command records for as long as activation references need
   them; outbox acknowledgement cannot remove required history.
3. Captured model views are activation inputs with their own purpose and
   lifetime. They do not justify copying command payloads into activation rows.
4. Thin commands at client delivery through an explicit projection, including
   live WebSocket delivery and replay. Keep original command provenance distinct
   from recipient-specific delivery metadata. Do not expose internal activation
   inputs or machine provenance by spreading retained rows into client messages.

### Tic-tac-toe

1. Keep the game model as the state model and use its existing `outcome` enum.
   `playing` has command and activation routes; `X`, `O`, and `draw` are terminal
   outcomes. Retain `board` and `turn`, and add the player's selected mark.
2. `createGame` accepts the player's X/O choice and creates an empty board with X
   to move. Its initial entry schedules automatic behavior when the computer
   controls X.
3. Replace separate X/O move behavior with one `play` contract. Validate the
   expected board, legal square, current turn, and submitting participant. A
   human controls the selected mark; the machine controls the other mark.
4. A successful move updates the board and next turn and enters the resulting
   outcome in the same transaction. Entering `playing` again creates a new
   activation; entering a terminal outcome stops automatic moves.
5. The `playing` activation submits a computer move only when appropriate and
   otherwise returns `null`. Keep move selection injectable for deterministic
   tests. Completion is part of `play`; no separate finishing command is needed.

## Testing Decisions

1. Prefer the existing authoritative execution and real worker integration seams.
   Test observable command results, model state, activations, and delivery rather
   than duplicating the generated guards' implementation in unit tests.
2. Add declaration typechecks for designated model/enum compatibility, route
   contracts, view parameters, and permitted activation outputs.
3. Test a multi-model checkout fixture with related rows and foreign keys.
   Success commits every mutation and the captured activation together; guard or
   referential-integrity failure leaves none committed.
4. Attempt creation, update, deletion, and discriminator overwrite through an
   unrelated ordinary contract, including an authoritative path that bypasses
   actor staging. Verify rejection. Also reject a registered contract from an
   invalid origin state.
5. Verify initial entry, same-state re-entry, distinct instance histories,
   duplicate command delivery, and authorized non-entry field updates. Only the
   intended entries create activations.
6. Use deterministic barriers to commit later commands while an activation runs.
   Assert unchanged captured inputs, independent progress, and rejection of stale
   output commands. Do not use sleeps as ordering evidence.
7. Inject restart or failure around pending work, start persistence, program
   execution, result persistence, and uncertain submission. Cover saved `null`,
   failures, interrupted programs, and saved commands. Assert invocation counts
   and stable command identity.
8. Verify actor-view identity isolation, related-row inclusion, and model/binding
   validation. Exercise complete retained commands through explicit client
   projections for live delivery and replay.
9. Exercise tic-tac-toe for both human mark choices, computer opening, alternating
   turns, stale and invalid moves, human waiting, wins, draws, and no moves after
   completion. Use an injected deterministic move chooser.
10. Adapt the existing listener Node and workerd coverage, authoritative command
    transaction tests, and delivery/recovery fixtures to the new behavior. Remove
    superseded listener-only assertions rather than retaining a compatibility
    test lane. Verify with scoped Nx tasks during implementation.

## Out of Scope

1. A new owner kind, independent machine databases, synthetic computer actors,
   service-hosted machines, and cross-owner orchestration.
2. Migrating Shopping's actual purchase/payment workflow. Its normalized models
   motivate the design and focused fixture only.
3. Timers, deadlines, multiple output commands per activation, automatic retries
   of interrupted programs, and exactly-once external side effects.
4. A generic global-guard framework, automatic foreign-key visibility inference,
   or a second state-machine runtime copied from E Pluribus Machina.
5. Compatibility aliases, dual listener/machine paths, translation migrations,
   automatic storage deletion, and unrelated repository cleanup.

## Further Notes

1. This document specifies intended behavior; it does not claim implementation
   or verification. E Pluribus Machina supplies useful state, route, and activation
   vocabulary. Zerospin retains its own contracts and atomic model mutations.
2. On implementation, this design supersedes the listener declaration and
   persistence design in [Spec 008](008-spec-durable-actor-listeners.md) and the
   listener-specific scheduling and gate in
   [Plan 011](../plans/011-plan-actor-staging-and-gated-listener-execution.md).
   Preserve the ordinary actor staging and optimism established there. Keep
   affected architecture, glossary, and lifecycle documentation current with the
   completed implementation.
3. Follow the pre-release hard cutover policy. Changed fixed schemas require
   empty storage; do not preserve deprecated rows through compatibility code.
4. Preserve unrelated working-tree changes. Create an implementation plan only
   when requested, reusing number `012` and this topic. Archive this spec only
   once that plan exists.
