import * as sdk from '@zerospin/sdk/browser';
export const purchase = sdk.defineModel({
  name: 'purchase',
  abbreviation: 'pur',
});
export const purchaseV1 = sdk.makeModelVersion(purchase, {
  version: '1.0.0',
  attributes: { total: sdk.primitives.integer() },
  indexes: [],
});
