# Replace purchase and compose Shopping modules

**Date:** 2026-09-27
**Status:** Implemented and verified on main; changes left uncommitted
**Predecessor:** [Plan 014](../archived/014-plan-aggregate-module-composition.md)

## Summary and settled decisions

1. Replace the demo implementation of `@zerospin/purchase` with Shopping's real
   checkout/payment lifecycle. Keep one canonical implementation and migrate all
   consumers directly.
2. Make Shopping's aggregate versions and browser session consume purchase and
   fulfillment modules. Purchase is identity-neutral; Clerk authentication and
   authenticated-user lookup remain in Shopping.
3. Preserve separate manual Pack and Ship buttons. Fulfillment processing is
   service-owned; requests and their outcomes are normal versioned Zerospin
   **models** in the shopper aggregate.
4. Declare aggregate-local contracts literally. Modules declare their own
   contracts; actors select which contracts callers can invoke. Never derive the
   aggregate's inventory by merging actor contract maps.
5. Delete `mergeDeclarations`, its SDK exports, and all its callers. Composition
   belongs inside the aggregate/session factories. Their implementation checks
   source collections for duplicate names before ordinary object assignment.

The snippets below specify the target authoring shape. Their identifiers refer to
planned declarations; they are not claims that these interfaces already exist.

## 1. Literal declarations and factory-owned composition

1. Keep the existing optional `modules` and flat `models`, `contracts`, and
   `automations` API. Aggregate-local contracts are individually named, including
   provisioning contracts. Module contracts are not repeated locally.

```ts
export const shopperAggregateV2 = sdk.upgradeAggregateVersion(
  shopperAggregateV1,
  {
    version: '2.0.0',
    modules: { purchase, fulfillment },
    models: {
      user: userV1,
      cart: cartV1,
      cartItem: cartItemV2,
      product: productReplicaV1,
    },
    contracts: {
      createUser: createUserV1,
      updateUser: updateUserV1,
      createCart: createCartV1,
      addToCart: addToCartV2,
      removeFromCart: removeFromCartV2,
      updateCartItemQuantity: updateCartItemQuantityV1,
    },
    actors: { provisioner: provisionerV1, shopper: shopperActorV2 },
    guards: { shopper: shopperGuards },
  },
);
```

2. The purchase server factory constructs a plain bundle. Its internal completion
   contracts belong to the module's contract inventory, even though the shopper
   cannot call them directly. Guard builders are separate from the plain bundle;
   do not add non-declaration properties to a strict module input.

```ts
// Inside the purchase server factory; final declarations are already constructed.
return {
  models: {
    checkout,
    purchase: purchaseModel,
    purchaseItem,
    paymentIntent,
    cartPromotion,
  },
  contracts: {
    confirmCheckout,
    initiatePayment,
    cancelPurchase,
    applyPromotion,
    removePromotion,
    createAcceptedPurchase,
    recordPaymentObservation,
    recordPromotion,
    recordPromotionReleases,
    failCheckout,
  },
  automations: {
    acceptPurchase,
    processPayment,
    retryPayment,
    reservePromotion,
    commitPromotion,
    continueAcceptedPurchase,
    redeemPromotion,
    releaseCanceledPromotion,
    releaseRemovedPromotion,
    releaseFailedPromotion,
    releaseCartPromotions,
  },
};
```

3. Actor and session contract collections are explicit capability selections.
   Internal receipt contracts enter actor execution through automation outputs,
   not the browser-callable contract map. Build the actor database with literal
   model entries referencing the same host/module objects.

```ts
// In shopperActorV2's contracts and in the browser session's local contracts:
// select only the appropriate entries; module contracts need not be repeated
// on makeSession when supplied by its browser-safe modules.
const shopperActorContracts = {
  updateUser: updateUserV1,
  createCart: createCartV1,
  addToCart: addToCartV2,
  removeFromCart: removeFromCartV2,
  updateCartItemQuantity: updateCartItemQuantityV1,
  confirmCheckout: purchase.contracts.confirmCheckout,
  initiatePayment: purchase.contracts.initiatePayment,
  cancelPurchase: purchase.contracts.cancelPurchase,
  applyPromotion: purchase.contracts.applyPromotion,
  removePromotion: purchase.contracts.removePromotion,
  requestPacking: fulfillment.contracts.requestPacking,
  requestShipping: fulfillment.contracts.requestShipping,
};
```

