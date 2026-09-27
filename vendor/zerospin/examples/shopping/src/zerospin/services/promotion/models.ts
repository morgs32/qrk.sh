import * as sdk from '@zerospin/sdk/browser';

export const promotionReservationV1 = sdk.makeModelVersion(
  sdk.defineModel({ name: 'promotionReservation', abbreviation: 'prv' }),
  {
    version: '1.0.0',
    attributes: {
      promotionId: sdk.primitives.text(),
      aggregateId: sdk.primitives.text(),
      cartId: sdk.primitives.text(),
      expiresAt: sdk.primitives.integer(),
      purchaseId: sdk.primitives.text({ nullable: true }),
      status: sdk.primitives.enum({
        values: ['reserved', 'committed', 'released', 'redeemed', 'denied'],
      }),
    },
    indexes: [],
  },
);
export const promotionId = 'half-off';
export const promotionCapacity = 100;
export const promotionDuration = 10 * 60 * 1000;
