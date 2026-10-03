import * as sdk from '@zerospin/sdk/browser';

import { purchaseV1 } from '../purchase/PurchaseV1';
export const purchaseItem = sdk.defineModel({
  name: 'purchaseItem',
  abbreviation: 'pit',
});
export const purchaseItemV1 = sdk.makeModelVersion(purchaseItem, {
  version: '1.0.0',
  indexes: [],
  attributes: {
    purchaseId: sdk.primitives.ref({
      nullable: false,
      table: purchaseV1.table,
      relation: 'purchase',
      inverse: 'items',
    }),
    productId: sdk.primitives.foreignKey({ abbreviation: 'prd' }),
    name: sdk.primitives.text(),
    price: sdk.primitives.integer(),
    quantity: sdk.primitives.integer(),
  },
});
