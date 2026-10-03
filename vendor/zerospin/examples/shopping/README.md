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
commands rebase over that selection in the same projection transaction. There
are no async cart contracts or product replicas.

## Purchases and preview

`user@1.0.0` is a per-user aggregate with ID `acct_${clerkUserId}`. Its authenticated
`user` actor rejects an aggregate ID inconsistent with the verified subject and
selects purchases and purchase items without exposing writing contracts.
`purchase.total` is an integer. Each `purchaseItem` has a local purchase reference,
an external marketplace product ID, snapshot name/price, and integer quantity.
It has no product relation or replica.

The system-only `purchaseItemPreview` actor and `purchaseItems` agent retain the
aggregate preview infrastructure and filter purchase items by `quantity > 0`.
Fixture data verifies the read-only preview; the application currently creates
no purchases. Checkout, purchase creation, payment, fulfillment, and purchase UI
remain deferred. Promotion behavior is unchanged.

## Storage and verification

This is a hard cutover. Changed fixed schemas require empty backend and browser
storage, including previous service/aggregate state, browser Nodes and cached
sessions. No deprecated rows, compatibility versions, or translation paths are
retained. Reset disposable storage before running the new declarations.

Run the scoped Nx checks with dependencies:

1. `pnpm nx run-many -t ts lint build agent-preview:check marketplace:check -p shopping`.
2. `shopping:marketplace:check` covers staging with absent/existing products,
   mapped success and atomic rejection, preserved authoritative product fields,
   two-user selection and command denial, reconciliation/rebase, last-reference
   removal, per-user aggregate authorization, and durable staging completion.
3. `shopping:agent-preview:check` covers the purchase preview declaration,
   manifest, filtered fixture rows, and local purchase snapshot relations.

Shopping prohibits browser tests and browser-driven verification. These checks
use contracts and in-memory SQLite without browser acquisition.
