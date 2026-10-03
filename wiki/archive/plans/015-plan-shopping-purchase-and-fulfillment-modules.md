# Replace purchase and compose Shopping modules

**Date:** 2026-09-27
**Status:** Implemented and verified on main; changes left uncommitted
**Predecessor:** [Plan 014](014-plan-aggregate-module-composition.md)

## Summary and settled decisions

The snippets below specify the target authoring shape. Their identifiers refer to
planned declarations; they are not claims that these interfaces already exist.

## 1. Literal declarations and factory-owned composition

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

## 3. Complete promotion coordination

1. Wire existing service operations into these command-driven sequences:

| Trigger                                           | Progression                                                   |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Apply promotion                                   | Reserve service state, then record reserved/denied receipt    |
| Confirm with promotion                            | Commit, record committed receipt, then create purchase        |
| Confirm without promotion                         | Create purchase directly                                      |
| Successful payment                                | Redeem, then record receipt                                   |
| Cancellation/removal/confirmed acceptance failure | Release, record receipt, and finalize removal when applicable |

## 4. Real fulfillment using models

## 5. Application wiring

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
