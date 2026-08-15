import { describe, it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { applyAggregateFrontendState } from '@zerospin/core/session/applyAggregateFrontendState';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { EitherSchema } from '@zerospin/core/utils/encodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { makeTestGateway } from '@zerospin/dev-worker/makeTestGateway';
import { makeWorkerdE2eTestLayer } from '@zerospin/dev-worker/vitest/makeWorkerdE2eTestLayer';
import { env } from 'cloudflare:test';
import { Effect, Either, Schema } from 'effect';
import { getAggregateBlockRepo } from 'system-worker/AggregateBlockRepo/getAggregateBlockRepo/getAggregateBlockRepo';
import { getAggregateFrontendRepo } from 'system-worker/AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { expect } from 'vitest';

import { SourceItem } from '../src/domain';
import { projection } from '../src/projection';
import { ProjectedItem } from '../src/projectionDomain';
import { authenticationSignature, system } from '../src/system';

const E2E_AGGREGATE_ID = makeAggregateId({ id: '1' });
const E2E_CLERK_USER_ID = 'uid_frontend_adapters_workerd_user';
const E2E_USER_ID = E2E_CLERK_USER_ID;
const aggregateFrontendLock =
  makeFrontendControllerSpec(projection).aggregateFrontendLock;

const TestLayer = makeWorkerdE2eTestLayer('frontendAdapters');

describe('frontendAdapters: generation-acquired aggregate frontend projection', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'adapts bootstrap, live insert, pushed update convergence, and delete through the compiled runtime',
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const bootstrapItemId = yield* SourceItem.makeId();
            const createBootstrapItem =
              yield* system.aggregates.aggregate.makeCommand({
                contractName: 'createSourceItem',
                aggregateId: E2E_AGGREGATE_ID,
                systemName: projection.systemName,
                payload: {
                  id: bootstrapItemId,
                  userId: E2E_USER_ID,
                  quantity: 2,
                },
              });
            const encodedCreateBootstrapItem = {
              ...createBootstrapItem,
              payload:
                yield* system.aggregates.aggregate.contracts.createSourceItem.encodePayload(
                  { payload: createBootstrapItem.payload },
                ),
            };

            const { gatewayApi, generationId } = yield* Effect.acquireRelease(
              makeAsync(makeTestGateway),
              opened => Effect.sync(() => opened.gatewayApi[Symbol.dispose]()),
            );
            const systemApi = yield* makeAsync(
              async () =>
                await gatewayApi.getSystemApi({ zerospinSecretKey: 'sk_test' }),
            );
            const bootstrapBlock = yield* makeAsync(
              async () =>
                await systemApi.finalizeAggregateCommands({
                  traceContext: null,
                  args: [
                    {
                      aggregateId: E2E_AGGREGATE_ID,
                      aggregateName: projection.aggregateName,
                      commands: [encodedCreateBootstrapItem],
                    },
                  ],
                }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(bootstrapBlock.failedCommands).toEqual([]);

            const authenticationLock = yield* makeAuthenticationLock({
              signature: authenticationSignature,
            });
            const authenticatedApi = yield* makeAsync(
              async () =>
                await gatewayApi.getAuthenticatedApi({
                  publishableKey: 'pk_test',
                  authenticationLock,
                  signature: { clerkUserId: E2E_CLERK_USER_ID },
                }),
            );
            yield* makeAsync(
              async () => await authenticatedApi.getAuthentication(),
            ).pipe(Effect.flatMap(decodeRpc));
            const frontendApi = yield* makeAsync(
              async () =>
                await authenticatedApi.getAggregateFrontendApi({
                  aggregateId: E2E_AGGREGATE_ID,
                  aggregateName: projection.aggregateName,
                  frontendName: projection.frontendName,
                  aggregateFrontendLock,
                }),
            );
            const admission = yield* makeAsync(
              async () => await frontendApi.getAdmission(),
            ).pipe(Effect.flatMap(decodeRpc));
            expect(admission.actorRef).toEqual({
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: projection.aggregateName,
              userId: E2E_USER_ID,
            });
            expect(admission.aggregateFrontendLock).toEqual(
              aggregateFrontendLock,
            );
            const bootstrapState = yield* makeAsync(
              async () =>
                await frontendApi.getState({ traceContext: null, args: [] }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(bootstrapState.resources).toEqual([
              expect.objectContaining({
                id: bootstrapItemId,
                modelName: ProjectedItem.modelName,
                quantity: 2,
              }),
            ]);

            const generationState = yield* makeAsync(() =>
              SystemRepo.getRepo({
                systemId: env.ZEROSPIN_SYSTEM_ID,
              }).getGenerationState({ generationId }),
            ).pipe(Effect.flatMap(decodeRpc));
            expect(
              generationState?.activeSystemSpec?.aggregates.aggregate?.frontends
                .projection?.models,
            ).toEqual({
              projectedItem: {
                modelName: SourceItem.modelName,
                hasProjectionAdapter: true,
              },
            });

            const aggregateBlockRepo = yield* getAggregateBlockRepo({
              key: {
                generationId,
                aggregateId: E2E_AGGREGATE_ID,
                aggregateName: projection.aggregateName,
              },
            });
            const aggregateFrontendRepoKey = {
              generationId,
              aggregateId: E2E_AGGREGATE_ID,
              aggregateName: projection.aggregateName,
              userId: E2E_USER_ID,
              frontendName: projection.frontendName,
            };
            const aggregateFrontendRepo = yield* getAggregateFrontendRepo({
              key: aggregateFrontendRepoKey,
            });

            const insertedItemId = yield* SourceItem.makeId();
            const createInsertedItem =
              yield* system.aggregates.aggregate.makeCommand({
                contractName: 'createSourceItem',
                aggregateId: E2E_AGGREGATE_ID,
                systemName: projection.systemName,
                payload: {
                  id: insertedItemId,
                  userId: E2E_USER_ID,
                  quantity: 4,
                },
              });
            const encodedCreateInsertedItem = {
              ...createInsertedItem,
              payload:
                yield* system.aggregates.aggregate.contracts.createSourceItem.encodePayload(
                  { payload: createInsertedItem.payload },
                ),
            };
            const insertBlock = yield* makeAsync(
              async () =>
                await systemApi.finalizeAggregateCommands({
                  traceContext: null,
                  args: [
                    {
                      aggregateId: E2E_AGGREGATE_ID,
                      aggregateName: projection.aggregateName,
                      commands: [encodedCreateInsertedItem],
                    },
                  ],
                }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(insertBlock.failedCommands).toEqual([]);
            yield* makeAsync(() =>
              aggregateBlockRepo.drainAggregateFrontendOutbox(),
            ).pipe(Effect.flatMap(decodeRpc));

            const insertedState = yield* makeAsync(
              async () =>
                await frontendApi.getState({ traceContext: null, args: [] }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(insertedState.resources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  id: insertedItemId,
                  modelName: ProjectedItem.modelName,
                  quantity: 4,
                }),
              ]),
            );

            const sessionId = yield* makeIdFromAbbreviation({
              abbreviation: 'sesn',
            });
            const session = makeSession({
              frontend: projection,
              sessionId,
            });
            const models = getFrontendDbModels(session.frontend);
            const dbConfig = makeResourceDbConfig({
              models,
              otherTables: sessionRepoTables,
            });
            const db = yield* makeMigratedInMemoryWasmSqliteDb({ dbConfig });
            yield* applyAggregateFrontendState({
              frontend: projection,
              aggregateId: insertedState.aggregateId,
              userId: insertedState.userId,
              systemId: insertedState.systemId,
              db,
              schema: dbConfig.schema,
              models,
              frontendState: insertedState,
            });
            session.store.setState({
              sessionId,
              aggregateId: insertedState.aggregateId,
              aggregateName: projection.aggregateName,
              userId: insertedState.userId,
              systemId: insertedState.systemId,
              systemVersion: insertedState.systemVersion,
              frontendName: projection.frontendName,
              db,
              schema: dbConfig.schema,
              models,
              vfsName: null,
              isInitialized: true,
              frontendIndex: insertedState.frontendIndex,
              replicaIndex: null,
              lastRebasedPushedCursor: insertedState.lastRebasedPushedCursor,
            });

            const stagedUpdate = yield* decodeRpc(
              session.stageCommand({
                contractName: 'updateSourceItemQuantity',
                payload: { id: insertedItemId, quantity: 7 },
              }),
            );
            const stagedRows = db
              .select()
              .from(sessionStagedCommandDrizzleSchema)
              .all();
            const pushed = yield* makeAsync(
              async () =>
                await frontendApi.pushCommands({
                  traceContext: null,
                  args: [{ commands: stagedRows }],
                }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(pushed.failedStagedCommands).toEqual([]);
            expect(pushed.failedPushedCommands).toEqual([]);
            expect(pushed.pushedCommands[0]?.id).toBe(stagedUpdate.id);

            const pushedUpdateState = yield* makeAsync(
              async () =>
                await frontendApi.getState({ traceContext: null, args: [] }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(pushedUpdateState.resources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: insertedItemId, quantity: 7 }),
              ]),
            );

            yield* makeAsync(() =>
              aggregateFrontendRepo.drainPushedBlockOutbox(),
            ).pipe(
              Effect.flatMap(Schema.decodeUnknown(EitherSchema)),
              Effect.flatMap(
                Either.match({
                  onLeft: Effect.fail,
                  onRight: Effect.succeed,
                }),
              ),
            );
            yield* makeAsync(() =>
              aggregateBlockRepo.drainAggregateFrontendOutbox(),
            ).pipe(Effect.flatMap(decodeRpc));

            const convergedState = yield* makeAsync(
              async () =>
                await frontendApi.getState({ traceContext: null, args: [] }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(convergedState.resources).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: insertedItemId, quantity: 7 }),
              ]),
            );
            expect(convergedState.pushedCommands).toEqual([]);

            const deleteInsertedItem =
              yield* system.aggregates.aggregate.makeCommand({
                contractName: 'deleteSourceItem',
                aggregateId: E2E_AGGREGATE_ID,
                systemName: projection.systemName,
                payload: { id: insertedItemId },
              });
            const encodedDeleteInsertedItem = {
              ...deleteInsertedItem,
              payload:
                yield* system.aggregates.aggregate.contracts.deleteSourceItem.encodePayload(
                  { payload: deleteInsertedItem.payload },
                ),
            };
            const deleteBlock = yield* makeAsync(
              async () =>
                await systemApi.finalizeAggregateCommands({
                  traceContext: null,
                  args: [
                    {
                      aggregateId: E2E_AGGREGATE_ID,
                      aggregateName: projection.aggregateName,
                      commands: [encodedDeleteInsertedItem],
                    },
                  ],
                }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(deleteBlock.failedCommands).toEqual([]);
            yield* makeAsync(() =>
              aggregateBlockRepo.drainAggregateFrontendOutbox(),
            ).pipe(Effect.flatMap(decodeRpc));

            const deletedState = yield* makeAsync(
              async () =>
                await frontendApi.getState({ traceContext: null, args: [] }),
            ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
            expect(
              deletedState.resources.find(
                resource => resource.id === insertedItemId,
              ),
            ).toBeUndefined();
            expect(deletedState.resources).toEqual([
              expect.objectContaining({
                id: bootstrapItemId,
                modelName: ProjectedItem.modelName,
                quantity: 2,
              }),
            ]);
          }),
        ).pipe(Effect.provide(AsyncLive)),
      120_000,
    );
  });
});
