import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import type { IDb } from '@zerospin/core/drizzle/types';
import type {
  IAggregateCursor,
  IAnyDrizzleSchemas,
  IModel,
} from '@zerospin/core/models/types';
import type { CuidFactory } from '@zerospin/core/services/CuidFactory';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import { getAggregateBlockRepo } from '../../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import {
  getLastAggregateCursor,
  getLastAggregateIndex,
} from '../../getLastAggregateCursor/getLastAggregateCursor.js';
import { handleAggregateBlocks } from '../handleAggregateBlocks/handleAggregateBlocks.js';

/** Rebuilds the local projection from ordered AggregateBlockRepo batches. */
export const catchup = Effect.fn('AggregateFrontendRepo.catchup')(
  function* (props: {
    db: IDb;
    aggregateFrontendRepoSchema: IAnyDrizzleSchemas &
      Record<`aggregateSource_${string}`, IModel['drizzleSchema']>;
    key: {
      generationId: string;
      aggregateId: string;
      aggregateName: string;
      userId: string;
      frontendName: string;
    };
    storage: DurableObjectStorage;
  }): Effect.fn.Return<
    Readonly<{
      lastAggregateCursor: IAggregateCursor | null;
      aggregateIndex: number | null;
    }>,
    IAnyError,
    Async | CuidFactory
  > {
    const { db, aggregateFrontendRepoSchema, key, storage } = props;
    const aggregateBlockRepo = yield* getAggregateBlockRepo({
      key: {
        generationId: key.generationId,
        aggregateId: key.aggregateId,
        aggregateName: key.aggregateName,
      },
    });
    let lastAggregateCursor: IAggregateCursor | null =
      yield* getLastAggregateCursor({
        storage,
        defaultValue: null,
      });
    let aggregateIndex: number | null = yield* getLastAggregateIndex({
      storage,
      defaultValue: null,
    });
    if ((lastAggregateCursor === null) !== (aggregateIndex === null)) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-catchup-watermark-incomplete',
        message:
          'AggregateFrontendRepo catch-up requires cursor and index to both be null or both be present',
      });
    }

    while (true) {
      const encodedBatch = yield* makeAsync(() =>
        aggregateBlockRepo.getReplayBlocks({
          afterAggregateCursor: lastAggregateCursor,
          afterAggregateIndex: aggregateIndex,
        }),
      );
      const batch = yield* decodeRpc(encodedBatch);
      const lastBlock = batch.blocks[batch.blocks.length - 1];
      if (lastBlock === undefined) {
        if (batch.lastAvailableAggregateCursor !== lastAggregateCursor) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-catchup-blocks-missing',
            message:
              'AggregateBlockRepo returned no replay blocks before its last available cursor',
            extra: {
              lastAggregateCursor,
              lastAvailableAggregateCursor: batch.lastAvailableAggregateCursor,
              aggregateIndex,
            },
          });
        }
        return { lastAggregateCursor, aggregateIndex };
      }

      let previousAggregateIndex: number | null = aggregateIndex;
      for (const block of batch.blocks) {
        if (
          previousAggregateIndex !== null &&
          block.aggregateIndex <= previousAggregateIndex
        ) {
          return yield* new ZerospinError({
            code: 'aggregate-frontend-catchup-order-invalid',
            message: 'Aggregate replay blocks must be strictly ascending',
            extra: {
              previousAggregateIndex,
              blockAggregateIndex: block.aggregateIndex,
            },
          });
        }
        previousAggregateIndex = block.aggregateIndex;
      }

      yield* handleAggregateBlocks({
        blocks: batch.blocks,
        db,
        aggregateFrontendRepoSchema,
        key,
        storage,
      });
      lastAggregateCursor = yield* getLastAggregateCursor({
        storage,
        defaultValue: null,
      });
      aggregateIndex = yield* getLastAggregateIndex({
        storage,
        defaultValue: null,
      });
      if (
        lastAggregateCursor !== lastBlock.lastAggregateCursor ||
        aggregateIndex !== lastBlock.aggregateIndex
      ) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-catchup-commit-mismatch',
          message:
            'AggregateFrontendRepo did not durably apply the complete aggregate replay batch',
          extra: {
            expectedLastAggregateCursor: lastBlock.lastAggregateCursor,
            actualLastAggregateCursor: lastAggregateCursor,
            expectedAggregateIndex: lastBlock.aggregateIndex,
            actualAggregateIndex: aggregateIndex,
          },
        });
      }
      if (lastAggregateCursor === batch.lastAvailableAggregateCursor) {
        return { lastAggregateCursor, aggregateIndex };
      }
    }
  },
);
