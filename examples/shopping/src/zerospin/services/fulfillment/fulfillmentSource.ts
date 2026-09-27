import { makeFulfillmentModelV1 } from '@zerospin/fulfillment/browser';
export const fulfillmentSource = {
  name: 'fulfillment' as const,
  version: '1.0.0' as const,
  models: { fulfillment: makeFulfillmentModelV1() },
};
