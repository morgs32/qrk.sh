import * as sdk from '@zerospin/sdk/browser';

const fulfillmentIdentity = sdk.defineModel({
  name: 'fulfillment',
  abbreviation: 'ful',
});

const baseAttributes = {
  requestId: sdk.primitives.text(),
  aggregateId: sdk.primitives.text(),
  userId: sdk.primitives.text(),
  purchaseId: sdk.primitives.text(),
  status: sdk.primitives.enum({ values: ['requested', 'packed', 'shipped'] }),
  trackingId: sdk.primitives.text({ nullable: true }),
};

/** Build independent declaration history for each service composition. */
export const makeFulfillmentModelV1 = () =>
  sdk.makeModelVersion(fulfillmentIdentity, {
    version: '1.0.0',
    attributes: baseAttributes,
    indexes: [
      { name: 'fulfillment_request', columns: ['requestId'], unique: true },
      { name: 'fulfillment_user', columns: ['userId'] },
    ],
  });

export const makeFulfillmentModelWithWarehouse = <const VERSION extends string>(
  version: VERSION,
) =>
  sdk.upgradeModelVersion(makeFulfillmentModelV1(), {
    version,
    attributes: { warehouseCode: sdk.primitives.text() },
    indexes: [
      { name: 'fulfillment_request', columns: ['requestId'], unique: true },
      { name: 'fulfillment_user', columns: ['userId'] },
    ],
  });
