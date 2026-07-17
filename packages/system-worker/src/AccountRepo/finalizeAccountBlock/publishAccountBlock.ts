/*
 * System-worker annotation:
 * Publishes one account block to AccountBlockRepo and returns the block row
 * with any final publish failure.
 */

import type { Async } from '@zerospin/core/async/Async';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { Effect, Either, Option, Schedule, Schema } from 'effect';

import { getAccountBlockRepo } from '../../AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo.js';
import type { IAccountBlock, IAccountBlockOutboxRecord } from '../../types.js';

export const publishAccountBlock = Effect.fn('AccountRepo.publishAccountBlock')(
  function* (props: {
    generationId: string;
    accountBlock: IAccountBlock;
    accountId: string;
    accountName: string;
  }): Effect.fn.Return<IAccountBlockOutboxRecord, IAnyError, Async> {
    const { generationId, accountBlock, accountId, accountName } = props;
    const accountBlockRepo = yield* getAccountBlockRepo({
      key: {
        generationId,
        accountId,
        accountName,
      },
    });
    const tracedAccountBlockRepo = makeTraceableRpcTarget(accountBlockRepo);
    const maybeCollector = yield* Effect.serviceOption(TelemetryCollector);
    const collector = Option.getOrElse(maybeCollector, makeTelemetryCollector);
    const publication = tracedAccountBlockRepo.publish(accountBlock).pipe(
      Effect.provideService(TelemetryCollector, collector),
      Effect.mapError(errorJson =>
        errorJson instanceof Error
          ? new ZerospinError({
              code: 'account-block-publish-rpc-failed',
              message: errorJson.message,
              cause: ZerospinError.prettyUnknownFailure(errorJson),
            })
          : Schema.decodeUnknownSync(ZerospinError.schema)(errorJson),
      ),
    );
    const published = yield* publication.pipe(
      Effect.retry({
        times: 3,
        schedule: Schedule.exponential(250, 2),
      }),
      Effect.either,
    );

    if (Either.isRight(published)) {
      return {
        ...accountBlock,
        failure: null,
        publishedAt: new Date(),
      };
    }

    return {
      ...accountBlock,
      failure: published.left,
      publishedAt: null,
    };
  },
);
