/**
 * List every model explicitly in each authored models object where it is used.
 * Reference the individual model definitions directly, including in guards,
 * contracts, actor databases, sessions, aggregates, services, and fixtures.
 * Attach aggregate and service declarations through a plain module bundle.
 * List model dependencies explicitly in each contract, guard, and actor database.
 *
 * @bad Hoist a model map such as commonModels or purchaseGuardModels and pass it around.
 * @bad Spread model maps, including another declaration's models, into a models object.
 * @bad Reuse another declaration's entire models object as an authored dependency list.
 * @bad Repeat a bundle model in a second aggregate registration path.
 */
const checkPurchase = makeGuard({
  models: {
    cart: cartV1,
    user: userV1,
    purchase: purchaseV1,
    purchaseItem: purchaseItemV1,
    product: productReplicaV1,
    cartPromotion: cartPromotionV1,
  },
  payload: PurchaseCheckSchema,
  identity: shopperIdentitySchema,
  program: checkPurchaseProgram,
});
