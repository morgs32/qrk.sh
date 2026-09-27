import { makeZerospinError } from '@zerospin/error';
import { FulfillmentClient } from '@zerospin/fulfillment/server';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Layer, Schema } from 'effect';

import { fulfillmentService } from './services/fulfillment/fulfillmentService';
import { fulfillmentSource } from './services/fulfillment/fulfillmentSource';
import { trustedService } from './services/trustedService';
const rowSchema = Schema.NullOr(
  Schema.toType(fulfillmentSource.models.fulfillment.resourceSchema),
);
const fulfillmentId = (requestId: string) =>
  Schema.decodeUnknownSync(makeAbbreviationIdSchema('ful'))(
    `ful_${Array.from(new TextEncoder().encode(requestId), byte => byte.toString(16).padStart(2, '0')).join('')}`,
  );
export const FulfillmentClientLive = Layer.succeed(FulfillmentClient, {
  request: request =>
    Effect.gen(function* () {
      const service = yield* trustedService(
        'fulfillment',
        request.serviceVersion,
        fulfillmentService.versions['1.0.0'].contracts,
      );
      const read = () =>
        service.query('byRequest', { requestId: request.requestId }).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(rowSchema)),
          Effect.mapError(() =>
            makeZerospinError('fulfillment-query-unavailable'),
          ),
        );
      let row = yield* read();
      if (row === null) {
        const result = yield* service.execute('requestFulfillment', {
          requestId: request.requestId,
          purchaseId: request.purchaseId,
          userId: request.userId,
          aggregateId: request.aggregateId,
          fulfillmentId: fulfillmentId(request.requestId),
        });
        row = yield* read();
        if (row === null && result.execution.status === 'failed') {
          return {
            kind: 'rejected' as const,
            reason: result.execution.failure.message,
          };
        }
      }
      if (row === null) {
        return yield* makeZerospinError('fulfillment-result-unresolved');
      }
      if (
        row.requestId !== request.requestId ||
        row.purchaseId !== request.purchaseId ||
        row.userId !== request.userId ||
        row.aggregateId !== request.aggregateId
      ) {
        return {
          kind: 'rejected' as const,
          reason: 'Fulfillment request identity conflicts.',
        };
      }
      return { kind: 'confirmed' as const, fulfillment: row };
    }),
  operate: request =>
    Effect.gen(function* () {
      const service = yield* trustedService(
        'fulfillment',
        request.serviceVersion,
        fulfillmentService.versions['1.0.0'].contracts,
      );
      const read = () =>
        service.query('byRequest', { requestId: request.requestId }).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(rowSchema)),
          Effect.mapError(() =>
            makeZerospinError('fulfillment-query-unavailable'),
          ),
        );
      let row = yield* read();
      const matches = (value: NonNullable<typeof row>) =>
        value.id === request.fulfillmentId &&
        value.requestId === request.requestId &&
        value.userId === request.userId &&
        value.purchaseId === request.purchaseId &&
        value.aggregateId === request.aggregateId;
      if (row === null || !matches(row)) {
        return {
          kind: 'rejected' as const,
          reason: 'Fulfillment ownership or correlation changed.',
        };
      }
      const done = (value: NonNullable<typeof row>) =>
        request.action === 'pack'
          ? value.status === 'packed' || value.status === 'shipped'
          : value.status === 'shipped';
      if (done(row)) return { kind: 'confirmed' as const, fulfillment: row };
      const result = yield* service.execute(
        request.action === 'pack' ? 'markPacked' : 'markShipped',
        request.action === 'pack'
          ? { fulfillmentId: row.id }
          : { fulfillmentId: row.id, trackingId: `simulated_${row.id}` },
        Schema.decodeUnknownSync(makeAbbreviationIdSchema('cmd'))(
          `cmd_${request.operationId}`,
        ),
      );
      row = yield* read();
      if (row !== null && matches(row) && done(row)) {
        return { kind: 'confirmed' as const, fulfillment: row };
      }
      if (result.execution.status === 'failed') {
        return {
          kind: 'rejected' as const,
          reason: result.execution.failure.message,
        };
      }
      return yield* makeZerospinError('fulfillment-operation-unresolved');
    }),
});
