# Aggregate actors

Browser actors use `makeAggregateActorVersion` and register under an aggregate's
`actors`. Each version declares its actor database, identity schema and explicit authentication policy,
queries, contracts, optional authorization, and guards. Contracts must use
models from the actor database and accept its identity shape.
Construction validates the declaration, then retains the original typed
database, identity, queries, contracts, callbacks, and automations.

`makeActorDbVersion` supplies the `queries` used to compile actor selections. The actor's
identity schema requires a string `aggregateId`; its actor schema supplies
the identity fields used by selection placeholders. Sessions obtain server-accepted identity and
resolve the exact actor name and version before accessing selected resources or
submitting commands.

`updateAggregateActorVersion` inherits omitted declaration fields and merges
queries, contracts, guards, and automations by key. Supplied entries replace
matching keys; empty maps preserve inherited entries. Database, identity,
and authorization overrides replace their inherited values. The complete merged
declaration is validated, including that queries belong to the selected database.
Deployed historical versions retain their own declarations.

Actor lock metadata records identity schemas, models, selections, and
contracts. Fixed schema changes require empty storage during pre-release.

## Durable automations

An actor can register server-side `automations` alongside its browser-callable
`contracts`. Each `makeAutomation({ name, on, contracts, program })` observes a
contract and returns one declared output command or `null` from an Effect.
`program({ db, on, contracts })` receives selected read-only queries, the typed
triggering command, and constructors for its permitted output contracts.
Constructing an output does not submit it.

Automation output contracts are separate permissions: declaring `playO` on a
automation does not expose it to browser callers. Output identity contains
the actor's selection claims, not the triggering session's full identity.
Declaration checks reject output contracts requiring unavailable claims. Actor
and aggregate guards include automation-only command names and type their
identity as selection claims. Contract and applicable owner guards still run.

Automations observe successful matching commands from any actor only when those
commands change their selection. First initialization catches up selected state
and records a starting position before admitting the first command. Historical
catch-up does not invoke new automations; restarts recover existing work. No open
browser is needed after registration.

Each automation runs in order for each actor instance. Its program reads a fresh
selected snapshot when an attempt begins, not the historical state at the
triggering command. Other automations and projection updates can proceed while
it awaits external work. A program can run again after interruption before its
result is saved. Once saved, the runtime retries that same command identity and
payload without rerunning the program. Returning `null` is durable completion.
A terminal guard rejection completes the reaction; infrastructure failures
retain pending work for alarm recovery.

Automation names form part of output identities; the accepted system spec records their observed and
output contracts. Changed fixed schemas require empty storage during pre-release.
