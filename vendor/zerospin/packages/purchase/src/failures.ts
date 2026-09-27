import { AggregateError } from '@zerospin/error';
export const purchaseStateConflict = AggregateError.schema({
  code: 'purchase-state-conflict',
});
