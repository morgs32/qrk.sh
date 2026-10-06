# Zerospin Explorer

A standalone React Flow canvas of Zerospin infrastructure at `/`. It contains
the 12 production Repo/Chain classes, AggregateNode, ServiceNode, and the
aggregate and service session databases. All 16 repo and browser database
nodes include their complete infrastructure table schemas: 65 tables and 644
columns, with command, history, websocket, async, access and declared-reference
connections.

Click a repo or session card to fit it on screen. Select a table to inspect its
purpose, schema, indexes and source. Rows are empty. App-authored model tables
are supplied by the bound definition and are outside this generic view.

## Run and check

From the repository root:

```sh
pnpm install --filter explorer
pnpm nx run explorer:dev
```

Open [Explorer](http://127.0.0.1:3040/). The app reads checked-in metadata
and needs no running backend, credentials or database. Port 3040 is fixed.

```sh
pnpm nx run-many -t build typecheck lint test format:check -p explorer
```

## Appearance

Explorer uses [shadcn preset `b3kK6Twjw`](https://ui.shadcn.com/create?preset=b3kK6Twjw):
Base UI Nova components, taupe surfaces, pink accents, self-hosted Inter,
Lucide icons and the preset's default radius (`0.625rem`). The explorer,
canvas and inspector share the same light and dark theme. On mobile, the
explorer and inspector open as sheets; motion respects the device's reduced
motion preference.

The navbar's sun/moon switch selects light or dark mode. Until an explicit
choice is made, Explorer follows the device theme and responds to its changes.
Explicit choices are saved under `explorer-theme` in local storage across
reloads. The initial theme is applied before first paint, and
React Flow's `colorMode` stays synchronized. Switching themes preserves
filters, selection and canvas position.

Shadcn configuration lives in `components.json`; generated components remain
local to Explorer in `src/components/ui`. Theme tokens and diagram colors live in
`src/style.css`. Tailwind integrates through the Vite plugin in
`vite.config.ts`, with UI dependencies owned by Explorer's package.

## Explore

The root canvas shows repos, sessions, concrete SharedWorkers, websocket
capabilities and access APIs together. Every repo and browser database contains
full table cards with all columns and types. Owner and connection filters narrow
the canvas. Connections start with Session stageCommand only. Hover or focus a
filter row to use Only and select that option alone within its section.

Session executeCommand shows local-only standalone/mock aggregate execution,
labelled with its current implementation, `executeLocalSessionCommandTx`.
The current Session API calls this through `stageCommand`; the filter names
the local execution behavior. Session stageCommand follows aggregate
`stageCommand` and service `stageServiceCommand` delivery through the durable
Nodes, websocket handlers, actor chains and server admission/execution.

Colored boundaries group System, Aggregate, Service, Browser sessions, and
Shared workers. The browser owner filter controls both browser boundaries.
Access APIs and websocket capabilities sit inside their owner's boundary.
Boundaries follow the visible components when filtering owners.

Select a table for its purpose, schema, indexes, empty rows and source location.
Declared column references connect the corresponding table rows. Pan, zoom,
fit-all and locate-selection controls help move around the canvas. Repo and
session cards fit their table group on screen when clicked; table and cell
connection anchors stay hidden.

## Schema provenance

`src/data/schema-snapshot.json` captures infrastructure declarations from
`packages/system-worker`, browser Node schema construction, and core aggregate
and service session schemas. Each table records its source path and line.
`src/data/architecture.ts` adds generic ownership, identity fields and connections;
`src/data/table-purposes.ts` describes each captured table's role. The root canvas
uses this complete catalog directly and supplies empty rows for inspection.

Refresh the capture after infrastructure schema changes:

```sh
node explorer/scripts/capture-schema.mjs
```

The capture parses TypeScript declarations and composes referenced schemas.
It does not execute Durable Object implementations and fails on unsupported
syntax. Format the refreshed snapshot and rerun the scoped Explorer checks.

The former application walkthrough and its planned AggregateChain extension
were removed when this view became generic. [Plan 033](../wiki/archive/plans/033-plan-aggregate-chain-local-walkthrough.md)
records the cancelled follow-up.
