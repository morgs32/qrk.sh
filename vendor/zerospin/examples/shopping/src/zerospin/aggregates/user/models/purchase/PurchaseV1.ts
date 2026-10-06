import * as sdk from '@zerospin/sdk/browser';
export const purchase = sdk.defineModel({
  name: 'purchase',
  abbreviation: 'pur',
});
export const purchaseV1 = sdk.makeModelVersion(purchase, {
  version: '1.0.0',
  attributes: {
    total: sdk.primitives.integer(),
    paymentState: sdk.primitives.enum({
      values: ['pending', 'paid', 'declined'],
    }),
    paymentReference: sdk.primitives.text({ nullable: true }),
    paymentEvidence: sdk.primitives.text({ nullable: true }),
    labelState: sdk.primitives.enum({ values: ['none', 'requested', 'ready'] }),
    labelReference: sdk.primitives.text({ nullable: true }),
    trackingNumber: sdk.primitives.text({ nullable: true }),
    trackingStatus: sdk.primitives.enum({
      nullable: true,
      values: ['pre_transit', 'in_transit', 'delivered'],
    }),
    trackingRefreshSequence: sdk.primitives.integer(),
    trackingRefreshPending: sdk.primitives.boolean(),
  },
  indexes: [],
});
