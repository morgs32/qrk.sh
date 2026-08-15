import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect, Either } from 'effect';
import { describe, expect } from 'vitest';

import { AggregateFrontendRepo } from '../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AggregateBlockRepo } from './AggregateBlockRepo.js';
import { getAggregateBlockRepo } from './getAggregateBlockRepo/getAggregateBlockRepo.js';
import { subscribeAggregateFrontend } from './subscribeAggregateFrontend/subscribeAggregateFrontend.js';

describe('AggregateBlockRepo replay batches', () => {
  it.effect(
    'returns 100 ascending blocks and the head from the same read',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_aggregate_block_replay_batch',
          aggregateId: 'acct_aggregate_block_replay_batch',
          aggregateName: 'user',
        };
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateBlockRepo,
            repo: AggregateBlockRepo,
            key,
            fn: ({ state }) => {
              for (
                let aggregateIndex = 1;
                aggregateIndex <= 101;
                aggregateIndex++
              ) {
                state.storage.sql.exec(
                  'INSERT INTO finalizedBlocks VALUES (?, ?, ?, ?, ?, ?)',
                  aggregateIndex,
                  `acur_aggregate_block_replay_batch_${aggregateIndex}`,
                  aggregateIndex,
                  '[]',
                  '[]',
                  '[]',
                );
              }
            },
          }),
        );

        const aggregateBlockRepo = yield* getAggregateBlockRepo({ key });
        const firstBatch = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor: null,
            afterAggregateIndex: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(firstBatch.blocks).toHaveLength(100);
        expect(firstBatch.blocks.map(block => block.aggregateIndex)).toEqual(
          Array.from({ length: 100 }, (_, index) => index + 1),
        );
        expect(firstBatch.lastAvailableAggregateCursor).toBe(
          'acur_aggregate_block_replay_batch_101',
        );

        const firstBatchLastBlock = firstBatch.blocks.at(-1);
        expect(firstBatchLastBlock).toBeDefined();
        if (firstBatchLastBlock === undefined) {
          return yield* Effect.die(
            'Expected the first replay batch to be full',
          );
        }
        const secondBatch = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor: firstBatchLastBlock.lastAggregateCursor,
            afterAggregateIndex: firstBatchLastBlock.aggregateIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(secondBatch).toEqual({
          blocks: [
            {
              writeIndex: 101,
              lastAggregateCursor: 'acur_aggregate_block_replay_batch_101',
              aggregateIndex: 101,
              executedCommands: [],
              failedCommands: [],
              appliedMutations: [],
            },
          ],
          lastAvailableAggregateCursor: 'acur_aggregate_block_replay_batch_101',
        });

        const terminalBatch = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor: 'acur_aggregate_block_replay_batch_101',
            afterAggregateIndex: 101,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(terminalBatch).toEqual({
          blocks: [],
          lastAvailableAggregateCursor: 'acur_aggregate_block_replay_batch_101',
        });

        const terminalCursorMismatch = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor:
              'acur_aggregate_block_replay_batch_wrong_terminal',
            afterAggregateIndex: 101,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(terminalCursorMismatch).toMatchObject({
          _tag: 'Left',
          left: { code: 'aggregate-replay-after-watermark-mismatch' },
        });

        const continuationBeyondHead = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor:
              'acur_aggregate_block_replay_batch_beyond_head',
            afterAggregateIndex: 102,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(continuationBeyondHead).toMatchObject({
          _tag: 'Left',
          left: { code: 'aggregate-replay-after-watermark-mismatch' },
        });

        const incompleteWatermark = yield* makeAsync(() =>
          aggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor: 'acur_aggregate_block_replay_batch_101',
            afterAggregateIndex: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(incompleteWatermark).toMatchObject({
          _tag: 'Left',
          left: { code: 'aggregate-replay-after-watermark-incomplete' },
        });

        const emptyAggregateBlockRepo = yield* getAggregateBlockRepo({
          key: {
            generationId: 'gen_aggregate_block_replay_empty',
            aggregateId: 'acct_aggregate_block_replay_empty',
            aggregateName: 'user',
          },
        });
        const emptyBatch = yield* makeAsync(() =>
          emptyAggregateBlockRepo.getReplayBlocks({
            afterAggregateCursor: null,
            afterAggregateIndex: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(emptyBatch).toEqual({
          blocks: [],
          lastAvailableAggregateCursor: null,
        });
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'keeps subscriber current and queued watermarks monotonic on registration retry',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_aggregate_block_subscription_retry',
          aggregateId: 'acct_aggregate_block_subscription_retry',
          aggregateName: 'user',
        };
        const userId = 'user_aggregate_block_subscription_retry';
        const frontendName = 'main';
        const aggregateFrontendRepoName =
          yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName({
            ...key,
            userId,
            frontendName,
          });

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateBlockRepo,
            repo: AggregateBlockRepo,
            key,
            fn: async ({ db, schema }) => {
              await managedRuntime.runPromise(
                subscribeAggregateFrontend({
                  ...key,
                  userId,
                  frontendName,
                  currentAggregateCursor:
                    'acur_aggregate_block_subscription_retry_7',
                  currentAggregateIndex: 7,
                  db,
                  aggregateFrontendRepoName,
                }),
              );
              db.update(schema.aggregateFrontendSubscribers)
                .set({
                  queuedAggregateCursor:
                    'acur_aggregate_block_subscription_retry_9',
                  queuedAggregateIndex: 9,
                })
                .run();

              await managedRuntime.runPromise(
                subscribeAggregateFrontend({
                  ...key,
                  userId,
                  frontendName,
                  currentAggregateCursor:
                    'acur_aggregate_block_subscription_retry_5',
                  currentAggregateIndex: 5,
                  db,
                  aggregateFrontendRepoName,
                }),
              );
              expect(
                db.select().from(schema.aggregateFrontendSubscribers).get(),
              ).toMatchObject({
                currentAggregateCursor:
                  'acur_aggregate_block_subscription_retry_7',
                currentAggregateIndex: 7,
                queuedAggregateCursor:
                  'acur_aggregate_block_subscription_retry_9',
                queuedAggregateIndex: 9,
              });

              await managedRuntime.runPromise(
                subscribeAggregateFrontend({
                  ...key,
                  userId,
                  frontendName,
                  currentAggregateCursor:
                    'acur_aggregate_block_subscription_retry_8',
                  currentAggregateIndex: 8,
                  db,
                  aggregateFrontendRepoName,
                }),
              );
              expect(
                db.select().from(schema.aggregateFrontendSubscribers).get(),
              ).toMatchObject({
                currentAggregateCursor:
                  'acur_aggregate_block_subscription_retry_8',
                currentAggregateIndex: 8,
                queuedAggregateCursor:
                  'acur_aggregate_block_subscription_retry_9',
                queuedAggregateIndex: 9,
              });

              const currentConflict = await managedRuntime.runPromise(
                subscribeAggregateFrontend({
                  ...key,
                  userId,
                  frontendName,
                  currentAggregateCursor:
                    'acur_aggregate_block_subscription_retry_conflict',
                  currentAggregateIndex: 8,
                  db,
                  aggregateFrontendRepoName,
                }).pipe(Effect.either),
              );
              expect(Either.isLeft(currentConflict)).toBe(true);
              expect(currentConflict).toMatchObject({
                _tag: 'Left',
                left: {
                  code: 'aggregate-block-aggregate-frontend-current-cursor-conflict',
                },
              });

              const queuedConflict = await managedRuntime.runPromise(
                subscribeAggregateFrontend({
                  ...key,
                  userId,
                  frontendName,
                  currentAggregateCursor:
                    'acur_aggregate_block_subscription_retry_conflict',
                  currentAggregateIndex: 9,
                  db,
                  aggregateFrontendRepoName,
                }).pipe(Effect.either),
              );
              expect(Either.isLeft(queuedConflict)).toBe(true);
              expect(queuedConflict).toMatchObject({
                _tag: 'Left',
                left: {
                  code: 'aggregate-block-aggregate-frontend-queued-cursor-conflict',
                },
              });
              expect(
                db.select().from(schema.aggregateFrontendSubscribers).get(),
              ).toMatchObject({
                currentAggregateCursor:
                  'acur_aggregate_block_subscription_retry_8',
                currentAggregateIndex: 8,
                queuedAggregateCursor:
                  'acur_aggregate_block_subscription_retry_9',
                queuedAggregateIndex: 9,
              });
            },
          }),
        );
      }).pipe(Effect.provide(AsyncLive)),
  );
});