4. Add compile-time rejection for statically known duplicate model, contract, and
   automation names, both local-versus-module and module-versus-module. Preserve
   inference; do not permit conflicting inputs by widening them. Dynamic maps
   still receive authoritative runtime checks.
5. Keep the existing internal composition path shared by aggregate and session
   factories. Remove its dependency on the generic merge helper. Check each
   contributed key before assigning its collection into a fresh accumulator;
   reject identical-object duplicates too. Do not mutate caller collections.
   Apply this equally to aggregate creation/upgrades and both session kinds.

```ts
// Internal composition excerpt, repeated for models and automations.
// contracts is a fresh accumulator initialized from local declarations.
for (const [moduleName, module] of Object.entries(modules)) {
  for (const name of Object.keys(module.contracts)) {
    if (Object.hasOwn(contracts, name)) {
      throw new Error(
        `Duplicate contract declaration ${name} in ${moduleName}`,
      );
    }
  }
  Object.assign(contracts, module.contracts);
}
```

6. Checks must precede assignment: a collision already overwritten by a spread
   cannot be reconstructed by a later validator. Caller-authored contract maps
   therefore use literal entries, not actor-map spreads or premerged registries.
   Record that authoring rule in local patterns; do not introduce an AST lint
   framework to enforce it.
7. Remove the helper-specific test and replace it with factory-boundary collision
   tests. Migrate remaining model-merge consumers to explicit model inventories
   or module attachment. Update current docs/patterns to remove instructions and
   links to the deleted helper; preserve historical development records.

## 2. Replace the purchase package

1. Move `checkout`, `purchase`, `purchaseItem`, `paymentIntent`, and
   `cartPromotion`, their contracts, and lifecycle automations into
   `@zerospin/purchase`. Remove the old `purchaseEvent` demonstration lifecycle,
   old demo factories, and their obsolete tests without compatibility exports.
2. Provide `makePurchaseFrontendModule` in the browser entrypoint. Accept the
   concrete host models, command identity schema, authenticated-user lookup, and
   cart-item quantity accessor. Constrain the host roles/relations needed by the
   existing behavior while preserving their concrete generic types.
3. Store an internal `userId` reference on checkout instead of `clerkUserId`.
   The supplied lookup resolves that ID from authenticated claims and host data;
   caller payloads cannot choose another user's identity.
4. Provide `makePurchaseModule` in the server entrypoint. Accept the existing
   frontend bundle, selection identity schema, ownership lookup, and final cart
   contracts needed as automation triggers. Add internal contracts/automations
   using the same model and public-contract objects. Export authoritative guard
   construction separately.

```ts
// One browser-safe declaration instance per Shopping version.
export const purchaseFrontend = makePurchaseFrontendModule({
  models: {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
  },
  identitySchema: shopperIdentitySchema,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: identity.clerkUserId } } })
      .sync()?.id,
  readQuantity: cartItem => cartItem.amount,
});

// Server-only composition reuses that exact instance.
export const purchase = makePurchaseModule({
  frontend: purchaseFrontend,
  selectionIdentitySchema: shopperSelectionSchema,
  resolveUserId: ({ queryDb, identity }) =>
    queryDb.query.user
      .findFirst({ where: { clerkUserId: { eq: identity.clerkUserId } } })
      .sync()?.id,
  cartContracts: { removeFromCart: removeFromCartV2 },
});
```

5. Keep host models out of the module's contributed `models`. Include the needed
   host/module models in each contract's explicit read/write scope, including
   models its triggered automations query. Preserve cart freezing, payment cart
   cleanup, and checkout changes during cart removal.
6. Payment and promotion providers are typed server Effect services supplied by
   Shopping's system layer. Keep the five-second simulated payment implementation
   in Shopping. Domain package code has no Shopping imports, Clerk assumptions,
   repository inspection calls, or browser-imported server integrations.
