/**
 * Declare primitives inline at every use site; never assign a primitive descriptor
 * to a variable. This applies to application code, framework code, and fixtures.
 * Reuse an Effect schema when needed, but inline its primitives.json wrapper.
 * Tests that inspect or mutate an authored shape should access its properties.
 *
 * @bad const purchaseId = sdk.primitives.foreignKey({ abbreviation: purchaseV1.abbreviation });
 * @bad const expectedPurchase = sdk.primitives.json({ schema: ExpectedPurchaseSchema });
 */
const requestPayment = sdk.makeContractVersion(identity, {
  payload: {
    purchaseId: sdk.primitives.foreignKey({
      abbreviation: purchaseV1.abbreviation,
    }),
    expected: sdk.primitives.json({ schema: ExpectedPurchaseSchema }),
  },
});
