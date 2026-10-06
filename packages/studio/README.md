# Zerospin Studio

`zerospin studio` loads the current project's configuration and starts Studio at
`http://127.0.0.1:5555`. Its server broker obtains deployment-scoped SystemApi
access using the configured secret. The browser receives snapshots, recovered
command outcomes and single-use stream tickets; the secret remains server-side.

## Aggregate agent sessions

Studio home lists declared agents below each aggregate type/version's models
and contracts. Use an agent's “Search aggregate IDs…” combobox to open its
session directly. Agents for that aggregate version share one registered-ID
request and filter independently. The aggregate agent explorer also supports
selecting an aggregate type/version, registered ID and declared agent. IDs come
from direct queries of SystemRepo's `aggregates` table. AggregateChain registration
records each aggregate name/ID pair there alongside its Repo metadata in one
transaction. Opening a session checks that exact pair before opening its actor
projection. A registration records a known instance, not successful authorization
or initialization. Each session binds an exact
aggregate version and one full-view admin actor with `authentication: 'system'`
and aggregate-only identity. Ordinary application authentication rejects that
actor. Multiple agents may use the same admin actor.

Homepage aggregate-ID pickers use the shared Fragment Combobox, including its
filtering, keyboard selection, and compact input/popup styling. Popups render
inside the homepage appearance container to inherit its theme.

Both ID selectors use the shared `useAgentAggregateIds` SWR hook, keyed by
aggregate name/version. Each fetch opens and disposes a Cap'n Web batch with
`newSyncRpcSession` against Studio's `POST /api/agents/rpc` endpoint. The local
`StudioAgentApi` exposes only the ID read and calls the existing SystemApi method
using server-held credentials. Encoded failures retain their message and
structured cause; invalid outcomes or IDs become query errors.

SWR shares cached IDs across consumers, refreshes on focus/reconnect, and keeps
cached IDs usable during background refresh. Retry calls the query's bound
`mutate()`; automatic error retries and timer polling are disabled. Changing
aggregate name/version uses a separate cache entry. No declared agents or
unavailable selection means no query. Session opening still uses its existing
bootstrap route and lifecycle.

The homepage uses `@zerospin/fragment-ui` for the same Fragment Mono font,
monochrome palette, and outline styling as Fragment's documentation sidebar.
Its top-right Theme dropdown offers Light/Dark/System, follows device appearance
by default, and remembers a separate Studio preference. The shared Fragment
Dropdown menu and aggregate-ID popups inherit the homepage appearance; other
Studio screens retain their existing styling.
Admin and Repos are standalone, unnumbered headings outside their respective
outlines. As in QRK's OrderedOutline, each list generates its own muted hanging
counter markers separately from its labels, using decimal, uppercase, and
lowercase tiers. Each section's outline restarts its counters independently.

The project-root `agents.ts` exports its browser-safe cold sessions by name:

```ts
import { purchasesSession } from './src/zerospin/agents/purchasesSession';

export const agents = { purchases: purchasesSession };
```

Each session file calls `makeAgentSession` with its system/session names, exact
aggregate/actor versions, claims schema, an authored `makeActorDbVersion`,
`selections`, and row-bound ordinary browser contracts:

```ts
const db = makeActorDbVersion({ models: { purchase: purchaseV1 } });

export const purchasesSession = makeAgentSession({
  // Existing identity and claims declarations.
  db,
  selections: {
    purchase: db.query.purchase.findMany({
      where: { paymentState: { eq: 'paid' } },
    }),
  },
  contracts: {
    createTrackingLabel: makeAgentContract({
      contractVersion: createTrackingLabelV1,
      model: purchaseV1,
      bind: { purchaseId: 'id' },
    }),
  },
});
```

The System imports the same `agents` record and validates canonical models,
ordinary contracts, selections and payload bindings against the registered admin
actor. Studio imports `agents.ts` through Vite; authentication, server mappings
and provider code stay outside that browser import graph. The normalized session
keeps canonical contracts intact and carries their row-form bindings separately.
Snapshot, recovery and live output rows pass through each canonical model's
resource and table codecs before SQLite insertion, preserving Date and JSON
values for row bindings.

Construction acquires no resources. Opening a view initializes the same session
object with main-thread in-memory SQLite, an in-memory command journal and a
transient stream identity. Studio uses the same compact table-browser shell,
typed headers, scrolling grid and responsive inspector as the repo browser.
Declared selections appear in declaration order, with the first initially open.
Actor-style captured queries return complete model rows and can use relational
filters; `useLiveQueryOnDb` watches their declared model dependencies so committed
changes rerun the selection. Refresh reruns the current selection locally.