7. Build V2 once with its `amount` accessor. Build V3 through explicit declaration
   upgrades for the changed cart-item dependency and `quantity` accessor,
   preserving existing contract upgrade history and automation bindings. V1
   keeps its existing limited behavior through a model-only purchase contribution.
   Do not activate V3 or enable V2 commands on V1 as part of this change.

## 3. Complete promotion coordination

1. Wire existing service operations into these command-driven sequences:

| Trigger                                           | Progression                                                   |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Apply promotion                                   | Reserve service state, then record reserved/denied receipt    |
| Confirm with promotion                            | Commit, record committed receipt, then create purchase        |
| Confirm without promotion                         | Create purchase directly                                      |
| Successful payment                                | Redeem, then record receipt                                   |
| Cancellation/removal/confirmed acceptance failure | Release, record receipt, and finalize removal when applicable |

2. Replace the orphaned workflow-instance identity checks with supplied selection
   identity and internal user ownership checks. Register the receipt/failure
   contracts and their real producers in the module.
3. Preserve cart removal's multiple `releaseCheckoutIds`. Use an internal
   `recordPromotionReleases` contract to apply the confirmed receipts as one
   aggregate command; one automation cannot return an array of commands.
4. Keep promotion policy and the existing development restriction. Read current
   service state, execute guarded operations, and confirm their authoritative
   results. Refresh and retry on service-state conflicts; retain pending state
   during transport uncertainty. Only confirmed domain rejection records a
   terminal checkout failure.
5. Reuse reservation/purchase identities for idempotency. Partial service success
   followed by retry must observe completed operations rather than apply them
   twice. Preserve quote acceptance and one-unresolved-payment-attempt rules.

## 4. Real fulfillment using models

1. Register the fulfillment service in Shopping. Build its composition from the
   existing fulfillment models and request/pack/ship contracts with
   `automations: {}` so both buttons remain manual. Leave its automatic-shipping
   recipe available to other callers.
2. Extend the aggregate-side fulfillment factories to contribute a pinned replica
   plus a normal versioned `fulfillmentOperation` model. Its attributes are a
   fulfillment reference, `action: pack | ship`,
   `status: requested | succeeded | failed`, and nullable failure details.
   Ownership is checked through the correlated fulfillment and purchase models.

```ts
// Aggregate-side fulfillment module inventory.
return {
  models: { fulfillment: fulfillmentReplica, fulfillmentOperation },
  contracts: {
    requestPacking,
    requestShipping,
    enrollFulfillment,
    recordFulfillmentOperation,
  },
  automations: { requestPaidFulfillment, packFulfillment, shipFulfillment },
};
```

3. Purchase remains `paid`; fulfillment owns packing/shipping state. Trigger one
   fulfillment request after successful payment using a stable purchase-based
   request identity. The resulting guarded enrollment contract replicates the
   correlated authoritative fulfillment row.
4. `requestPacking` and `requestShipping` create operation model instances.
   Guards check ownership, required fulfillment state, and competing pending
   operations. Actor selection includes these instances so their actual state
   changes trigger automation and remain visible after reloads.
5. Automations submit trusted service commands and return internal outcome
   contracts. Use operation IDs for stable correlation. Uncertain transport
   retains the pending operation; confirmed rejection records failure. An explicit
   retry after terminal failure creates a new operation instance. Manual shipping
   receives deterministic simulated tracking information.
6. Keep the client capability in the fulfillment package, not the replacement
   purchase package. Shopping provides trusted server implementations using
   existing admission, completion, and authored-query APIs. Replace fixture
   table-inspection shortcuts. Check user, aggregate, purchase, and request
   correlation before recording results.
7. Use the existing subscriptions to update enrolled replicas. Replace React-only
   fulfillment stage state with actor-scoped fulfillment/operation model queries.
   Retain Pack and Ship actions, show pending/failure states, and offer retry.
   Add no raw SQL state, browser service-write API, polling loop, or parallel
   authoritative status store.

## 5. Application wiring

1. Compose the actor from final module declarations and literal host contracts,
   with application authentication and explicit ownership-scoped queries.
   Construct the actor's database from the same canonical models.
