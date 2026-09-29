import * as sdk from '@zerospin/sdk/browser';
import { Clock, Effect, Schema } from 'effect';

import { PromotionDevelopment } from '../../PromotionDevelopment';

import {
  promotionCapacity,
  promotionDuration,
  promotionId,
  promotionReservationV1,
} from './models';

export const reservePromotion = sdk.makeContractVersion(
  sdk.defineContract('reservePromotion'),
  {
    version: '1.0.0',
    failures: {
      conflict: sdk.ContractError.schema({ code: 'promotion-conflict' }),
    },
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
      available: sdk.primitives.boolean(),
      expiresAt: sdk.primitives.integer(),
    },
    models: { promotionReservation: promotionReservationV1 },
    guard: Effect.fn('reservePromotion.guard')(function* ({
      failures,
      db,
      payload,
    }) {
      yield* yield* PromotionDevelopment;
      const now = yield* Clock.currentTimeMillis;
      if (
        payload.expected === null &&
        (!Number.isSafeInteger(payload.expiresAt) ||
          payload.expiresAt <= now ||
          payload.expiresAt > now + promotionDuration)
      ) {
        return yield* failures.conflict.make({
          message: 'Reservation deadline is no longer valid.',
        });
      }
      const rows = db.query.promotionReservation.findMany().sync();
      const existing = rows.find(row => row.id === payload.id);
      if ((existing === undefined) !== (payload.expected === null)) {
        return yield* failures.conflict.make({
          message: 'Reservation state changed. Retry the action.',
        });
      }
      if (existing) {
        if (
          existing.cartId !== payload.cartId ||
          existing.aggregateId !== payload.aggregateId ||
          payload.purchaseId !== null
        ) {
          return yield* failures.conflict.make({
            message: 'Reservation identity conflicts.',
          });
        }
        return;
      }
      if (payload.purchaseId !== null) {
        return yield* failures.conflict.make({
          message: 'Reserve a cart before committing a purchase.',
        });
      }
      if (
        rows.some(
          row =>
            row.aggregateId === payload.aggregateId &&
            row.cartId === payload.cartId &&
            (row.status === 'committed' ||
              (row.status === 'reserved' && row.expiresAt > now)),
        )
      ) {
        return yield* failures.conflict.make({
          message: 'This cart already has an active reservation.',
        });
      }
      const used = rows.filter(
        row =>
          row.status === 'committed' ||
          row.status === 'redeemed' ||
          (row.status === 'reserved' && row.expiresAt > now),
      ).length;
      if (payload.available !== used < promotionCapacity) {
        return yield* failures.conflict.make({
          message: 'Promotion capacity changed. Retry the action.',
        });
      }
    }),
    program: ({ payload, models }) =>
      Effect.gen(function* () {
        if (payload.expected !== null) return [];
        return [
          yield* models.promotionReservation.create({
            resourceId: payload.id,
            attributes: {
              promotionId,
              aggregateId: payload.aggregateId,
              cartId: payload.cartId,
              purchaseId: null,
              expiresAt: payload.expiresAt,
              status: payload.available ? 'reserved' : 'denied',
            },
          }),
        ];
      }),
  },
);
