import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { TraceLoggerLayer } from '@zerospin/core/test-utils/TraceLoggerLayer';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { ErrorLayer } from '@zerospin/core/utils/ErrorLayer';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { env, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { AggregateBlockRepo } from '../AggregateBlockRepo/AggregateBlockRepo.js';
import { getAggregateBlockRepo } from '../AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo.js';
import { AggregateFrontendBlockRepo } from '../AggregateFrontendBlockRepo/AggregateFrontendBlockRepo.js';
import { main, mainModels, system } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import type { IAggregateBlock } from '../types.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import { AggregateFrontendRepo } from './AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from './getAggregateFrontendRepo/getAggregateFrontendRepo.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('AggregateFrontendRepoPrepareSuccessor'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('AggregateFrontendRepo.prepareSuccessor', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'rebuilds an inherited projection from the aggregate archive and retries idempotently',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-frontend-successor-archive',
          });
          const generationId = activation.generationId;
          const predecessorGenerationId = 'gen_frontend_successor_predecessor';
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-successor-archive',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const key = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            frontendName: main.frontendName,
          };
          const aggregateKey = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
          };
          const predecessorRepoName =
            yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
              {
                ...key,
                generationId: predecessorGenerationId,
              },
            );
          const predecessorTerminalFrontendIndex = 17;
          const firstAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const lastAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const executedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const failedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const executedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const failedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const executedPushedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.pushedCursor,
          });
          const stagedAt = new Date('2026-01-01T00:00:00.000Z');
          const pushedAt = new Date('2026-01-01T00:00:01.000Z');
          const terminalAt = new Date('2026-01-01T00:00:02.000Z');
          const executedStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: mainModels.list.prefixId('successor-executed'),
                  name: 'Successor executed',
                  userId,
                },
                sessionId: executedSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: executedStagedCursor,
              stagedAt,
              replicaIndex: 1,
              status: 'staged',
            },
          });
          const failedStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: mainModels.list.prefixId('successor-failed'),
                  name: 'Successor failed',
                  userId,
                },
                sessionId: failedSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: failedStagedCursor,
              stagedAt,
              replicaIndex: 2,
              status: 'staged',
            },
          });
          const executedCommand = Schema.validateSync(
            ExecutedPushedCommandSchema,
          )({
            ...executedStagedCommand,
            pushedAt,
            pushedCursor: executedPushedCursor,
            mode: 'authoritative',
            aggregateCursor: firstAggregateCursor,
            aggregateIndex: 1,
            executedAt: terminalAt,
            status: 'executed',
          });
          const finalizedFailedStagedCommand = Schema.validateSync(
            FinalizedFailedStagedReplicaCommandSchema,
          )({
            ...failedStagedCommand,
            pushedCursor: null,
            aggregateCursor: lastAggregateCursor,
            aggregateIndex: 2,
            failedAt: terminalAt,
            failure: JSON.stringify({ code: 'successor-archive-failure' }),
            status: 'failed',
          });
          const userMutation = yield* mainModels.user.create(
            mainModels.user.version,
            {
              resourceId: userId,
              attributes: { name: 'Rebuilt from aggregate archive' },
            },
          );
          const encodedUserMutation = yield* encodeAppliedMutation({
            mutation: {
              ...userMutation,
              commandId: executedCommand.id,
              mutationIndex: 0,
              appliedAt: terminalAt,
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const blocks = [
            {
              writeIndex: 1,
              lastAggregateCursor: firstAggregateCursor,
              aggregateIndex: 1,
              executedCommands: [executedCommand],
              failedCommands: [],
              appliedMutations: [encodedUserMutation],
            },
            {
              writeIndex: 2,
              lastAggregateCursor,
              aggregateIndex: 2,
              executedCommands: [],
              failedCommands: [finalizedFailedStagedCommand],
              appliedMutations: [],
            },
          ] satisfies readonly IAggregateBlock[];

          yield* Effect.promise(() =>
            runInDurableObject(
              SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID }),
              (_instance, state) => {
                state.storage.sql.exec(
                  "UPDATE generationState SET phase = 'migrating' WHERE generationId = ?",
                  generationId,
                );
              },
            ),
          );

          const aggregateBlockRepo = yield* getAggregateBlockRepo({
            key: aggregateKey,
          });
          const tracedAggregateBlockRepo =
            makeTraceableRpcTarget<Pick<AggregateBlockRepo, 'publish'>>(
              aggregateBlockRepo,
            );
          for (const block of blocks) {
            yield* tracedAggregateBlockRepo.publish(block).pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          }

          const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key,
          });
          const predecessor = {
            generationId: predecessorGenerationId,
            repoName: predecessorRepoName,
            terminalFrontendIndex: predecessorTerminalFrontendIndex,
          };
          yield* makeAsync(() =>
            aggregateFrontendRepo.prepareSuccessor({
              lastAggregateCursor,
              aggregateIndex: 2,
              predecessor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const stateAfterFirstPreparation = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema, state }) => ({
                projectedUser: db
                  .select()
                  .from(schema.user)
                  .where(eq(schema.user.id, userId))
                  .get(),
                aggregateSourceUser: db
                  .select()
                  .from(schema.aggregateSource_user)
                  .where(eq(schema.aggregateSource_user.id, userId))
                  .get(),
                executedCommands: db
                  .select()
                  .from(schema.executedPushedCommands)
                  .all(),
                failedStagedCommands: db
                  .select()
                  .from(schema.failedStagedCommands)
                  .all(),
                failedPushedCommands: db
                  .select()
                  .from(schema.failedPushedCommands)
                  .all(),
                aggregateFrontendBlockOutbox: db
                  .select()
                  .from(schema.aggregateFrontendBlockOutbox)
                  .all(),
                frontendIndex: state.storage.kv.get('frontendIndex'),
                emissionMode: state.storage.kv.get('emissionMode'),
                lastAggregateCursor: state.storage.kv.get(
                  'lastAggregateCursor',
                ),
                lastAggregateIndex: state.storage.kv.get('lastAggregateIndex'),
                subscribed: state.storage.kv.get('subscribed'),
              }),
            }),
          );

          expect(stateAfterFirstPreparation).toMatchObject({
            projectedUser: {
              id: userId,
              name: 'Rebuilt from aggregate archive',
            },
            aggregateSourceUser: {
              id: userId,
              name: 'Rebuilt from aggregate archive',
            },
            executedCommands: [executedCommand],
            failedStagedCommands: [finalizedFailedStagedCommand],
            failedPushedCommands: [],
            aggregateFrontendBlockOutbox: [],
            frontendIndex: predecessorTerminalFrontendIndex,
            emissionMode: 'live',
            lastAggregateCursor,
            lastAggregateIndex: 2,
            subscribed: true,
          });

          const aggregateFrontendRepoName =
            yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(
              key,
            );
          const subscriberAfterFirstPreparation = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateBlockRepo,
              repo: AggregateBlockRepo,
              key: aggregateKey,
              fn: ({ db, schema }) =>
                db
                  .select()
                  .from(schema.aggregateFrontendSubscribers)
                  .where(
                    eq(
                      schema.aggregateFrontendSubscribers
                        .aggregateFrontendRepoName,
                      aggregateFrontendRepoName,
                    ),
                  )
                  .get(),
            }),
          );
          expect(subscriberAfterFirstPreparation).toMatchObject({
            aggregateFrontendRepoName,
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            frontendName: main.frontendName,
            currentAggregateCursor: lastAggregateCursor,
            currentAggregateIndex: 2,
          });

          yield* Effect.promise(() =>
            runInDurableObject(
              SystemRepo.getRepo({ systemId: env.ZEROSPIN_SYSTEM_ID }),
              (_instance, state) => {
                state.storage.sql.exec(
                  "UPDATE generationState SET phase = 'open' WHERE generationId = ?",
                  generationId,
                );
              },
            ),
          );
          yield* makeAsync(() =>
            aggregateFrontendRepo.prepareSuccessor({
              lastAggregateCursor,
              aggregateIndex: 2,
              predecessor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const stateAfterRetry = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema, state }) => ({
                projectedUsers: db.select().from(schema.user).all(),
                executedCommands: db
                  .select()
                  .from(schema.executedPushedCommands)
                  .all(),
                failedStagedCommands: db
                  .select()
                  .from(schema.failedStagedCommands)
                  .all(),
                failedPushedCommands: db
                  .select()
                  .from(schema.failedPushedCommands)
                  .all(),
                aggregateFrontendBlockOutbox: db
                  .select()
                  .from(schema.aggregateFrontendBlockOutbox)
                  .all(),
                frontendIndex: state.storage.kv.get('frontendIndex'),
                lastAggregateCursor: state.storage.kv.get(
                  'lastAggregateCursor',
                ),
                lastAggregateIndex: state.storage.kv.get('lastAggregateIndex'),
              }),
            }),
          );
          expect(stateAfterRetry).toMatchObject({
            projectedUsers: [stateAfterFirstPreparation.projectedUser],
            executedCommands: [executedCommand],
            failedStagedCommands: [finalizedFailedStagedCommand],
            failedPushedCommands: [],
            aggregateFrontendBlockOutbox: [],
            frontendIndex: predecessorTerminalFrontendIndex,
            lastAggregateCursor,
            lastAggregateIndex: 2,
          });
        }),
    );
  });
});
