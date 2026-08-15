/*
 * AggregateFrontendRepo durable integration coverage below authored execution:
 *
 * 1. Apply ordered aggregate blocks to the durable source/projection and emit matching
 *    frontend blocks without optimistic command replay.
 * 2. Stop pushed-block delivery at the first terminal failure so a later row
 *    cannot overtake it.
 *
 * Shopping workerd coverage owns frontend contract preparation, optimistic
 * replay, and command adaptation through the authored System.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
  FailedStagedReplicaCommandSchema,
  PushBlockSchema,
  PushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { encodeAppliedMutation } from '@zerospin/core/contracts/encodeAppliedMutation';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { migrateDb } from '@zerospin/core/drizzle/migrateDb';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { AggregateFrontendBlockSchema } from '@zerospin/core/session/AggregateFrontendBlockSchema';
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
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from 'cloudflare:test';
import { asc, eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { main, mainModels, system } from '../fixtures/system.js';
import { makeDeliveryQueue } from '../makeDeliveryQueue/makeDeliveryQueue.js';
import { makeDurableDb } from '../makeDurableDb.js';
import { managedRuntime } from '../managedRuntime.js';
import type { IAggregateBlock } from '../types.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import {
  AggregateFrontendRepo,
  aggregateFrontendRepoDrizzleSchemas,
} from './AggregateFrontendRepo.js';
import { drainPushBlockOutbox } from './drainPushBlockOutbox/drainPushBlockOutbox.js';
import { getAggregateFrontendRepo } from './getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { handleAggregateBlocks } from './handleAggregateBlocks/handleAggregateBlocks.js';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('AggregateFrontendRepo'),
  IncrementalMonotonicFactory,
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('AggregateFrontendRepo', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'applies aggregate blocks in aggregate order and emits the converged frontend deltas',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-frontend-static-actor-blocks',
          });
          const generationId = activation.generationId;
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-static-aggregate-blocks',
          });
          const userId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.user.abbreviation,
          });
          const listId = yield* makeIdFromAbbreviation({
            abbreviation: mainModels.list.abbreviation,
          });
          const firstAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const secondAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const key = {
            generationId,
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            frontendName: main.frontendName,
          };
          const name =
            yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(
              key,
            );
          const createMutation = yield* mainModels.user.create(
            mainModels.user.version,
            {
              resourceId: userId,
              attributes: {
                name: 'Aggregate-projected frontend user',
              },
            },
          );
          const encodedCreateMutation = yield* encodeAppliedMutation({
            mutation: {
              ...createMutation,
              commandId: 'cmd_frontend_static_aggregate_create',
              mutationIndex: 0,
              appliedAt: new Date(1),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const createListMutation = yield* mainModels.list.create(
            mainModels.list.version,
            {
              resourceId: listId,
              attributes: {
                name: 'Aggregate-projected frontend list',
                userId,
              },
            },
          );
          const encodedCreateListMutation = yield* encodeAppliedMutation({
            mutation: {
              ...createListMutation,
              commandId: 'cmd_frontend_static_aggregate_create',
              mutationIndex: 1,
              appliedAt: new Date(1),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const deleteMutation = yield* mainModels.user.delete(
            mainModels.user.version,
            { resourceId: userId },
          );
          const encodedDeleteMutation = yield* encodeAppliedMutation({
            mutation: {
              ...deleteMutation,
              commandId: 'cmd_frontend_static_aggregate_delete',
              mutationIndex: 1,
              appliedAt: new Date(2),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });
          const deleteListMutation = yield* mainModels.list.delete(
            mainModels.list.version,
            { resourceId: listId },
          );
          const encodedDeleteListMutation = yield* encodeAppliedMutation({
            mutation: {
              ...deleteListMutation,
              commandId: 'cmd_frontend_static_aggregate_delete',
              mutationIndex: 0,
              appliedAt: new Date(2),
              lastAppliedAt: null,
              inverseOperation: null,
            },
          });

          const result = yield* Effect.promise(() =>
            runInDurableObject(
              env.FIXTURE_REPO.getByName(
                'aggregate-frontend-static/actor-blocks',
              ),
              async (_instance, state) => {
                const dbConfig = await managedRuntime.runPromise(
                  AggregateFrontendRepo.boundDORepoConfig
                    .getDbConfig({ name, key, storage: state.storage })
                    .pipe(Effect.provide(AsyncLive)),
                );
                const db = makeDurableDb({
                  storage: state.storage,
                  dbConfig,
                });
                await managedRuntime.runPromise(
                  migrateDb({ db, schema: dbConfig.schema }),
                );
                state.storage.kv.put('emissionMode', 'live');
                const insertionBlock = {
                  writeIndex: 1,
                  executedCommands: [],
                  failedCommands: [],
                  appliedMutations: [
                    encodedCreateMutation,
                    encodedCreateListMutation,
                  ],
                  lastAggregateCursor: firstAggregateCursor,
                  aggregateIndex: 1,
                } satisfies IAggregateBlock;
                await managedRuntime.runPromise(
                  handleAggregateBlocks({
                    blocks: [insertionBlock],
                    db,
                    aggregateFrontendRepoSchema: dbConfig.schema,
                    key,
                    storage: state.storage,
                  }),
                );
                const afterInsertion = {
                  users: db
                    .select()
                    .from(dbConfig.schema.user)
                    .where(eq(dbConfig.schema.user.id, userId))
                    .all(),
                  lists: db
                    .select()
                    .from(dbConfig.schema.list)
                    .where(eq(dbConfig.schema.list.id, listId))
                    .all(),
                  graph: db
                    .select()
                    .from(aggregateFrontendRepoDrizzleSchemas.graph)
                    .where(
                      eq(
                        aggregateFrontendRepoDrizzleSchemas.graph.resourceId,
                        userId,
                      ),
                    )
                    .all(),
                };

                const deletionBlock = {
                  writeIndex: 2,
                  executedCommands: [],
                  failedCommands: [],
                  appliedMutations: [
                    encodedDeleteListMutation,
                    encodedDeleteMutation,
                  ],
                  lastAggregateCursor: secondAggregateCursor,
                  aggregateIndex: 2,
                } satisfies IAggregateBlock;
                await managedRuntime.runPromise(
                  handleAggregateBlocks({
                    blocks: [deletionBlock],
                    db,
                    aggregateFrontendRepoSchema: dbConfig.schema,
                    key,
                    storage: state.storage,
                  }),
                );

                const outboxRows = db
                  .select()
                  .from(
                    aggregateFrontendRepoDrizzleSchemas.aggregateFrontendBlockOutbox,
                  )
                  .orderBy(
                    asc(
                      aggregateFrontendRepoDrizzleSchemas
                        .aggregateFrontendBlockOutbox.frontendIndex,
                    ),
                  )
                  .all();
                const aggregateFrontendBlocks = await Promise.all(
                  outboxRows.map(row =>
                    managedRuntime.runPromise(
                      Schema.decodeUnknown(
                        Schema.parseJson(AggregateFrontendBlockSchema),
                      )(row.block),
                    ),
                  ),
                );
                return {
                  afterInsertion,
                  finalUsers: db
                    .select()
                    .from(dbConfig.schema.user)
                    .where(eq(dbConfig.schema.user.id, userId))
                    .all(),
                  finalLists: db
                    .select()
                    .from(dbConfig.schema.list)
                    .where(eq(dbConfig.schema.list.id, listId))
                    .all(),
                  finalGraph: db
                    .select()
                    .from(aggregateFrontendRepoDrizzleSchemas.graph)
                    .where(
                      eq(
                        aggregateFrontendRepoDrizzleSchemas.graph.resourceId,
                        userId,
                      ),
                    )
                    .all(),
                  aggregateFrontendBlocks,
                  lastAggregateCursor: state.storage.kv.get(
                    'lastAggregateCursor',
                  ),
                  lastAggregateIndex:
                    state.storage.kv.get('lastAggregateIndex'),
                  frontendIndex: state.storage.kv.get('frontendIndex'),
                };
              },
            ),
          );

          expect(result.afterInsertion.users).toEqual([
            expect.objectContaining({
              id: userId,
              name: 'Aggregate-projected frontend user',
            }),
          ]);
          expect(result.afterInsertion.lists).toEqual([
            expect.objectContaining({
              id: listId,
              name: 'Aggregate-projected frontend list',
              userId,
            }),
          ]);
          expect(result.afterInsertion.graph).toEqual([
            { resourceId: userId, modelName: mainModels.user.modelName },
          ]);
          expect(result.finalUsers).toEqual([]);
          expect(result.finalLists).toEqual([]);
          expect(result.finalGraph).toEqual([]);
          expect(result.lastAggregateCursor).toBe(secondAggregateCursor);
          expect(result.lastAggregateIndex).toBe(2);
          expect(result.frontendIndex).toBe(2);
          expect(result.aggregateFrontendBlocks).toEqual([
            expect.objectContaining({
              frontendIndex: 1,
              lastAggregateCursor: firstAggregateCursor,
              delta: expect.objectContaining({
                inserted: [
                  expect.objectContaining({ id: userId }),
                  expect.objectContaining({ id: listId, userId }),
                ],
                deleted: [],
              }),
            }),
            expect.objectContaining({
              frontendIndex: 2,
              lastAggregateCursor: secondAggregateCursor,
              delta: expect.objectContaining({
                inserted: [],
                deleted: [
                  { id: userId, modelName: mainModels.user.modelName },
                  { id: listId, modelName: mainModels.list.modelName },
                ],
              }),
            }),
          ]);
        }),
    );

    it.effect('retains push receipts after ordered drain acknowledgement', () =>
      Effect.gen(function* () {
        const aggregateId = makeAggregateId({
          id: 'aggregate-frontend-static-pushed-drain',
        });
        const userId = yield* makeIdFromAbbreviation({
          abbreviation: mainModels.user.abbreviation,
        });
        const key = {
          generationId: 'gen_frontend_static_pushed_drain',
          aggregateId,
          aggregateName: main.aggregateName,
          userId,
          frontendName: main.frontendName,
        };
        const name =
          yield* AggregateFrontendRepo.boundDORepoConfig.nameUtils.makeName(
            key,
          );
        const encodedFirstPushedBlock = yield* Schema.encode(
          Schema.parseJson(PushBlockSchema),
        )({
          writeIndex: 1,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        });
        const encodedSecondPushedBlock = yield* Schema.encode(
          Schema.parseJson(PushBlockSchema),
        )({
          writeIndex: 2,
          guardedAtAggregateCursor: null,
          pendingCommands: [],
          pushedCommands: [],
          executedCommands: [],
          failedStagedCommands: [],
          failedPushedCommands: [],
        });

        const rows = yield* Effect.promise(() =>
          runInDurableObject(
            env.FIXTURE_REPO.getByName(
              'aggregate-frontend-static/pushed-drain',
            ),
            async (_instance, state) => {
              const dbConfig = await managedRuntime.runPromise(
                AggregateFrontendRepo.boundDORepoConfig
                  .getDbConfig({ name, key, storage: state.storage })
                  .pipe(Effect.provide(AsyncLive)),
              );
              const db = makeDurableDb({
                storage: state.storage,
                dbConfig,
              });
              await managedRuntime.runPromise(
                migrateDb({ db, schema: dbConfig.schema }),
              );

              db.insert(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
                .values([
                  {
                    writeIndex: 1,
                    requestBytes: 'first request',
                    block: encodedFirstPushedBlock,
                    finalizedAt: null,
                    failure: null,
                  },
                  {
                    writeIndex: 2,
                    requestBytes: 'second request',
                    block: encodedSecondPushedBlock,
                    finalizedAt: null,
                    failure: null,
                  },
                ])
                .run();
              await managedRuntime.runPromise(
                drainPushBlockOutbox({
                  db,
                  deliveryQueue: makeDeliveryQueue({
                    storage: state.storage,
                  }),
                  key,
                }),
              );
              // This direct-effect case borrows FixtureRepo storage rather
              // than a AggregateFrontendRepo lifecycle instance. Alarm recovery is
              // covered through production Durable Objects below.
              await state.storage.deleteAlarm();
              return db
                .select()
                .from(aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox)
                .orderBy(
                  asc(
                    aggregateFrontendRepoDrizzleSchemas.pushBlockOutbox
                      .writeIndex,
                  ),
                )
                .all();
            },
          ),
        );

        expect(rows).toEqual([
          expect.objectContaining({
            writeIndex: 1,
            finalizedAt: expect.any(Date),
            failure: null,
          }),
          expect.objectContaining({
            writeIndex: 2,
            finalizedAt: expect.any(Date),
            failure: null,
          }),
        ]);
      }),
    );

    it.effect(
      'retains canonical outcomes across restart and commits admission failure atomically',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-frontend-terminal-retention',
          });
          const generationId = activation.generationId;
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-terminal-retention',
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
          const pendingSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const executedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const failedStagedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const failedPushedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const rejectedSessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const pendingStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const executedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const failedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const failedPushedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const rejectedStagedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.stagedCursor,
          });
          const pendingPushedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.pushedCursor,
          });
          const executedPushedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.pushedCursor,
          });
          const failedPushedCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.pushedCursor,
          });
          const executedAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const failedAggregateCursor = yield* makeCursor({
            abbreviation: coreAbbreviations.aggregateCursor,
          });
          const stagedAt = new Date('2026-01-01T00:00:00.000Z');
          const pushedAt = new Date('2026-01-01T00:00:01.000Z');
          const terminalAt = new Date('2026-01-01T00:00:02.000Z');
          const pendingStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: mainModels.list.prefixId('terminal-pending'),
                  name: 'Terminal pending',
                  userId,
                },
                sessionId: pendingSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: pendingStagedCursor,
              stagedAt,
              pushedCursor: null,
              replicaIndex: 1,
              status: 'staged',
            },
          });
          const executedStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: mainModels.list.prefixId('terminal-executed'),
                  name: 'Terminal executed',
                  userId,
                },
                sessionId: executedSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: executedStagedCursor,
              stagedAt,
              pushedCursor: null,
              replicaIndex: 2,
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
                  id: mainModels.list.prefixId('terminal-failed-staged'),
                  name: 'Terminal failed staged',
                  userId,
                },
                sessionId: failedStagedSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: failedStagedCursor,
              stagedAt,
              pushedCursor: null,
              replicaIndex: 3,
              status: 'staged',
            },
          });
          const failedPushedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...(yield* makeSessionCommand({
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                contract: main.contracts.createList,
                payload: {
                  id: mainModels.list.prefixId('terminal-failed-pushed'),
                  name: 'Terminal failed pushed',
                  userId,
                },
                sessionId: failedPushedSessionId,
                frontendName: main.frontendName,
                systemName: system.name,
              })),
              commandType: 'frontend',
              stagedCursor: failedPushedStagedCursor,
              stagedAt,
              pushedCursor: null,
              replicaIndex: 4,
              status: 'staged',
            },
          });
          const rejectedStagedCommand = {
            ...(yield* encodeCommand({
              contract: main.contracts.createList,
              command: {
                ...(yield* makeSessionCommand({
                  aggregateId,
                  aggregateName: main.aggregateName,
                  userId,
                  contract: main.contracts.createList,
                  payload: {
                    id: mainModels.list.prefixId('terminal-rejected'),
                    name: 'Terminal rejected',
                    userId,
                  },
                  sessionId: rejectedSessionId,
                  frontendName: main.frontendName,
                  systemName: system.name,
                })),
                commandType: 'frontend',
                stagedCursor: rejectedStagedCursor,
                stagedAt,
                pushedCursor: null,
                replicaIndex: 5,
                status: 'staged',
              },
            })),
            contractVersion: '0.0.0',
          };
          const pendingCommand = Schema.validateSync(PushedCommandSchema)({
            ...pendingStagedCommand,
            pushedAt,
            pushedCursor: pendingPushedCursor,
            status: 'pushed',
          });
          const executedCommand = Schema.validateSync(
            ExecutedPushedCommandSchema,
          )({
            ...executedStagedCommand,
            pushedAt,
            pushedCursor: executedPushedCursor,
            mode: 'authoritative',
            aggregateCursor: executedAggregateCursor,
            aggregateIndex: 1,
            executedAt: terminalAt,
            status: 'executed',
          });
          const failedStagedOutcome = Schema.validateSync(
            FailedStagedReplicaCommandSchema,
          )({
            ...failedStagedCommand,
            failedAt: terminalAt,
            failure: JSON.stringify({ code: 'terminal-failed-staged' }),
            status: 'failed',
          });
          const failedPushedOutcome = Schema.validateSync(
            FailedPushedCommandSchema,
          )({
            ...failedPushedCommand,
            pushedAt,
            pushedCursor: failedPushedCursor,
            aggregateCursor: failedAggregateCursor,
            aggregateIndex: 2,
            failedAt: terminalAt,
            failure: JSON.stringify({ code: 'terminal-failed-pushed' }),
            status: 'failed',
          });

          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema, state }) => {
                state.storage.kv.put('initialized', true);
                state.storage.kv.put('emissionMode', 'live');
                state.storage.kv.put('subscribed', true);
                db.insert(schema.pushedCommands).values(pendingCommand).run();
                db.insert(schema.executedPushedCommands)
                  .values(executedCommand)
                  .run();
                db.insert(schema.failedStagedCommands)
                  .values(failedStagedOutcome)
                  .run();
                db.insert(schema.failedPushedCommands)
                  .values(failedPushedOutcome)
                  .run();
              },
            }),
          );

          yield* Effect.promise(() => abortAllDurableObjects());
          const restartedFrontendRepo = yield* getAggregateFrontendRepo({
            key,
          });
          const repeated = yield* makeAsync(() =>
            restartedFrontendRepo.pushCommands({
              writeIndex: 50,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
              aggregateFrontendLock:
                makeFrontendControllerSpec(main).aggregateFrontendLock,
              commands: [
                pendingStagedCommand,
                executedStagedCommand,
                failedStagedCommand,
                failedPushedCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(repeated.pendingCommands).toEqual([pendingCommand]);
          expect(repeated.pushedCommands).toEqual([]);
          expect(repeated.executedCommands).toEqual([executedCommand]);
          expect(repeated.failedStagedCommands).toEqual([failedStagedOutcome]);
          expect(repeated.failedPushedCommands).toEqual([failedPushedOutcome]);

          const conflict = yield* makeAsync(() =>
            restartedFrontendRepo.pushCommands({
              writeIndex: 51,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
              aggregateFrontendLock:
                makeFrontendControllerSpec(main).aggregateFrontendLock,
              commands: [
                {
                  ...executedStagedCommand,
                  payload: `${executedStagedCommand.payload} `,
                },
                rejectedStagedCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(conflict._tag).toBe('Left');
          if (conflict._tag !== 'Left') {
            return yield* Effect.die(
              new Error('Expected conflicting staged bytes to fail'),
            );
          }
          expect(conflict.left.code).toBe(
            'aggregate-frontend-push-command-byte-conflict',
          );
          const rolledBack = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema, state }) => ({
                failedRows: db
                  .select()
                  .from(schema.failedStagedCommands)
                  .where(
                    eq(
                      schema.failedStagedCommands.id,
                      rejectedStagedCommand.id,
                    ),
                  )
                  .all(),
                processedStagedCursor: state.storage.kv.get(
                  `processedStagedCursor:${rejectedSessionId}`,
                ),
                terminalStagedCursor: state.storage.kv.get(
                  `terminalStagedCursor:${rejectedSessionId}`,
                ),
              }),
            }),
          );
          expect(rolledBack).toEqual({
            failedRows: [],
            processedStagedCursor: undefined,
            terminalStagedCursor: undefined,
          });

          const rejected = yield* makeAsync(() =>
            restartedFrontendRepo.pushCommands({
              writeIndex: 52,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
              aggregateFrontendLock:
                makeFrontendControllerSpec(main).aggregateFrontendLock,
              commands: [rejectedStagedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(rejected.pendingCommands).toEqual([]);
          expect(rejected.pushedCommands).toEqual([]);
          expect(rejected.executedCommands).toEqual([]);
          expect(rejected.failedPushedCommands).toEqual([]);
          expect(rejected.failedStagedCommands).toEqual([
            expect.objectContaining({
              id: rejectedStagedCommand.id,
              sessionId: rejectedSessionId,
              stagedCursor: rejectedStagedCursor,
              failure: expect.stringContaining(
                'aggregate-frontend-contract-definition-missing',
              ),
            }),
          ]);
          const committedFailure = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema, state }) => ({
                failedRows: db
                  .select()
                  .from(schema.failedStagedCommands)
                  .where(
                    eq(
                      schema.failedStagedCommands.id,
                      rejectedStagedCommand.id,
                    ),
                  )
                  .all(),
                processedStagedCursor: state.storage.kv.get(
                  `processedStagedCursor:${rejectedSessionId}`,
                ),
                terminalStagedCursor: state.storage.kv.get(
                  `terminalStagedCursor:${rejectedSessionId}`,
                ),
              }),
            }),
          );
          expect(committedFailure.failedRows).toEqual([
            expect.objectContaining({
              id: rejectedStagedCommand.id,
              replicaIndex: rejectedStagedCommand.replicaIndex,
            }),
          ]);
          expect(committedFailure.processedStagedCursor).toBeUndefined();
          expect(committedFailure.terminalStagedCursor).toBeUndefined();

          const repeatedFailure = yield* makeAsync(() =>
            restartedFrontendRepo.pushCommands({
              writeIndex: 52,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
              aggregateFrontendLock:
                makeFrontendControllerSpec(main).aggregateFrontendLock,
              commands: [rejectedStagedCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(repeatedFailure.failedStagedCommands).toEqual(
            rejected.failedStagedCommands,
          );
        }),
    );

    it.effect(
      'resolves the active runtime from generation lineage after restart',
      () =>
        Effect.gen(function* () {
          const activation = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'aggregate-frontend-pushed-restart-lineage',
          });
          const generationId = activation.generationId;
          const aggregateId = makeAggregateId({
            id: 'aggregate-frontend-pushed-restart-lineage',
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
          const encodedPushedBlock = yield* Schema.encode(
            Schema.parseJson(PushBlockSchema),
          )({
            writeIndex: 60,
            guardedAtAggregateCursor: null,
            pendingCommands: [],
            pushedCommands: [],
            executedCommands: [],
            failedStagedCommands: [],
            failedPushedCommands: [],
          });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: ({ db, schema }) => {
                db.insert(schema.pushBlockOutbox)
                  .values({
                    writeIndex: 60,
                    requestBytes: 'restart request',
                    block: encodedPushedBlock,
                    finalizedAt: null,
                    failure: null,
                  })
                  .run();
              },
            }),
          );

          yield* Effect.promise(() => abortAllDurableObjects());
          const restartedFrontendRepo = yield* getAggregateFrontendRepo({
            key,
          });
          yield* makeAsync(() =>
            restartedFrontendRepo.drainPushBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const restartedState = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key,
              fn: async ({ db, schema, state }) => {
                await state.storage.deleteAlarm();
                return db.select().from(schema.pushBlockOutbox).get();
              },
            }),
          );

          expect(restartedState).toEqual(
            expect.objectContaining({
              writeIndex: 60,
              finalizedAt: expect.any(Date),
              failure: null,
            }),
          );
        }),
    );
  });
});
