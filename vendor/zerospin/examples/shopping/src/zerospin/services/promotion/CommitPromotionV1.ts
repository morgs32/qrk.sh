import * as sdk from '@zerospin/sdk/browser';
import { Clock, Effect, Schema } from 'effect';

import { PromotionDevelopment } from '../../PromotionDevelopment';

import { promotionId, promotionReservationV1 } from './models';

export const commitPromotion = sdk.makeContractVersion(
  sdk.defineContract('commitPromotion'),
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
    guard: Effect.fn('commitPromotion.guard')(function* ({
      failures,
      payload,
      queryDb,
    }) {
      yield* yield* PromotionDevelopment;
      const row = queryDb.query.promotionReservation
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
      if (payload.purchaseId === null) {
        return yield* failures.conflict.make({
          message: 'A purchase is required.',
        });
      }
      if (
        (row.status === 'committed' || row.status === 'redeemed') &&
        row.purchaseId === payload.purchaseId
      ) {
        return;
      }
      if (
        row.status !== 'reserved' ||
        row.expiresAt <= (yield* Clock.currentTimeMillis)
      ) {
        return yield* failures.conflict.make({
          message:
            'The reservation expired or is no longer available. Cancel this purchase and apply again.',
        });
      }
      return;
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
        if (
          (row.status === 'committed' || row.status === 'redeemed') &&
          row.purchaseId === payload.purchaseId
        ) {
          return [];
        }
        return [
          yield* models.promotionReservation.update({
            resourceId: payload.id,
            attributes: { status: 'committed', purchaseId: payload.purchaseId },
          }),
        ];
      }),
  },
);
