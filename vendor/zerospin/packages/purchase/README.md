# Purchase

`@zerospin/purchase/browser` exports `makePurchaseFrontendModule`, `makePurchaseModels`, and quote helpers. The frontend module owns checkout, purchase, purchase-item, payment-intent, and cart-promotion declarations. Hosts supply canonical user, cart, cart-item, and product models, an authenticated user lookup, and a quantity accessor.

`makePurchaseModule` reuses those frontend declarations and adds guarded completion contracts. `makeAcceptPurchaseMachine`, `makePurchasePaymentMachine`, and `makePurchasePromotionMachine` are system-registered aggregate machines. They read selected source rows, retain accepted work in private State, and submit completion contracts through normal authoritative admission and contract guards. Provider services and machine declarations are server-only; browser actors expose their own public contracts.

Acceptance snapshots the reviewed quote and line items. A purchase is the payment obligation; each payment intent is a retained collection attempt. Decline permits a new attempt or cancellation. Uncertain payment blocks both until resolved. Success marks the purchase paid and clears accepted cart items. `PaymentProvider` receives a stable intent ID for external deduplication.

`PromotionProvider` coordinates reserve, commit, redeem, and release. Confirmed receipts alone update the aggregate. Commitment precedes purchase creation, redemption follows successful payment, and removal, cancellation, or failed acceptance releases the reservation. The promotion machine handles pending checkouts sequentially and freezes each receipt command before dispatch.

Shopping keeps V2 active and registers the machines in its System. Its V3 composition upgrades quantity-dependent public contracts and payment completion from the V2 declarations. See the [consumer type fixture](src/consumer.typecheck.ts), [contract lifecycle tests](src/lifecycle.node.spec.ts), and [Workerd lifecycle](../system-worker/src/AggregateActorVersionRepo/machinePurchase.workerd.spec.ts).

Changed model and fixed schemas require empty affected development storage.
