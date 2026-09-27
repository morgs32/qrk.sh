import { makeZerospinError } from '@zerospin/error';
import { makeRpcEnvelope } from '@zerospin/logger';
import { Effect } from 'effect';

/**
 * Internal RPC uses makeRpcEnvelope and readRpcEnvelope for { result, telemetry }.
 * External APIs persist telemetry and return { result, link }; a failed telemetry
 * write leaves the settled domain result intact and produces no link.
 *
 * Results contain success values and explicitly serialized JSON failures. A rejected Promise
 * remains distinct from a resolved Failure. Persisted business failures retain
 * their original codec version and bytes separately from adapted delivery.
 *
 * The spec 005 target restores local yieldable Errors and keeps stack and
 * diagnostic cause out of result/API failures. Boundary serializers select
 * permitted fields and preserve schema-encoded business scope/extra. getApi
 * propagates JSON failures without reconstructing custom prototypes.
 * Name the outcome boundary helpers encodeRpcOutcome and decodeRpcOutcome.
 * An outcome includes success or failure. Encoding serializes the failure;
 * decoding exposes the outcome through Effect without reconstructing a remote
 * Error instance. These replace settleResult/readResult in the planned design.
 * This migration is planned; existing pass-through settlement is superseded.
 *
 * @bad Pass a raw runtime Error through an envelope or rely on native Error transport.
 * @bad Remove stack while still exposing diagnostic stack text in cause.
 * @bad Replace a valid domain outcome with a telemetry persistence failure.
 * @bad Treat a rejected Promise as though it were a resolved Failure.
 */
export const refused = Effect.fail(
  makeZerospinError({ code: 'access-denied', message: 'Access denied' }),
).pipe(Effect.withSpan('refused'), makeRpcEnvelope);
