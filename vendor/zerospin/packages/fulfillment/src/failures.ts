import { AggregateError } from '@zerospin/error';
export const fulfillmentStateConflict = AggregateError.schema({
  code: 'fulfillment-state-conflict',
});
