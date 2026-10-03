# Shopping marketplace cutover after plan 027

## Status and prerequisite

Completed and verified on 2026-10-02 after [plan 027](027-plan-actor-bound-async-contracts.md) finished. Existing core work was preserved. This cutover requires empty storage.

Apply a hard cutover with empty storage and no compatibility paths. Checkout, purchase creation, payment, fulfillment, and purchase UI remain deferred.

## Marketplace and cart behavior

1. Rename the `app` service and source directory to `marketplace`. Update system registration, seeds, imports, and service queries. Use fresh `1.0.0` declarations and remove superseded Shopping version chains.
2. Marketplace owns `product`, `cart`, and `cartItem`. Preserve product fields. Cart has a unique, non-null `userId` containing the verified Clerk subject directly. CartItem retains `amount` and concrete local references to cart and product.
3. Define authenticated `catalog` and `shopper` service actors. Catalog selects all products and exposes no cart commands. Shopper selects her cart by `userId`, its cartItems, and products referenced by those items.
4. Move `createCart`, `addToCart`, `removeFromCart`, and `updateCartItemQuantity` into marketplace. Actor guards enforce ownership using verified claims, including authoritative execution. Preserve quantity-control behavior.
5. Ordinary `addToCart` includes product, cart ID, cartItem ID, and amount. Its synchronous program queries its invocation database, emits product creation from the payload only if absent, then emits cartItem creation. Product creation precedes the referencing insert; existing product fields remain untouched.
6. Register `mappedAddToCartV1` using plan 027's `mapContractVersion` on marketplace and its shopper actor. The mapper reads the authoritative product from pre-application state and rejects with `productNotFound` when absent. Declare that failure on the ordinary contract. Successful mapping forwards the base result through an explicitly declared result codec and emits no additional operations.
7. Mapper rejection applies neither proposed product creation nor cartItem creation. No async contract or product replication machinery is involved.

## Sessions, purchase aggregate, and preview

1. Keep `catalogSession`; convert `shopperSession` into a marketplace service session. Both import browser-safe ordinary declarations. Update UI callers to service staging and availability checks.
2. Remove User-row queries and provisioning. Product cards use authenticated claims for cart ownership; the sidebar queries cart → items → product directly. Await durable staging, prevent duplicate submissions while pending, and surface failures. When creating the first cart, observe its local projection before staging the referencing cartItem.
3. Add `userAggregateV1` and authenticated `userActorV1`, both with canonical name `user`. Derive one aggregate ID per verified Clerk subject as `acct_${clerkUserId}`; reject inconsistent aggregate identity. The actor selects that aggregate's purchases and purchaseItems and exposes no purchase-writing contracts.
4. Define `purchase` with integer `total`, and `purchaseItem` with a concrete local purchase reference, external marketplace `productId`, snapshot `name` and `price`, and integer `quantity`. Prices retain Shopping's existing units. Ownership comes from the per-user aggregate; add no product replica or cross-database relation.
5. Adapt the read-only preview actor and agent to `purchaseItems`, querying `purchaseItem` where `quantity > 0`. Preserve system authentication and aggregate-based preview infrastructure. Rename the fixture and update the existing Nx preview check.
6. Delete obsolete shopper aggregate versions, User/provisioner code, product replicas, cart preview declarations, and unused catalog-marker scaffolding. Keep promotion behavior unchanged.

## Verification and completion

1. Add focused contract/fixture coverage for local staging with an absent product, staging with an existing product, authoritative success, missing-product rejection with atomic rollback, and client-supplied product fields never overwriting authoritative fields.
2. Verify reconciliation replaces predicted product data with authoritative selected data without duplicate-row or foreign-key failures. Cover rejection cleanup, pending-command rebase, and removal of the last referencing cartItem.
3. Verify two-user cart isolation, ownership denial for every cart command, per-user aggregate authentication, and purchase-item snapshot relations. Test preview declaration, manifest, and filtered results with fixture data.
4. Run scoped Nx typecheck, lint, build, and adapted preview/contract checks, preserving dependencies. Follow Shopping's prohibition on browser verification and report unrelated blockers separately.
5. Update Shopping's README and affected documentation for implemented ownership, mapping, deferred purchases, and empty-storage requirements. Reconcile glossary terms; create an ADR only if the implemented decision meets repository criteria.
6. Reconcile affected Shopping references in [plan 028](028-plan-studio-agent-query-preview.md), record verification evidence, and archive completed plans only when their required work is finished. Preserve this filename and repair links when archiving.

## Implemented outcome and verification

1. Marketplace owns products, unique Clerk-subject carts, and locally referenced cart items with fresh `1.0.0` declarations. Separate authenticated catalog/shopper actors use the exact registered mapped contract. Ordinary staging inserts an absent predicted product before its cart item; the authoritative mapper rejects missing catalog products and forwards an explicit null result without further emissions. Existing authoritative fields remain unchanged.
2. Both browser sessions are marketplace service sessions. UI commands await durable staging and display failures, including authoritative removal failures after the item control unmounts. First-cart creation is shared across product cards and observes the local projection before staging a referencing item. Quantity behavior is preserved.
3. The per-user `user` aggregate uses `acct_${clerkUserId}`, rejects inconsistent identity, and contains read-only purchase/purchase-item declarations with local purchase references and external product IDs plus name/price snapshots. The system-only purchase preview filters `quantity > 0`. No purchase-writing contracts or product replication remain; promotion is unchanged.
4. `shopping:marketplace:check` passed absent/existing-product staging, authoritative success, missing-product rejection with no applied rows, client-field preservation, application rollback, every cart command's cross-user actor and local denial, catalog command denial, two-user selections, unique carts, projection replacement without duplicate/FK failures, rejection cleanup, pending-command rebase including application failure, last-reference removal, per-user aggregate authorization, original browser locks, and awaiting durable acceptance.
5. `shopping:agent-preview:check` passed the actual purchase agent declaration, manifest, positive-quantity filtering, snapshot name/price, local purchase relations and orphan rejection. The fixture creates its own purchase data; no purchase creation was added to the application.
6. `pnpm nx run-many -t ts lint build preview:build agent-preview:check marketplace:check -p shopping @zerospin/browser @zerospin/studio` passed with dependency execution preserved. Shopping typecheck covers source and configuration. The affected browser/Studio typechecks, lint, Studio preview build, Shopping build, and browser database agent fixtures passed. After the last import-order cleanup, `pnpm nx run shopping:lint` passed with no warnings. No Shopping browser verification was added or run.
7. The existing service projection replacement/rebase loop was extracted into `replaceServiceProjectionTx` and remains wired into browser session snapshot application. Shopping's SQLite fixture exercises that production seam without a browser. The user explicitly approved removal of Studio's obsolete `aggregate.services` section, which had blocked dependency builds. Shopping's invalid empty `cloudflare:workers` path substitution was removed so its configuration typecheck could run.
8. Updated Shopping README, Studio's purchase-preview example, affected AuthoredSystem references and glossary. Plan 028's Shopping blocker is resolved and its preview reference reconciled. No additional governing ADR was needed for the application declarations; purchase-writing workflows remain deferred. Formatting, changed documentation links and whitespace checks passed.
9. Nx Cloud access code 401 and existing Vite chunk-size/WASM build notices are non-blocking; all required local commands exited successfully. Empty backend/browser storage remains a run requirement; no existing user storage was deleted during implementation.

## Remaining work

None.