2. Use browser-safe module counterparts in the actual Shopping session, with
   local contracts declared literally. Internal completion contracts and server
   automations must be absent from these counterparts.

```ts
export const shopperSession = makeSession({
  kind: 'aggregate',
  systemName: 'shopping',
  aggregateName: 'shopper',
  aggregateVersion: '2.0.0',
  actorName: 'shopper',
  actorVersion: '2.0.0',
  sessionName: 'shopperSession',
  identitySchema: shopperIdentitySchema,
  credentialsSchema: clerkCredentialsSchema,
  modules: { purchase: purchaseFrontend, fulfillment: fulfillmentFrontend },
  models: {
    user: userV1,
    cart: cartV1,
    cartItem: cartItemV2,
    product: productReplicaV1,
  },
  contracts: {
    updateUser: updateUserV1,
    createCart: createCartV1,
    addToCart: addToCartV2,
    removeFromCart: removeFromCartV2,
    updateCartItemQuantity: updateCartItemQuantityV1,
  },
  layer: applicationLayer,
});
```

3. Keep V2 active in both system and session. Migrate V3's authored composition
   without changing its version behavior. Remove superseded local declarations;
   update package consumers, Workerd fixtures, and browser compilation fixtures.
   Add workspace dependencies with the package manager.

## 6. Verification and completion

1. Add factory type/runtime tests for local-module and module-module collisions
   across all three declaration kinds, including identical objects and reversed
   order. Test inferred module types and dynamic input runtime rejection. Remove
   helper tests rather than preserving an obsolete API.
2. Test package acceptance, item snapshots, decline/retry, uncertain payment,
   cancellation, ownership, and cart interactions. Typecheck both quantity
   versions and provider requirements.
3. Test every promotion sequence, capacity/expiration rejection, batch release,
   stale receipts, and retries after partial success.
4. Extend Workerd tests through payment, enrollment, manual packing, and manual
   shipping. Cover duplicate operations, lost responses, cross-user rejection,
   operation model outcomes, and replica propagation.
5. Check canonical declaration reuse, browser exports, and session command
   restrictions. Run scoped Nx build/typecheck, lint, unit/package tests, and
   Workerd tests for affected projects. Follow Shopping's prohibition on browser
   and Playwright verification.
6. Update affected module READMEs, glossary, architecture, and local declaration
   patterns. Verify no live `mergeDeclarations` imports/exports remain. Format
   changed files and check the final diff.
7. This is a hard cutover with no compatibility aliases or translation migrations.
   Changed models require empty affected storage. Document the reset requirement
   without silently deleting data. Archive this plan only after implementation
   and required verification are complete.

## Completion — 2026-09-27

Implemented the purchase and aggregate-side fulfillment modules, Shopping V1/V2/V3 composition, trusted providers, persisted manual Pack/Ship UI, neutral consumers, and declaration collision checks. Removed the superseded local checkout/promotion declarations and the merge helper API. V2 remains active. No commits or storage resets were performed.

The Workerd lifecycle exposed two integration defects fixed in this change: execution-delta installation now re-encodes validated JSON for SQLite text columns, and module owner guards return declared aggregate failures so rejected commands are terminal and do not block later execution.

Verification passed:

- Nx typechecks: core, browser, schema, purchase, fulfillment, domain-modules fixture, system-worker (including the new fixtures), and Shopping.
- Node tests: core 42, browser 44, schema 5, fulfillment 6, purchase 9, Shopping 9.
- Workerd tests: real purchase/payment/enrollment/manual Pack/Ship lifecycle and the existing automatic fulfillment service recipe.
- Shopping production build and purchase browser bundle proof. No browser, Playwright, or manual UI verification was performed.
- Scoped lint with warnings denied, formatting, and `git diff --check`. Broader project lint completed with existing warnings outside this change (transaction throw rules, RPC import ordering, and a prior browser typecheck expression). Nx Cloud reported account access warnings; local targets completed successfully.

Changed schemas require empty affected backend/browser storage before use. Existing stored data was not deleted or translated.