Each row shows actions for contracts bound to its model. Opening one replaces
JSON inspection with a right-side `ShapeForm`: bound payload fields are read-only
and unbound fields use the existing primitive inputs. All-bound payloads retain a
Submit button. Live row changes preserve editable drafts and update bound values;
submission reads the current row through its model codec, merges editable values,
and calls ordinary `stageCommand`. Switching selection, row, command or session
resets the form. A disappearing row disables submission while retaining its
command outcome.

The synchronous ordinary contract stages model changes and commits its complete
command occurrence locally. The session pushes that same occurrence through the
existing aggregate session protocol. Command status distinguishes local staging,
delivery pending, authoritative confirmation and rejection. Rejection rewinds
optimistic changes; business eligibility belongs to the contract guard.

New submissions are disabled during unresolved delivery, disconnection or recovery.
Reconnect retains rows, recovers owned outcomes through the snapshot cursor and
replays unresolved optimism. Uncertain submissions retry their unchanged command
IDs, payloads and positions. Switching aggregate/agent or closing the view fences
late callbacks, aborts bootstrap, closes the stream and SQLite, and disposes the
runtime and query subscriptions. Reopening starts a fresh transient lifetime.
Studio acquires no durable Node, SharedWorker or backup storage. Automated agent
execution, service attachments and upgrade handling remain deferred.

## Focused verification

1. `pnpm nx run @zerospin/core:agent-preview:check` checks cold declarations, composition/manifest bindings and application rejection.
2. `pnpm nx run @zerospin/browser:agent-preview:check` checks real in-memory staging, stream recovery and disposal.
3. `pnpm nx run @zerospin/studio:preview:build` verifies the browser bundle with independent cold fixture sessions.
4. `pnpm nx run @zerospin/studio:agent-rpc:check` exercises the production Studio adapter and fetcher through real Cap'n Web HTTP batches, including structured failures, invalid results, and private credentials.

## Homepage Storybook

Run `pnpm nx run @zerospin/studio:storybook` and open
`http://localhost:6007`. Build its static preview with
`pnpm nx run @zerospin/studio:build-storybook`; the output is
`packages/studio/storybook-static` and can be served by a static HTTP server.

The stories render the actual homepage and SWR hook. MSW intercepts
`POST /api/agents/rpc` and returns real Cap'n Web responses from a fixture API.
The production client and response validation remain in use. Selected agent
and Repo links display their pathname in a memory router. These previews do
not initialize agent sessions or connect to an application backend.

Stories and mock helpers live outside the published `src` tree. Each story gets
fresh scenario state and an SWR cache; leaving a story settles pending responses
and restores browser theme preferences and any storage override. Browser checks
are interactive; `agent-rpc:check` retains automated production RPC coverage.

1. In Registered, search alpha in admin and beta in reader to check independent
   filters, then search an unknown ID. Use ArrowDown and Enter to select an ID;
   inspect the encoded pathname, including special characters and long IDs.
   Both pickers share one aggregate-name/version lookup.
2. In Loading, release the pending response and inspect loading transitions.
   Change the query probe's aggregate name or version before releasing an
   earlier response; the earlier data must not appear under the new identity.
3. In Failure and Retry, inspect the initial error and retry successfully.
   Fail a later refresh to verify cached IDs remain usable. Empty, No Agents,
   and Malformed IDs show distinct states; No Agents makes zero requests.
4. Use the shared/separate query stories and request counts to inspect
   deduplication, independent name/version caches, and a disabled query.
5. Add an ID before simulating focus or reconnect. The cached UI changes only
   after revalidation. Production SWR deduplication and focus throttling apply;
   wait between repeated refresh events rather than expecting every click to
   send a request.
6. Change Light/Dark/System through the homepage's actual theme menu. Picker
   filters survive theme changes and popups follow the homepage appearance.
   Blocked Storage still defaults to System and permits theme selection.
7. Use Storybook's viewport toolbar at 1280, 390, and 280px. Inspect long IDs,
   popup wrapping, and horizontal overflow. Switch stories and reset them to
   verify request counts, theme preferences, and pending responses are isolated.

Shopping's AGENTS.md prohibits browser-driven Shopping verification. Use its
contract/SQLite/Workerd fixtures for application behavior.
