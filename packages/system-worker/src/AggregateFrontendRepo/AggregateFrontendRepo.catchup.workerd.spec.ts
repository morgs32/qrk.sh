import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AggregateBlockRepo } from '../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { main } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import {
  AggregateFrontendRepo,
  aggregateFrontendRepoDrizzleSchemas,
} from './AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from './getAggregateFrontendRepo/getAggregateFrontendRepo.js';

describe('AggregateFrontendRepo catch-up', () => {
  it.effect(
    'pulls multiple archive batches, subscribes at the terminal pair, and retries without duplicates',
    () =>
      Effect.gen(function* () {
        const activation = yield* prepareGenerationStateFixture({
          clean: true,
          workerVersionId: 'aggregate-frontend-catchup-batches',
        });
        const key = {
          generationId: activation.generationId,
          aggregateId: 'acct_frontend_catchup_batches',
          aggregateName: main.aggregateName,
          userId: 'usr_frontend_catchup_batches',
          frontendName: main.frontendName,
        };
        const aggregateBlockKey = {
          generationId: key.generationId,
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
        };
        const aggregateFrontendRepoName =
          yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(
            key,
          );

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateBlockRepo,
            repo: AggregateBlockRepo,
            key: aggregateBlockKey,
            fn: ({ state }) => {
              for (
                let aggregateIndex = 1;
                aggregateIndex <= 101;
                aggregateIndex++
              ) {
                state.storage.sql.exec(
                  'INSERT INTO finalizedBlocks VALUES (?, ?, ?, ?, ?, ?)',
                  aggregateIndex,
                  `acur_frontend_catchup_batches_${aggregateIndex}`,
                  aggregateIndex,
                  '[]',
                  '[]',
                  '[]',
                );
              }
            },
          }),
        );

        const aggregateFrontendRepo = yield* getAggregateFrontendRepo({ key });
        const firstFrontendState = yield* makeAsync(() =>
          aggregateFrontendRepo.getState({
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
            userId: key.userId,
            frontendName: key.frontendName,
            lineage: { predecessor: null },
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const firstProjectionState = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: ({ db, state }) => ({
              lastAggregateCursor: state.storage.kv.get('lastAggregateCursor'),
              lastAggregateIndex: state.storage.kv.get('lastAggregateIndex'),
              frontendIndex: state.storage.kv.get('frontendIndex'),
              emissionMode: state.storage.kv.get('emissionMode'),
              subscribed: state.storage.kv.get('subscribed'),
              aggregateFrontendBlockOutboxCount: db
                .select()
                .from(
                  aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
                )
                .all().length,
            }),
          }),
        );
        expect(firstProjectionState).toEqual({
          lastAggregateCursor: 'acur_frontend_catchup_batches_101',
          lastAggregateIndex: 101,
          frontendIndex: 0,
          emissionMode: 'live',
          subscribed: true,
          aggregateFrontendBlockOutboxCount: 0,
        });

        const firstSubscriberRows = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateBlockRepo,
            repo: AggregateBlockRepo,
            key: aggregateBlockKey,
            fn: ({ db, schema }) =>
              db.select().from(schema.aggregateFrontendSubscribers).all(),
          }),
        );
        expect(firstSubscriberRows).toEqual([
          expect.objectContaining({
            aggregateFrontendRepoName,
            currentAggregateCursor: 'acur_frontend_catchup_batches_101',
            currentAggregateIndex: 101,
            queuedAggregateCursor: 'acur_frontend_catchup_batches_101',
            queuedAggregateIndex: 101,
          }),
        ]);

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: ({ state }) => {
              state.storage.kv.delete('subscribed');
            },
          }),
        );
        const retriedFrontendState = yield* makeAsync(() =>
          aggregateFrontendRepo.getState({
            aggregateId: key.aggregateId,
            aggregateName: key.aggregateName,
            userId: key.userId,
            frontendName: key.frontendName,
            lineage: { predecessor: null },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(retriedFrontendState).toEqual(firstFrontendState);

        const retriedProjectionState = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendRepo,
            repo: AggregateFrontendRepo,
            key,
            fn: ({ db, state }) => ({
              lastAggregateCursor: state.storage.kv.get('lastAggregateCursor'),
              lastAggregateIndex: state.storage.kv.get('lastAggregateIndex'),
              frontendIndex: state.storage.kv.get('frontendIndex'),
              emissionMode: state.storage.kv.get('emissionMode'),
              subscribed: state.storage.kv.get('subscribed'),
              aggregateFrontendBlockOutboxCount: db
                .select()
                .from(
                  aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
                )
                .all().length,
            }),
          }),
        );
        expect(retriedProjectionState).toEqual(firstProjectionState);

        const retriedSubscriberRows = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateBlockRepo,
            repo: AggregateBlockRepo,
            key: aggregateBlockKey,
            fn: ({ db, schema }) =>
              db.select().from(schema.aggregateFrontendSubscribers).all(),
          }),
        );
        expect(retriedSubscriberRows).toEqual(firstSubscriberRows);
      }).pipe(Effect.provide(AsyncLive)),
  );
});
