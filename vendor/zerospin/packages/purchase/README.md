# Purchase

`@zerospin/purchase/browser` exports `makePurchaseFrontendModule`, `makePurchaseModels`, and quote helpers. The frontend module owns checkout, purchase, purchase-item, payment-intent, and cart-promotion declarations. Hosts supply canonical user/cart/cart-item/product models, an authenticated user lookup, and a quantity accessor. Checkout ownership uses the domain user ID; no authentication-provider fields enter package models.

`makePurchaseModule` from the server entrypoint reuses that exact frontend module, adds internal completion contracts, and binds automations only after the final contracts exist. `makePurchaseGuards` installs the internal checks at authoritative aggregate commit. Public contracts remain browser-safe; provider services and completion contracts are server-only.

Acceptance snapshots the reviewed quote and its line items. A purchase is the payment obligation; each payment intent is a retained collection attempt. Decline permits a new attempt or cancellation. Uncertain payment blocks both until resolved. Success marks the purchase paid and clears its accepted cart items. `PaymentProvider` receives stable intent IDs; hosts must use them to deduplicate external collection.

`PromotionProvider` coordinates reserve, commit, redeem, and release against the host's authoritative promotion service. Local state changes only through confirmed receipt contracts. Commitment precedes purchase creation, redemption follows successful payment, and removal/cancellation/failed acceptance release the reservation. Cart removal returns one batched release-receipt command; retries may revisit already-confirmed remote releases without duplicating local output.

Shopping keeps V2 active. Its V3 composition explicitly upgrades the quantity-dependent public contracts and payment completion from the V2 objects before constructing automations. The neutral [consumer](src/consumer.typecheck.ts), [lifecycle tests](src/lifecycle.node.spec.ts), [browser bundle fixture](src/browserConsumer.typecheck.ts), and [Workerd lifecycle](../system-worker/src/AggregateActorVersionRepo/automations/purchaseFulfillment.workerd.spec.ts) exercise the same package API.

This replaces the old purchase demo outright. Changed model schemas require empty affected storage; no compatibility decoder or data translation is provided. Reset affected development storage explicitly before running the new composition. Implementation does not delete storage automatically.
