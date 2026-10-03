# Zerospin system visualizer

A standalone React Flow canvas of the system worker and Shopping: all 12
production Repo/Chain classes, 96 table instances, their columns and declared
references, sessions, browser Node, websocket capabilities, authored owners and
actors, and command walkthroughs with example rows.

## Run

From the repository root:

```sh
pnpm install --filter visualizer
pnpm nx run visualizer:dev
```

Open [the visualizer](http://127.0.0.1:3040/). The app needs no Shopping server,
credentials, database, or external payment provider. Port 3040 is fixed; Vite
fails rather than silently choosing another port.

```sh
pnpm nx run-many -t build typecheck lint test format:check -p visualizer
```

## Explore

1. Every table is on the same canvas, grouped by its retained owner. Pan and
   zoom, double-click a card, or select a Repo in the explorer and use **Locate
   selection**. Overview labels remain readable when zoomed out.
2. Search table/column names and filter owners or connection kinds. Solid
   column connections are declared references. Colored routes distinguish
   command delivery, history/projection, websockets, async production, and
   access/binding. A branded external ID does not imply a SQL relationship.
3. Select a table for example rows, before/after changes, schema/index details,
   and its repository source location. Select a contract or **Inspect step**
   for payload, result, operations, original program, and server mapping.
4. Choose a walkthrough, then play/pause, step in either direction, reset, or
   scrub. Each snapshot is reconstructed from its initial fixture. Transaction
   changes become visible together. **Follow step** fits the current phase
   without changing the diagram's contents.

## What is current and what is illustrative

The current cart scenarios follow Shopping's **marketplace service** command:

```text
session → Node → websocket → SAVC → SC → SVR → SVC → SAVR → SAVC
        ← Node ← websocket ← retained selected output
```

`addToCart@1.0.0` runs locally as the original public contract. Its mapped
server declaration requires the authoritative catalog product. The success
fixture demonstrates client product price 1 being reconciled to authoritative
price 20 for two items. The rejection fixture removes the local prediction
when the catalog product is missing. Service admission has no AAVR-style
server scratch staging.

The real `user@1.0.0` aggregate currently owns purchase/purchaseItem and exposes
no commands. Its original schemas have a separate group. The **illustrative
user@2.0.0** checkout fixture adds purchase status/currency, a private
paymentIntent and `purchase@1.0.0 → asyncCompletePurchase@1.0.0`. It changes no
Shopping contracts or worker schemas and runs no SDK or provider programs.

The purchase walkthroughs cover payment success, decline, response loss, and
websocket reconnect/replay. The parent succeeds when its pending state and
async emission commit; payment completion is a distinct private command with
its own ID and admission position. The mapper sees pre-application state and
uses the frozen base result. Only AVR owns provider production. An external
observation and the continuation outbox commit together; browser selections
omit paymentIntent and provider evidence.

On response loss the provider receives two attempts with the same payment
intent key but retains one charge. That guarantee belongs to the fake
provider's idempotency ledger. Retry does not claim framework exactly-once
execution. Publication and provider production are independent after parent
commit: the timeline chooses one explanatory interleaving. Reconnect replays
retained outputs, without a second provider charge or browser child command.

## Fixture provenance and schema refresh

`src/data/schema-snapshot.json` is a checked-in static capture of current
`makeDbConfig`/`makeTable` declarations and authored model shapes. Every table
records source path and line; the inspector displays those locations. The
capture includes 54 production base tables, six authored models, and browser
infrastructure. `architecture.ts` composes these into concrete example owner
groups and separately marks invented fixture schemas.

```sh
node visualizer/scripts/capture-schema.mjs
```

This helper parses TypeScript syntax and composes referenced declarations. It
does not import or execute Durable Object implementations. It fails for
unsupported capture syntax rather than silently fabricating a schema. After
refreshing, format the snapshot and rerun the visualizer checks. Schema
metadata does not update automatically when another project changes.

Cart IDs and data come from
`examples/shopping/src/zerospin/fixtures/marketplace.ts`; current user purchase
item shapes and example values are adapted from its
`fixtures/purchaseItemAgent.ts`. Runtime ordering and
async ownership follow `packages/system-worker/src/asyncOperations/`, the
current Repo/Chain implementations, browser bootstrap and Node synchronization.
The walkthroughs display selected fixture fields, not complete live SQL rows.
Dates, command positions and strings beginning `fixture:` are deterministic
examples; example hashes are labels, not computed cryptographic proofs.

Prior art: [Supabase schema visualizer PR](https://github.com/supabase/supabase/pull/15739)
and [SQL Habit schema visualizer](https://github.com/sqlhabit/sql_schema_visualizer).
The app uses current `@xyflow/react` with original local UI and fixture code.
