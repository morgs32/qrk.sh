# Shopping

Shopping demonstrates a marketplace-owned catalog and carts. `marketplace@1.0.0`
owns `product`, `cart`, and `cartItem`; each cart has one unique, non-null `userId`
containing the verified Clerk subject. Cart items reference the local cart and
product and retain `amount`. Product prices retain the example's existing units
(the displayed USD amount, not cents).

## Identity and selection

Set `CLERK_JWT_KEY` to the Clerk instance's PEM verification key and
`CLERK_AUTHORIZED_PARTIES` to the allowed session origins. The worker verifies the
Clerk session token before deriving `clerkUserId`. There is no User row or
provisioning command.

The authenticated `catalog` actor selects all products and exposes no commands.
The authenticated `shopper` actor selects only her cart, its items, and products
referenced by those items. Every cart command has an actor ownership guard that
runs again during authoritative execution, plus an ordinary guard for local
staging and pending replay. Removing the last reference deselects that product
from the shopper projection while preserving it in the marketplace catalog.

`catalogSession` and `shopperSession` are marketplace service sessions. They
import browser-safe ordinary declarations. UI availability uses the service
session's `can`; submissions await durable command staging, block duplicates
while pending, and display staging and authoritative failures. First-cart creation
is shared across product cards and waits for the local cart projection before
staging a referencing item.

## Mapped add-to-cart

The ordinary `addToCartV1` queries its invocation database. If the payload's
product is absent locally, it emits product creation before cart-item creation.
An existing product is never updated by this command. Its explicit result is
`null`.

The server registers `mappedAddToCartV1` on both marketplace and its shopper
actor. The mapper checks the authoritative product in pre-application state and
rejects with the ordinary contract's `productNotFound` failure when absent.
Success forwards the base result through an explicit `Schema.Null` codec and
emits no further operations. Rejection applies neither proposed product nor item
creation. Authoritative selection replaces predicted product data; unresolved
commands rebase over that selection in the same projection transaction. These edits emit no async work, and there are no product replicas.

## Checkout, payment and tracking

The app worker serves same-origin `POST /api/checkout`. Configure its server-only
`ZEROSPIN_API_URL`, `ZEROSPIN_SECRET_KEY`, `CLERK_JWT_KEY` and
`CLERK_AUTHORIZED_PARTIES`; the API URL must reference the same Shopping System
as the app sessions. The browser sends only its cart ID and a checkout nonce.
The worker verifies Clerk, derives the user aggregate and deterministic command
identities, and executes through the marketplace `shopper` actor. The Checkout
button waits for pending cart edits, retains its nonce after an uncertain response,
and can retry even after the live cart becomes empty.

Checkout reads authoritative product names, prices and quantities, freezes every
current item, deletes those exact cart-item rows, and records `asyncCreatePurchase`
in one synchronous transaction. Its retained async payload is the transfer record;
there is no additional quote store or outbox. Later cart additions are untouched.
The worker-local delivery service reconstructs the complete `createPurchase`
command identically on retry and uses the existing administrative command path.

`user@1.0.0` has ID `acct_${clerkUserId}`. Its authenticated `user` actor rejects an
aggregate ID inconsistent with the verified subject and selects purchases/items
without writing contracts. Purchase and item snapshots commit together, then
payment runs outside the transaction. Payment state is `pending`, `paid` or
`declined`, with provider reference and evidence. Paid means completed. Decline
keeps the purchase/items and never restores the cart. Prices remain displayed USD
amounts. The example provider succeeds deterministically; tests supply decline and
interrupted-response providers.

Project-root `agents.ts` exports the cold `purchasesSession` declaration from one
session file. The System and Studio import the same browser-safe ordinary
contracts and models. Its system-only `admin@1.0.0` actor selects every user domain
model and row. Studio's server resolves this session and issues a bounded ticket
for its declared original contracts. The transient session owns only in-memory
SQLite/journal while its view is open; ordinary application authentication rejects
the admin actor.

