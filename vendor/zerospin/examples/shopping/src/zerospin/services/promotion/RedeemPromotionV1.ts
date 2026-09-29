import * as sdk from '@zerospin/sdk/browser';
import { Effect, Schema } from 'effect';

import { PromotionDevelopment } from '../../PromotionDevelopment';

import { promotionId, promotionReservationV1 } from './models';

export const redeemPromotion = sdk.makeContractVersion(
  sdk.defineContract('redeemPromotion'),
  {
    version: '1.0.0',
    payload: {
      id: sdk.primitives.foreignKey({ abbreviation: 'prv' }),
      aggregateId: sdk.primitives.text(),
      cartId: sdk.primitives.text(),
      purchaseId: sdk.primitives.text({ nullable: true }),
      expected: sdk.primitives.json({
        nullable: true,
        schema: Schema.Struct({
          status: Schema.Literals([
            'reserved',
            'committed',
            'released',
            'redeemed',
            'denied',
          ]),
          purchaseId: Schema.NullOr(Schema.String),
        }),
      }),
    },
    failures: {
      conflict: sdk.ContractError.schema({ code: 'promotion-conflict' }),
    },
    models: { promotionReservation: promotionReservationV1 },
    guard: Effect.fn('redeemPromotion.guard')(function* ({
      failures,
      payload,
      db,
    }) {
      yield* yield* PromotionDevelopment;
      const row = db.query.promotionReservation
        .findFirst({ where: { id: { eq: payload.id } } })
        .sync();
      if (
        (row === undefined) !== (payload.expected === null) ||
        (row &&
          (row.status !== payload.expected?.status ||
            row.purchaseId !== payload.expected.purchaseId))
      ) {
        return yield* failures.conflict.make({
          message: 'Reservation state changed. Retry the action.',
        });
      }
      if (
        !row ||
        row.aggregateId !== payload.aggregateId ||
        row.cartId !== payload.cartId
      ) {
        return yield* failures.conflict.make({
          message: 'Reservation not found for this cart.',
        });
      }
      if (row.purchaseId !== payload.purchaseId) {
        return yield* failures.conflict.make({
          message: 'Purchase identity conflicts.',
        });
      }
      if (row.status !== 'committed' && row.status !== 'redeemed') {
        return yield* failures.conflict.make({
          message: 'Only a committed reservation can be redeemed.',
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        const row = payload.expected;
        if (row === null) {
          return [
            yield* models.promotionReservation.create({
              resourceId: payload.id,
              attributes: {
                promotionId,
                aggregateId: payload.aggregateId,
                cartId: payload.cartId,
                expiresAt: 0,
                purchaseId: null,
                status: 'released',
              },
            }),
          ];
        }
        return row.status === 'redeemed'
          ? []
          : [
              yield* models.promotionReservation.update({
                resourceId: payload.id,
                attributes: { status: 'redeemed' },
              }),
            ];
      }),
  },
);
