# Shopping

## Identity

Set `CLERK_JWT_KEY` to the Clerk instance's PEM verification key and `CLERK_AUTHORIZED_PARTIES` to the allowed session origins. The browser sends a Clerk session token; the worker verifies it and derives `clerkUserId`. Identity provisions the customer through the server-only provisioner. Customer sessions select only that customer's resources.

## Checkout

Run the local configuration with `pnpm nx run shopping:dev`. The purchase module owns checkout progression, payment attempts, and promotion receipt handling.

Confirmation authoritatively checks the customer, cart, current product replicas, and reviewed quote. It writes a checkout with stable purchase and first payment-intent IDs and an immutable accepted quote. The cart becomes frozen immediately, before a purchase exists. An automation creates the purchase and first intent after any required promotion commitment, then the payment provider returns the observation that completes checkout.

Purchase rows describe the payment obligation; payment-intent rows retain individual collection attempts. The domain commands still enforce intent history, uncertainty, and terminal outcomes. V2 is the active example; V3 retains its quantity-based cart-item schema.

## Promotions

The purchase module coordinates reserve, commit, redeem, and release through `PromotionProviderLive`. The provider uses the promotion service's authored ledger query and waits for authoritative command completion before returning receipts. Capacity and expiration remain service guards. Discounted purchase creation follows confirmed commitment; payment success redeems it. Removal, cancellation, and failed acceptance release it, including batched cart-removal receipts. `PromotionDevelopmentLive` retains the configured simulation delay.

## Storage and checks

This hard cutover requires empty backend and browser storage. No migration or automatic reset is provided. Existing local storage is not deleted by these changes. Use a fresh system identity/storage before running the changed schema.

```sh
pnpm nx run shopping:tsc:typecheck
pnpm nx run shopping:lint
pnpm nx run shopping:test --run
pnpm nx run shopping:build
```

The system provides typed payment, promotion, and fulfillment capabilities to the domain automations.

## Payment and manual fulfillment

A confirmed checkout enrolls `acceptPurchase`, which creates its purchase and first payment intent. `processPayment` waits five seconds on the server, then returns the private payment observation command. A declined attempt can use `retryPayment`, with the same delay and a new intent. Authoritative checks reject mismatched customers, purchases, and stale intents; the browser cannot submit completion commands.

`/fulfillment` queries the signed-in shopper's enrolled fulfillment replicas and persisted operation instances. Pack and Ship create guarded requests; trusted server automations submit service commands and record confirmed success or failure. Uncertain transport leaves the operation pending. A retry after a confirmed failure creates a new operation ID. Service subscriptions propagate packing, shipping, and deterministic simulated tracking information across reloads. Purchase status remains `paid`. The service installs no automatic shipping automation.

V2 remains active in the system and browser session. V1 retains only the purchase models it needs, while V3 explicitly upgrades quantity-dependent contracts from their V2 predecessors. The package frontend/server compositions share canonical model and public contract objects.
