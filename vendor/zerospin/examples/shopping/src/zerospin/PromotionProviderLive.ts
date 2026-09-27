import { makeZerospinError } from '@zerospin/error';
import { PromotionProvider } from '@zerospin/purchase/server';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';

import { PromotionDevelopment } from './PromotionDevelopment';
import {
  promotionCapacity,
  promotionDuration,
  promotionReservationV1,
} from './services/promotion/models';
import { promotionService } from './services/promotion/promotionService';
import { trustedService } from './services/trustedService';
const ledgerSchema = Schema.Struct({
  now: Schema.Number,
  reservations: Schema.Array(
    Schema.toType(promotionReservationV1.resourceSchema),
  ),
});
export const PromotionProviderLive = Layer.effect(
  PromotionProvider,
  Effect.gen(function* () {
    const development = yield* PromotionDevelopment;
    return Effect.fn('shopping.coordinatePromotion')(function* (request) {
      yield* development;
      const service = yield* trustedService(
        'promotion',
        '1.0.0',
        promotionService.versions['1.0.0'].contracts,
      );
      while (true) {
        const ledger = yield* service.query('ledger', {}).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(ledgerSchema)),
          Effect.mapError(() =>
            makeZerospinError('promotion-ledger-unavailable'),
          ),
        );
        const row = ledger.reservations.find(
          row => row.id === request.reservationId,
        );
        if (
          row !== undefined &&
          (row.aggregateId !== request.aggregateId ||
            row.cartId !== request.cartId ||
            (request.action !== 'reserve' &&
              row.purchaseId !== null &&
              row.purchaseId !== request.purchaseId))
        ) {
          return {
            kind: 'rejected' as const,
            reason: 'Promotion identity conflicts.',
          };
        }
        const desired = {
          reserve: 'reserved',
          commit: 'committed',
          release: 'released',
          redeem: 'redeemed',
        }[request.action];
        if (
          row !== undefined &&
          (row.status === desired ||
            (request.action === 'reserve' && row.status === 'denied') ||
            (request.action === 'commit' && row.status === 'redeemed'))
        ) {
          return {
            kind: 'confirmed' as const,
            receipt: {
              status: row.status,
              expiresAt: row.expiresAt,
              purchaseId:
                row.purchaseId === null
                  ? null
                  : Schema.decodeUnknownSync(makeAbbreviationIdSchema('pur'))(
                      row.purchaseId,
                    ),
            },
          };
        }
        if (
          (request.action === 'commit' &&
            (row?.status !== 'reserved' || row.expiresAt <= ledger.now)) ||
          (request.action === 'redeem' && row?.status !== 'committed') ||
          (request.action === 'release' && row?.status === 'redeemed') ||
          (request.action === 'reserve' && row !== undefined)
        ) {
          return {
            kind: 'rejected' as const,
            reason: 'The promotion expired or is no longer available.',
          };
        }
        const payload = {
          id: request.reservationId,
          aggregateId: request.aggregateId,
          cartId: request.cartId,
          purchaseId: request.purchaseId,
          expected:
            row === undefined
              ? null
              : { status: row.status, purchaseId: row.purchaseId },
        };
        const result = yield* service.execute(
          `${request.action}Promotion`,
          request.action === 'reserve'
            ? {
                ...payload,
                available:
                  ledger.reservations.filter(
                    row =>
                      row.status === 'committed' ||
                      row.status === 'redeemed' ||
                      (row.status === 'reserved' && row.expiresAt > ledger.now),
                  ).length < promotionCapacity,
                expiresAt: ledger.now + promotionDuration,
              }
            : payload,
        );
        if (result.admission.status === 'failed') {
          return yield* makeZerospinError('promotion-admission-failed');
        }
        if (result.execution.status === 'skipped') {
          return yield* makeZerospinError('promotion-result-unresolved');
        }
        // A concurrent reservation can invalidate expected state or capacity. Refresh the owner query before retrying.
        if (result.execution.status === 'failed') {
          if (result.execution.failure.code !== 'promotion-conflict') {
            return yield* makeZerospinError({
              code: 'promotion-execution-failed',
              message: result.execution.failure.message,
            });
          }
          yield* Effect.sleep('25 millis');
        }
      }
    });
  }),
);
