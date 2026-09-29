# Fulfillment proof package

`@zerospin/fulfillment/server` builds versioned service declarations. The service factory returns models and contracts for requesting, packing, and shipping. Its warehouse option adds `warehouseCode` and can extend or replace `markPacked`. Packing and shipment contracts recheck authoritative service state. The optional `makeFulfillmentShippingMachine` observes packed service rows, obtains `Carrier` from the System Effect runtime, and submits a guarded `markShipped` command.

`@zerospin/fulfillment/browser` exports portable models and a pinned frontend read replica without carrier or service execution code. Service compositions install complete `{ models, contracts }` bundles with `makeService`.

## Aggregate purchase fulfillment

`makeFulfillmentFrontendModule` returns the fulfillment replica, persisted `fulfillmentOperation` model, and public `requestPacking` and `requestShipping` contracts. `makeFulfillmentModule` adds guarded `enrollFulfillment` and `recordFulfillmentOperation` completion contracts. The aggregate's machine actors call `FulfillmentClient` with a stable `purchase:<id>` request key, enroll the confirmed service row, and record each Pack or Ship operation outcome. Provider uncertainty leaves an operation requested. The purchase remains paid through fulfillment.

Shopping registers `makePaidFulfillmentMachine` and `makeFulfillmentOperationMachine` against its shopper aggregate. Manual service Pack and Ship contracts remain authoritative; the separate service fixture registers automatic shipping. See [server.ts](src/server.ts), [consumer.typecheck.ts](src/consumer.typecheck.ts), and the [Workerd purchase lifecycle](../system-worker/src/AggregateActorVersionRepo/machinePurchase.workerd.spec.ts).

Changed fixed schemas require empty affected development storage.
