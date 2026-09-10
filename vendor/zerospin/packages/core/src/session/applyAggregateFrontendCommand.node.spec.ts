import { it } from '@effect/vitest';
import { Context, Effect, Layer, Result, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { AsyncLive } from '../async/AsyncLive.ts';
import { applyAggregateFrontendMutationTx } from '../contracts/applyAggregateFrontendMutationTx.ts';
import { EncodedSessionCommandSchema } from '../contracts/CommandSchema.ts';
import {
  encodeAppliedMutation,
  EncodedAppliedMutationSchema,
} from '../contracts/encodeAppliedMutation.ts';
import { makeModelMutations } from '../contracts/makeModelMutations.ts';
import { makeResourceDbConfig } from '../drizzle/makeDbConfig.ts';
import { makeProvisionedInMemoryWasmSqliteDb } from '../drizzle/makeProvisionedInMemoryWasmSqliteDb.ts';
import { makeTx } from '../drizzle/makeTx.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import { List, main, mainModels, User } from '../fixtures/system.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import {
  AggregateFrontendFinalizedCommandSchema,
  SessionCommandSchema,
} from './AggregateFrontendCommandSchema.ts';
import { applyAggregateFrontendCommand } from './applyAggregateFrontendCommand.ts';
import { applyAggregateFrontendState } from './applyAggregateFrontendState.ts';
import {
  sessionCommandJournalDrizzleSchema,
  sessionOptimisticAppliedMutationDrizzleSchema,
} from './sessionCommandShape.ts';
import {
  sessionMetadataDrizzleSchema,
  sessionRepoTables,
} from './sessionRepoTables.ts';
import type { IAggregateFrontendSyncState } from './types.ts';

const TestLayer = Layer.mergeAll(
  AsyncLive,
  makePrefixedIncrementalIdFactory('frontendProgress'),
  ErrorLayer,
);

const now = new Date('2026-01-01T00:00:00.000Z');
const emptyDelta = { inserted: [], updated: [], deleted: [], mutations: [] };

describe('independent frontend progress', () => {
  it.layer(TestLayer)(it => {
    for (const rejected of [false, true]) {
      for (const snapshotRecovery of [false, true]) {
        it.effect(
          `preserves pending optimism and reconciles ${rejected ? 'rejected' : 'successful'} commands through ${snapshotRecovery ? 'snapshots' : 'live delivery'}`,
          () =>
            Effect.gen(function* () {
              const dbConfig = makeResourceDbConfig({
                models: mainModels,
                otherTables: sessionRepoTables,
              });
              const db = yield* makeProvisionedInMemoryWasmSqliteDb({
                dbConfig,
              });
              const frontend = { ...main, contracts: {} };
              const target = {
                frontend,
                sessionId: 'sesn_progress',
                aggregateId: 'acct_1',
                userId: 'user_1',
                systemId: 'sys_1',
                db,
                models: mainModels,
              } satisfies Omit<
                Parameters<
                  typeof applyAggregateFrontendState<typeof frontend>
                >[0],
                'frontendState'
              >;
              const snapshot = {
                aggregateId: 'acct_1',
                userId: 'user_1',
                systemId: 'sys_1',
                aggregateName: main.aggregateName,
                frontendName: main.name,
                aggregateVersion: '1.0.0',
                aggregateIndex: 0,
                userIndex: 0,
                resolutions: [],
                resources: [],
              } satisfies IAggregateFrontendSyncState;
              yield* applyAggregateFrontendState({
                ...target,
                frontendState: snapshot,
              });
              const user = {
                id: 'usr_1',
                modelName: User.modelName,
                createdAt: now,
                updatedAt: now,
                version: User.version,
                name: 'User',
              };
              yield* applyAggregateFrontendCommand({
                ...target,
                command: {
                  userIndex: 1,
                  aggregateIndex: 1,
                  delta: { ...emptyDelta, inserted: [user] },
                  resolution: null,
                },
              });
              const local = yield* Schema.decodeUnknownEffect(
                EncodedSessionCommandSchema,
              )({
                id: 'cmd_pending',
                commandName: 'createList',
                payload: JSON.stringify({
                  id: 'lst_pending',
                  name: 'Optimistic',
                  userId: 'usr_1',
                }),
                contractVersion: '1.0.0',
                aggregateId: target.aggregateId,
                aggregateName: frontend.aggregateName,
                systemName: frontend.systemName,
                sessionId: target.sessionId,
                userId: target.userId,
                frontendName: frontend.name,
                pushIndex: null,
              });
              // Start with a lost admission receipt: the journal is still unpushed
              // and retains the local mutation and the inverse needed to undo it.
              class Db extends Context.Service<Db, typeof db>()(
                'core/src/session/applyAggregateFrontendCommand.node.spec/Db',
              ) {
                static readonly Tx = Context.Service<
                  'core/src/session/applyAggregateFrontendCommand.node.spec/Db.Tx',
                  ITx<
                    IDbConfig<
                      IDbConfig['schema'],
                      (typeof db)['_']['relations']
                    >
                  >
                >(
                  'core/src/session/applyAggregateFrontendCommand.node.spec/Db.Tx',
                );
              }

              yield* makeTx(
                'session.transaction',
                Db,
              )(function* () {
                const tx = yield* Db.Tx;
                const appliedMutation = yield* applyAggregateFrontendMutationTx(
                  {
                    tx,
                    mutation: yield* makeModelMutations(List).create({
                      resourceId: 'lst_pending',
                      attributes: { name: 'Optimistic', userId: 'usr_1' },
                    }),
                    commandId: local.id,
                    mutationIndex: 0,
                    appliedAt: now,
                  },
                );
                const encodedMutation = yield* encodeAppliedMutation({
                  mutation: appliedMutation,
                });
                const command = yield* Schema.encodeEffect(
                  Schema.fromJsonString(SessionCommandSchema),
                )({
                  ...local,
                  pushIndex: null,
                  sessionIndex: 1,
                  chainedAt: now,
                  delta: null,
                  failedAt: null,
                  failure: null,
                }).pipe(Effect.orDie);
                tx.insert(sessionCommandJournalDrizzleSchema)
                  .values({ ...local, sessionIndex: 1, command })
                  .run();
                const mutations = yield* Schema.encodeEffect(
                  Schema.fromJsonString(
                    Schema.Array(EncodedAppliedMutationSchema),
                  ),
                )([encodedMutation]).pipe(Effect.orDie);
                tx.insert(sessionOptimisticAppliedMutationDrizzleSchema)
                  .values({ commandId: local.id, mutations })
                  .run();
              })().pipe(Effect.provideService(Db, db));
              const journalBefore = db
                .select()
                .from(sessionCommandJournalDrizzleSchema)
                .all();
              const serviceOutput = {
                userIndex: 2,
                aggregateIndex: 1,
                delta: {
                  ...emptyDelta,
                  updated: [{ ...user, name: 'Service update' }],
                },
                resolution: null,
              };
              yield* applyAggregateFrontendCommand({
                ...target,
                command: serviceOutput,
              });
              expect(
                db.select().from(sessionMetadataDrizzleSchema).get(),
              ).toMatchObject({
                userIndex: 2,
                aggregateIndex: 1,
                pushIndex: 0,
              });
              expect(
                db.select().from(sessionCommandJournalDrizzleSchema).all(),
              ).toEqual(journalBefore);
              expect(
                db
                  .select()
                  .from(sessionOptimisticAppliedMutationDrizzleSchema)
                  .all(),
              ).toHaveLength(1);
              expect(
                db.select().from(dbConfig.schema.list).get(),
              ).toMatchObject({
                id: 'lst_pending',
                name: 'Optimistic',
              });
              expect(
                db.select().from(dbConfig.schema.user).get(),
              ).toMatchObject({
                name: 'Service update',
              });
              expect(
                yield* applyAggregateFrontendCommand({
                  ...target,
                  command: serviceOutput,
                }),
              ).toBe('duplicate');

              for (const invalid of [
                { ...serviceOutput, userIndex: 4 },
                { ...serviceOutput, userIndex: 3, aggregateIndex: 0 },
              ]) {
                const rejected = yield* applyAggregateFrontendCommand({
                  ...target,
                  command: invalid,
                }).pipe(Effect.result);
                expect(Result.isFailure(rejected)).toBe(true);
                expect(
                  db.select().from(sessionMetadataDrizzleSchema).get(),
                ).toMatchObject({ userIndex: 2, aggregateIndex: 1 });
                expect(
                  db.select().from(sessionCommandJournalDrizzleSchema).all(),
                ).toEqual(journalBefore);
              }

              // A reconnect snapshot with more frontend output than aggregate input
              // replaces the base, but cannot infer a command resolution from either cursor.
              yield* applyAggregateFrontendState({
                ...target,
                frontendState: {
                  ...snapshot,
                  aggregateIndex: 1,
                  userIndex: 2,
                  resources: [{ ...user, name: 'Snapshot update' }],
                },
              });
              expect(
                db.select().from(sessionCommandJournalDrizzleSchema).all(),
              ).toEqual(journalBefore);
              expect(
                db.select().from(dbConfig.schema.list).get(),
              ).toMatchObject({
                name: 'Optimistic',
              });
              expect(
                db.select().from(sessionMetadataDrizzleSchema).get(),
              ).toMatchObject({ aggregateIndex: 1, userIndex: 2 });

              const finalized = yield* Schema.decodeUnknownEffect(
                AggregateFrontendFinalizedCommandSchema,
              )({
                userIndex: 3,
                aggregateIndex: 2,
                delta: rejected
                  ? emptyDelta
                  : {
                      ...emptyDelta,
                      inserted: [
                        {
                          id: 'lst_pending',
                          modelName: 'list',
                          name: 'Authoritative',
                          userId: 'usr_1',
                          version: '1.0.0',
                          createdAt: now.toISOString(),
                          updatedAt: now.toISOString(),
                        },
                      ],
                    },
                resolution: {
                  sourceCommand: journalBefore[0]!.command,
                  command: {
                    ...local,
                    chainedAt: now.toISOString(),
                    aggregateIndex: 2,
                    delta: null,
                    failedAt: rejected ? now.toISOString() : null,
                    failure: rejected
                      ? {
                          cause: null,
                          code: 'rejected',
                          extra: null,
                          message: 'Rejected',
                          status: null,
                        }
                      : null,
                    dispositionHash: 'a'.repeat(64),
                  },
                  mutations: [],
                  preparationVersion: '1.0.0',
                  executionTimestamp: now.toISOString(),
                },
              });
              if (snapshotRecovery) {
                yield* applyAggregateFrontendState({
                  ...target,
                  frontendState: {
                    ...snapshot,
                    aggregateIndex: 2,
                    userIndex: 3,
                    resources: rejected
                      ? [user]
                      : [user, ...finalized.delta.inserted],
                    resolutions:
                      finalized.resolution === null
                        ? []
                        : [finalized.resolution],
                  },
                });
              } else {
                yield* applyAggregateFrontendCommand({
                  ...target,
                  command: finalized,
                });
              }
              expect(
                yield* applyAggregateFrontendCommand({
                  ...target,
                  command: finalized,
                }),
              ).toBe('duplicate');
              expect(
                db.select().from(sessionMetadataDrizzleSchema).get(),
              ).toMatchObject({
                userIndex: 3,
                aggregateIndex: 2,
                pushIndex: 0,
              });
              expect(
                db
                  .select()
                  .from(sessionOptimisticAppliedMutationDrizzleSchema)
                  .all(),
              ).toEqual([]);
              if (rejected) {
                expect(
                  db.select().from(dbConfig.schema.list).get(),
                ).toBeUndefined();
              } else {
                expect(
                  db.select().from(dbConfig.schema.list).get(),
                ).toMatchObject({ id: 'lst_pending', name: 'Authoritative' });
              }
              expect(
                JSON.parse(
                  db.select().from(sessionCommandJournalDrizzleSchema).get()!
                    .command,
                ),
              ).toMatchObject({
                id: local.id,
                sessionId: 'sesn_progress',
                aggregateIndex: 2,
              });
              expect(
                db.select().from(sessionCommandJournalDrizzleSchema).get(),
              ).toMatchObject({ pushIndex: 2 });
            }),
        );
      }
    }
  });
});
