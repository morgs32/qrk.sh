# Fulfillment proof package

`@zerospin/fulfillment/server` builds complete service declarations. The default factory returns the fulfillment model, request and packing contracts, and a `ship` automation. The warehouse option adds a required `warehouseCode` with an authored initialization default, and can extend or replace `markPacked`. The default shipping handler obtains `Carrier` from the system Effect runtime. A replacement handler infers its own Effect requirements. Packing and shipment completion recheck the expected authoritative state. Unsupported customization and simultaneous `extend`/`replace` options fail at construction. The requester helper uses a stable domain request ID, looks up an existing row before and after submission, and rejects mismatched correlation.

`@zerospin/fulfillment/browser` exports portable model declarations and `makeUserFrontendModuleV1` for a pinned read replica. The browser entrypoint has no carrier or service execution code. `makeUserAggregateModuleV1` in the server entrypoint binds the same selected source model and service version for aggregate enrollment. `makeUserActorModuleV1` calls an application selection callback against its final combined actor database and identity.

The service module factory returns plain `{ models, contracts, automations }` collections. The application installs each complete composition with `makeService({ name: 'fulfillment', module: { [version]: bundle } })`. Its recipe name and the service composition version are separate.

See [server.ts](src/server.ts), [browser.ts](src/browser.ts), and [consumer.typecheck.ts](src/consumer.typecheck.ts). The package's node tests cover customization, older payload adaptation, and request deduplication. The [worker test](../../packages/system-worker/src/ServiceActorVersionRepo/automations/fulfillment.workerd.spec.ts) verifies both service versions materialize older commands, warehouse initialization, and a carrier-backed shipping automation.

## Aggregate purchase fulfillment

`makeFulfillmentFrontendModule` accepts the canonical host purchase/user/cart models, a pinned service source model, and an application ownership resolver. It returns the fulfillment replica, a persisted `fulfillmentOperation` model, and public `requestPacking` / `requestShipping` commands. Requests check paid-purchase ownership, the required fulfillment stage, and competing pending operations.

`makeFulfillmentModule` reuses those exact declarations and binds successful payment to a stable `purchase:<id>` request. `FulfillmentClient`, provided by the application, uses trusted service admission, execution completion, and authored queries. Guarded enrollment verifies user, aggregate, purchase, and request correlation. Pack/Ship automations record confirmed outcomes on their operation instances; transport uncertainty leaves the operation requested. A retry after confirmed rejection creates a new instance. Existing service subscriptions update enrolled replicas. The purchase remains paid throughout fulfillment.

Shopping installs the default service contracts with an empty automation map, so packing and shipping are manual. The warehouse/automatic-shipping recipe remains available to its separate service fixture. The browser counterpart exports no service writer, provider, or completion contracts.

The new operation model and purchase composition require empty affected development storage. No automatic reset or translation migration is performed.