Studio queries paid purchases and keeps them visible during tracking changes.
`createTrackingLabel({ purchaseId })` reserves work on a paid purchase, coalesces
repeated requests, and records the example carrier's label reference, tracking
number and `pre_transit` status. `updateTrackingInfo({ purchaseId })` reserves a
refresh sequence, coalesces requests while pending, and validates the frozen label
identity and sequence before applying evidence. Refresh 1 reports `in_transit`;
refresh 2 onward reports `delivered`. Both buttons stage the ordinary contract
transactionally and push that same command. External work starts only after its
authoritative commit. Provider retries preserve business keys, and recorded
observations remain immutable. No real provider, background refresh or separate
shipping command is included.

## Storage and verification

This is a hard cutover. Changed fixed schemas require empty backend and browser
storage, including previous service/aggregate state, browser Nodes and cached
sessions. No deprecated rows, compatibility versions, or translation paths are
retained. Reset disposable storage before running the new declarations.

Run the scoped Nx checks with dependencies:

1. `CI=true pnpm nx run shopping:test:workerd`, then `pnpm nx run-many -t ts lint agent-preview:check marketplace:check checkout:check agents:cold-check -p shopping`.
2. `shopping:marketplace:check` covers staging with absent/existing products,
   mapped success and atomic rejection, preserved authoritative product fields,
   two-user selection and command denial, reconciliation/rebase, last-reference
   removal, per-user aggregate authorization, and durable staging completion.
3. `shopping:agent-preview:check` covers cold session/manifest bindings,
   authoritative checkout, rollback, frozen snapshots, stable delivery identities,
   paid/declined purchases, tracking preconditions/coalescing, stale observations
   and two-user isolation.
4. `shopping:checkout:check` verifies signed Clerk identity, same-origin and strict
   payload admission, and identical complete commands after response loss.
5. `shopping:agents:cold-check` verifies resource-free Node imports.

The named `shopping:test:workerd` suite lives in `test/`: checkout assertions in
`checkout.workerd.spec.ts`, label and refresh assertions in
`tracking.workerd.spec.ts`, and retained-storage object restart assertions in
`fulfillment-recovery.workerd.spec.ts`. Its 14 cases use real backend classes and
the normal SystemApi command path. Test-only SQLite provider ledgers and delivery
barriers retain input and evidence before withholding responses. Recovery replaces
live objects, reopens retained storage before the retry deadline, and invokes the
registered alarm after advancing Date. Teardown reopens dormant registered objects
and clears their disposable storage between cases.

The named suite replaces both Shopping runtime scripts. The framework's
`system-worker:async-contracts:check` verifies async retention and duplicate result
receipt. `system-worker:async-contracts:runtime-check` retains the whole-process
crash matrix; Shopping's cases cover its business effects and object restart.
The [completed plan](../../wiki/archive/plans/035-plan-shopping-workerd-tests.md)
records the exact test titles and verification.

Reset disposable local backend storage with
`pnpm nx run shopping:zerospin:dev --clean`, wait for the worker's accepted System
message, then stop that process. From the workspace root, run
`VITE_ZEROSPIN_API_URL=http://127.0.0.1:3005 ZEROSPIN_API_URL=http://127.0.0.1:3005 pnpm nx run shopping:dev`
to start the app and its dependent backend against that empty namespace. From
`examples/shopping`, run
`ZEROSPIN_API_URL=http://127.0.0.1:3005 node ../../packages/cli/dist/cli.js studio`
after building current CLI dependencies. Studio uses port 5555 and loads that
project's config and `agents.ts`. Registered user aggregate IDs come from actual
checkout/purchase commands; marketplace product seeds alone do not create them.

From `examples/shopping`, populate the catalog with
`ZEROSPIN_API_URL=http://127.0.0.1:3005 node ../../packages/cli/dist/cli.js seed src/zerospin/seeds.ts`.
These administrative service commands explicitly use `caller: null`.

Shopping prohibits browser tests and browser-driven verification. Node fixtures
use contracts and in-memory SQLite. Workerd tests create isolated disposable
storage, restart against that same storage, and verify durable recovery.
They acquire no browser and do not reuse application storage.
