/*
 * System-worker annotation:
 * Publishes one owned aggregate block to AggregateBlockRepo and returns the block row
 * with any final publish failure.
 */

import type { Async } from '@zerospin/core/async/Async';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Option, Schema } from 'effect';

import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import type { IAggregateBlock } from '../../types.js';

export const publishAggregateBlock = Effect.fn(
  'AggregateRepo.publishAggregateBlock',
)(function* (props: {
  generationId: string;
  aggregateBlock: IAggregateBlock;
  aggregateId: string;
  aggregateName: string;
}): Effect.fn.Return<void, IAnyError, Async> {
  const { generationId, aggregateBlock, aggregateId, aggregateName } = props;
  const aggregateBlockRepo = yield* getAggregateBlockRepo({
    key: {
      generationId,
      aggregateId,
      aggregateName,
    },
  });
  const tracedAggregateBlockRepo = makeTraceableRpcTarget(aggregateBlockRepo);
  const maybeCollector = yield* Effect.serviceOption(TelemetryCollector);
  const collector = Option.getOrElse(maybeCollector, makeTelemetryCollector);
  return yield* tracedAggregateBlockRepo.publish(aggregateBlock).pipe(
    Effect.provideService(TelemetryCollector, collector),
    Effect.mapError(errorJson =>
      errorJson instanceof Error
        ? new ZerospinError({
            code: 'aggregate-block-publish-rpc-failed',
            message: errorJson.message,
            cause: ZerospinError.prettyUnknownFailure(errorJson),
          })
        : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
    ),
  );
});
