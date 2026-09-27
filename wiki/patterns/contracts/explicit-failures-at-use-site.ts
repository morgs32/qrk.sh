/**
 * Declare errors directly in an inline failures record with camelCase keys.
 * Guards and programs receive the record; shared checks accept constructors
 * through arguments. Error codes, not record keys, identify wire failures.
 * Omit extra to use Schema.Null; .make() then fills in extra: null.
 * Custom extra schemas still require their decoded value when constructing errors.
 *
 * @bad failure: Schema.Union([...]) or a shared error schema constant.
 * @bad Shared failures-map aliases, spreads, or union-building wrappers.
 * @bad PascalCase keys such as failures.PurchaseNotFound.
 */
const createPaymentIntent = makeContractVersion(identity, {
  failures: {
    purchaseNotFound: ContractError.schema({ code: 'purchase-not-found' }),
    stateChanged: AggregateError.schema({
      code: 'shopping-state-changed',
      extra: Schema.Struct({ reason: Schema.String }),
    }),
  },
  guard: Effect.fn('createPaymentIntent.guard')(function* ({ failures }) {
    if (!purchaseExists()) yield* failures.purchaseNotFound.make();
  }),
});
