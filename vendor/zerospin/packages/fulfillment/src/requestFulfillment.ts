import { makeZerospinError, type IAnyError } from '@zerospin/error';
import '@zerospin/server-only';
import { Effect, Result, Schema } from 'effect';

export type IFulfillmentRequest = Readonly<{
  requestId: string;
  purchaseId: string;
  userId: string;
  aggregateId: string;
  serviceVersion: string;
}>;

type ICorrelatedFulfillment = Readonly<{
  id: `ful_${string}`;
  requestId: string;
  purchaseId: string;
  userId: string;
  aggregateId: string;
}>;

const stableId = <PREFIX extends 'cmd' | 'ful'>(
  prefix: PREFIX,
  requestId: string,
) =>
  Schema.decodeUnknownSync(
    Schema.TemplateLiteral([prefix, '_', Schema.String]),
  )(
    `${prefix}_${Array.from(new TextEncoder().encode(requestId), byte =>
      byte.toString(16).padStart(2, '0'),
    ).join('')}`,
  );

/** A provider reads by domain request ID around one stable service command. */
export const makeFulfillmentRequester = <
  ROW extends ICorrelatedFulfillment,
  E extends IAnyError,
  R,
>(ports: {
  findByRequestId: (requestId: string) => Effect.Effect<ROW | null, E, R>;
  submit: (
    props: IFulfillmentRequest & {
      commandId: `cmd_${string}`;
      fulfillmentId: `ful_${string}`;
    },
  ) => Effect.Effect<void, E, R>;
}) =>
  Effect.fn('fulfillment.request')(function* (request: IFulfillmentRequest) {
    const correlated = (row: ROW) =>
      row.requestId === request.requestId &&
      row.purchaseId === request.purchaseId &&
      row.userId === request.userId &&
      row.aggregateId === request.aggregateId;
    const before = yield* ports.findByRequestId(request.requestId);
    if (before !== null) {
      if (!correlated(before)) {
        return yield* makeZerospinError('fulfillment-request-conflict');
      }
      return before;
    }
    const submitted = yield* ports
      .submit({
        ...request,
        commandId: stableId('cmd', request.requestId),
        fulfillmentId: stableId('ful', request.requestId),
      })
      .pipe(Effect.result);
    const after = yield* ports.findByRequestId(request.requestId);
    if (after !== null) {
      if (!correlated(after)) {
        return yield* makeZerospinError('fulfillment-request-conflict');
      }
      return after;
    }
    if (Result.isFailure(submitted)) {
      return yield* Effect.fail(submitted.failure);
    }
    return yield* makeZerospinError('fulfillment-request-result-missing');
  });
