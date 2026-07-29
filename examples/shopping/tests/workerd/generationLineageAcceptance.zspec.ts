import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeMigratedInMemoryWasmSqliteDb } from '@zerospin/core/drizzle/makeMigratedInMemoryWasmSqliteDb';
import { getFrontendDbModels } from '@zerospin/core/frontendController/getFrontendDbModels';
import { makeSession } from '@zerospin/core/session/makeSession';
import { sessionStagedCommandDrizzleSchema } from '@zerospin/core/session/sessionCommandShape';
import { sessionRepoTables } from '@zerospin/core/session/sessionRepoTables';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAccountId } from '@zerospin/core/utils/makeAccountId';
import { makeIdFromAbbreviation } from '@zerospin/core/utils/makeIdFromAbbreviation';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { SystemWorkerResolver } from '@zerospin/dispatch-worker/SystemWorkerResolver/SystemWorkerResolver';
import { WorkerExportsSystemWorkerResolver } from '@zerospin/dispatch-worker/SystemWorkerResolver/WorkerExportsSystemWorkerResolver';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import {
  makeTelemetryCollector,
  makeTraceableRpcTarget,
  TelemetryCollector,
} from '@zerospin/logger';
import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { getAccountBlockRepo } from 'system-worker/AccountBlockRepo/getAccountBlockRepo/getAccountBlockRepo';
import { AccountRepo } from 'system-worker/AccountRepo/AccountRepo';
import { getAccountRepo } from 'system-worker/AccountRepo/getAccountRepo/getAccountRepo';
import { getActorBlockRepo } from 'system-worker/ActorBlockRepo/getActorBlockRepo/getActorBlockRepo';
import { drainGeneration } from 'system-worker/drainGeneration/drainGeneration';
import { FrontendBlockRepo } from 'system-worker/FrontendBlockRepo/FrontendBlockRepo';
import { getFrontendBlockRepo } from 'system-worker/FrontendBlockRepo/getFrontendBlockRepo/getFrontendBlockRepo';
import { FrontendRepo } from 'system-worker/FrontendRepo/FrontendRepo';
import { getFrontendRepo } from 'system-worker/FrontendRepo/getFrontendRepo/getFrontendRepo';
import { managedRuntime } from 'system-worker/managedRuntime';
import { openGeneration } from 'system-worker/openGeneration/openGeneration';
import { prepareGeneration } from 'system-worker/prepareGeneration/prepareGeneration';
import { getServiceBlockRepo } from 'system-worker/ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo';
import { getServiceFrontendBlockRepo } from 'system-worker/ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo';
import { ServiceFrontendBlockRepo } from 'system-worker/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo';
import { getServiceFrontendRepo } from 'system-worker/ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo';
import { ServiceFrontendRepo } from 'system-worker/ServiceFrontendRepo/ServiceFrontendRepo';
import { getServiceRepo } from 'system-worker/ServiceRepo/getServiceRepo/getServiceRepo';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import { executeInRepo } from 'system-worker/workerd-utils/executeInRepo';
import { expect, vi } from 'vitest';

import { catalogFrontend, shopperFrontend } from '@/zerospin/frontend';
import { Cart, User } from '@/zerospin/models';
import { appService, system, userAccount } from '@/zerospin/system';

const TestLayer = makeWorkerdE2eTestLayer(
  'shoppingGenerationLineageAcceptance',
);

describe('shopping generation lineage acceptance', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'carries account and service frontends through finite G1 to G2 to G3 lineage, target tickets, strict replay, repair controls, and superseded rooms',
      () =>
        /*
         * 1. Open a real Shopping G1 and create authoritative account/service rows.
         * 2. Create root account/service projections before freeze and ordinary blocks.
         * 3. Admit two frontend commands and one service write, leaving them for drain.
         * 4. Freeze G1, prove finite bounds, closed writes, and fresh account/service reconnects.
         * 5. Prove new post-freeze targets are snapshot-only no-local segments.
         * 6. Prepare G2 through real replay and prove one no-emission boundary per family.
         * 7. Open G2, create genuinely new root targets, and insert one empty lineage hop.
         * 8. Keep G1 rooms live, promote G2, and prove generation-superseded closure.
         * 9. Hold G2 archive acknowledgements and prove successor ticket mint waits.
         * 10. Resume each G1 ancestor through its exact suffix and first G2 boundary.
         * 11. Reconnect with fresh target tickets, then prove replay-before-live delivery.
         * 12. Write in G2, freeze it, and prepare/open/promote a real G3 successor.
         * 13. Resume G1 directly to G3 without exposing G2 ordinary indexed blocks.
         * 14. Prove ahead, missing, unrelated, invalid-ancestry, and corrupt state repair.
         * 15. Reconnect G3 with fresh one-use target tickets and finish in live mode.
         */
        Effect.gen(function* () {
          const generation1 = 'gen_shopping_lineage_acceptance_g1';
          const generation2 = 'gen_shopping_lineage_acceptance_g2';
          const skippedGeneration = 'gen_shopping_lineage_acceptance_skipped';
          const generation3 = 'gen_shopping_lineage_acceptance_g3';
          const deploy1 = 'dpl_shopping_lineage_acceptance_g1';
          const deploy2 = 'dpl_shopping_lineage_acceptance_g2';
          const skippedDeploy = 'dpl_shopping_lineage_acceptance_skipped';
          const deploy3 = 'dpl_shopping_lineage_acceptance_g3';
          const accountId = makeAccountId({ id: '1' });
          const clerkUserId = 'shopping_lineage_acceptance_user';
          const actorId = prefixActorId(clerkUserId);
          const postFreezeActorId = prefixActorId(
            'shopping_lineage_post_freeze_user',
          );
          const serviceViewer = 'shopping_lineage_acceptance_viewer';
          const serviceActorId = prefixActorId(serviceViewer);
          const postFreezeServiceViewer = 'shopping_lineage_post_freeze_viewer';
          const postFreezeServiceActorId = prefixActorId(
            postFreezeServiceViewer,
          );
          const systemSpec = makeSystemSpec({ system });
          const resolver = yield* SystemWorkerResolver;
          using systemWorker = resolver.get({
            systemWorkerName: 'sys_shopping:local',
          });

          // 1 — an isolated G1 uses the actual Shopping SystemSpec and lifecycle.
          const preparedGeneration1 = yield* prepareGeneration({
            deployId: deploy1,
            generationId: generation1,
            prevGenerationId: null,
            systemSpec,
            seeds: [],
          });
          expect(preparedGeneration1).toEqual({
            deployId: deploy1,
            generationId: generation1,
            readiness: 'ready',
            reusedGeneration: false,
          });
          yield* openGeneration({
            deployId: deploy1,
            generationId: generation1,
          });

          const sourceProductA = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G1 source product A',
              description: 'present before either service projection',
              price: 10,
            },
          });
          const sourceProductAResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy1,
              generationId: generation1,
              serviceName: appService.name,
              commands: [sourceProductA],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceProductAResult.failedCommands).toEqual([]);
          const generation1ServiceRepo = yield* getServiceRepo({
            key: { generationId: generation1, serviceName: appService.name },
          });
          yield* makeAsync(() =>
            generation1ServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const userId = User.prefixId(clerkUserId);
          const sourceCreateUser = yield* userAccount.makeCommand({
            contractName: 'createUser',
            accountId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, clerkUserId },
          });
          const generation1AccountRepo = yield* getAccountRepo({
            key: {
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const createdUserBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(generation1AccountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: shopperFrontend.accountName,
              commands: [sourceCreateUser],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(createdUserBlock.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            generation1AccountRepo.drainAccountOutboxes(),
          ).pipe(Effect.flatMap(decodeRpc));

          // 2 — both logical frontends become real root segments before freeze.
          const authenticatedActor = yield* makeAsync(() =>
            systemWorker.authenticate({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              signature: { clerkUserId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(authenticatedActor).toEqual({ accountId, actorId });
          yield* makeAsync(() =>
            systemWorker.authorize({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              actor: authenticatedActor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const sourceAccountStateAtRoot = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceAccountStateAtRoot).toMatchObject({
            generationId: generation1,
            frontendIndex: 0,
            accountId,
            actorId,
          });

          const authenticatedServiceActorId = yield* makeAsync(() =>
            systemWorker.authenticateServiceFrontend({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              frontendName: catalogFrontend.frontendName,
              signature: { viewerId: serviceViewer },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(authenticatedServiceActorId).toBe(serviceActorId);
          const sourceServiceStateAtRoot = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceServiceStateAtRoot).toMatchObject({
            generationId: generation1,
            frontendIndex: 0,
            serviceName: catalogFrontend.serviceName,
            actorId: serviceActorId,
          });
          expect(sourceServiceStateAtRoot.resources).toEqual([
            expect.objectContaining({ id: sourceProductA.payload.id }),
          ]);

          const generation1FrontendRepo = yield* getFrontendRepo({
            key: {
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation1FrontendBlockRepo = yield* getFrontendBlockRepo({
            key: {
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation1ServiceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            },
          });
          const generation1ServiceFrontendBlockRepo =
            yield* getServiceFrontendBlockRepo({
              key: {
                generationId: generation1,
                serviceName: catalogFrontend.serviceName,
                actorName: catalogFrontend.actorName,
                actorId: serviceActorId,
                frontendName: catalogFrontend.frontendName,
              },
            });
          const sourceAccountRootDescriptor = yield* makeAsync(() =>
            generation1FrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          const sourceServiceRootDescriptor = yield* makeAsync(() =>
            generation1ServiceFrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceAccountRootDescriptor.predecessor).toBeNull();
          expect(sourceServiceRootDescriptor.predecessor).toBeNull();

          const sourceUpdateUser = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, name: 'G1 projected user' },
          });
          const sourceUpdateUserBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(generation1AccountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: shopperFrontend.accountName,
              commands: [sourceUpdateUser],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(sourceUpdateUserBlock.failedCommands).toEqual([]);
          const generation1AccountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const generation1ActorBlockRepo = yield* getActorBlockRepo({
            key: {
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId,
            },
          });
          yield* makeAsync(() =>
            generation1AccountRepo.drainAccountOutboxes(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation1AccountBlockRepo.drainActorOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation1ActorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation1FrontendRepo.drainFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const sourceProductB = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G1 source product B',
              description: 'ordinary projected service block',
              price: 20,
            },
          });
          const sourceProductBResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy1,
              generationId: generation1,
              serviceName: appService.name,
              commands: [sourceProductB],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceProductBResult.failedCommands).toEqual([]);
          const generation1ServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: generation1, serviceName: appService.name },
          });
          yield* makeAsync(() =>
            generation1ServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation1ServiceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation1ServiceFrontendRepo.drainServiceFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          // 3 — two accepted account commands remain pending until freeze drains them.
          const sessionId = yield* makeIdFromAbbreviation({
            abbreviation: 'sesn',
          });
          const session = makeSession({
            frontend: shopperFrontend,
            generateSignature: () => Effect.succeed({ clerkUserId }),
            sessionId,
          });
          const sessionModels = getFrontendDbModels(session.frontend);
          const sessionDbConfig = makeResourceDbConfig({
            models: sessionModels,
            otherTables: sessionRepoTables,
          });
          const { schema: sessionSchema } = sessionDbConfig;
          const sessionDb = yield* makeMigratedInMemoryWasmSqliteDb({
            dbConfig: sessionDbConfig,
          });
          sessionDb
            .insert(sessionModels.user.drizzleSchema)
            .values({
              actorId,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              id: userId,
              modelName: 'user',
              name: 'G1 projected user',
              pushedCursor: null,
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
              version: '1.0.0',
            })
            .run();
          session.store.setState({
            sessionId,
            accountId,
            accountName: shopperFrontend.accountName,
            actorId,
            systemId: sourceAccountStateAtRoot.systemId,
            generationId: generation1,
            systemVersion: system.version,
            systemWorkerName: 'sys_shopping:local',
            frontendName: shopperFrontend.frontendName,
            frontendVersion: shopperFrontend.version,
            db: sessionDb,
            schema: sessionSchema,
            models: sessionModels,
            vfsName: null,
            isInitialized: true,
            frontendIndex: sourceAccountStateAtRoot.frontendIndex,
            replicaIndex: null,
            lastRebasedPushedCursor: null,
            isPushPaused: false,
            isSharedWorkerEnabled: false,
            workerState: {
              mode: 'direct',
              status: 'online',
              bootstrapSource: 'network',
              frontendIndex: sourceAccountStateAtRoot.frontendIndex,
              replicaIndex: null,
              databaseName: null,
              failure: null,
            },
          });
          const cartIdThatConflicts = yield* Cart.makeId();
          const stagedUpdateThatExecutes = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateUser',
              payload: { id: userId, name: 'G1 pushed user update' },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const stagedCartThatConflicts = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'createCart',
              payload: { id: cartIdThatConflicts, userId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const stagedUpdateRejectedAfterFreeze = yield* Effect.promise(() =>
            session.stageCommand({
              contractName: 'updateUser',
              payload: { id: userId, name: 'Rejected post-freeze update' },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const stagedRows = sessionDb
            .select()
            .from(sessionStagedCommandDrizzleSchema)
            .all();
          const firstStagedRow = stagedRows[0];
          const secondStagedRow = stagedRows[1];
          const thirdStagedRow = stagedRows[2];
          if (
            firstStagedRow === undefined ||
            secondStagedRow === undefined ||
            thirdStagedRow === undefined
          ) {
            return yield* Effect.fail(
              new Error('Expected three staged Shopping cart commands'),
            );
          }
          expect(firstStagedRow.id).toBe(stagedUpdateThatExecutes.id);
          expect(secondStagedRow.id).toBe(stagedCartThatConflicts.id);
          expect(thirdStagedRow.id).toBe(stagedUpdateRejectedAfterFreeze.id);

          // Explicit test setup seeds the conflicting authoritative row in the
          // real AccountRepo database without manufacturing an outbox event.
          // The frontend snapshot therefore still accepts its optimistic cart,
          // while the real pushed-block finalization returns a normal terminal
          // AccountRepo failure for the duplicate id.
          const seededConflictingCart = yield* Schema.validate(
            Cart.resourceSchema,
          )({
            id: cartIdThatConflicts,
            userId,
            modelName: Cart.modelName,
            version: Cart.version,
            createdAt: new Date('2026-01-02T00:00:00.000Z'),
            updatedAt: new Date('2026-01-02T00:00:00.000Z'),
          });
          yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAccountRepo,
              repo: AccountRepo,
              key: {
                generationId: generation1,
                accountId,
                accountName: shopperFrontend.accountName,
              },
              fn: ({ db, schema }) => {
                db.insert(schema.cart).values(seededConflictingCart).run();
              },
            }),
          );

          const admittedPush = yield* makeAsync(() =>
            systemWorker.pushCommands({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              commands: [firstStagedRow, secondStagedRow],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(admittedPush.pendingCommands).toEqual([]);
          expect(admittedPush.failedCommands).toEqual([]);
          expect(admittedPush.pushedCommands).toHaveLength(2);

          const sourceProductC = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G1 source product C',
              description: 'admitted but left for finite drain',
              price: 30,
            },
          });
          const sourceProductCResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy1,
              generationId: generation1,
              serviceName: appService.name,
              commands: [sourceProductC],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(sourceProductCResult.failedCommands).toEqual([]);

          // The predecessor rooms must already exist while G1 is open. Their
          // tickets are minted before freeze; the sockets stay attached while
          // the finite admitted work drains and until promotion supersedes G1.
          const accountRoomStateBeforeFreeze = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const serviceRoomStateBeforeFreeze = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const predecessorAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const predecessorServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const predecessorAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          predecessorAccountUrl.searchParams.set('publishableKey', 'pk_test');
          predecessorAccountUrl.searchParams.set(
            'ticket',
            predecessorAccountTicket.ticket,
          );
          const predecessorServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          predecessorServiceUrl.searchParams.set('publishableKey', 'pk_test');
          predecessorServiceUrl.searchParams.set(
            'ticket',
            predecessorServiceTicket.ticket,
          );
          const predecessorAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(predecessorAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const predecessorServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(predecessorServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(predecessorAccountResponse.status).toBe(101);
          expect(predecessorServiceResponse.status).toBe(101);
          const predecessorAccountSocket = predecessorAccountResponse.webSocket;
          const predecessorServiceSocket = predecessorServiceResponse.webSocket;
          if (
            predecessorAccountSocket === null ||
            predecessorServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both predecessor WebSocket rooms'),
            );
          }
          predecessorAccountSocket.accept();
          predecessorServiceSocket.accept();
          const predecessorAccountMessages: unknown[] = [];
          const predecessorServiceMessages: unknown[] = [];
          let predecessorAccountCloseCode: number | null = null;
          let predecessorAccountCloseReason: string | null = null;
          let predecessorServiceCloseCode: number | null = null;
          let predecessorServiceCloseReason: string | null = null;
          predecessorAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              predecessorAccountMessages.push(JSON.parse(event.data));
            }
          });
          predecessorServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              predecessorServiceMessages.push(JSON.parse(event.data));
            }
          });
          predecessorAccountSocket.addEventListener('close', event => {
            predecessorAccountCloseCode = event.code;
            predecessorAccountCloseReason = event.reason;
          });
          predecessorServiceSocket.addEventListener('close', event => {
            predecessorServiceCloseCode = event.code;
            predecessorServiceCloseReason = event.reason;
          });
          predecessorAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: accountRoomStateBeforeFreeze.frontendIndex,
            }),
          );
          predecessorServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: serviceRoomStateBeforeFreeze.frontendIndex,
            }),
          );
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(predecessorAccountMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'replay-complete',
                      generationId: generation1,
                    }),
                  ]),
                );
                expect(predecessorServiceMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'replay-complete',
                      generationId: generation1,
                    }),
                  ]),
                );
              },
              { timeout: 30_000, interval: 25 },
            ),
          );

          // 4 — freeze closes new writes, drains the finite admitted set, and
          // retains read admission over exact immutable account/service bounds.
          const frozenGeneration1 = yield* drainGeneration({
            deployId: deploy1,
            generationId: generation1,
            mode: 'freeze',
            successorGenerationId: null,
          });
          expect(frozenGeneration1).toEqual({
            deployId: deploy1,
            generationId: generation1,
            admission: 'draining',
          });
          const generation1State = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation1,
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          if (generation1State === null) {
            return yield* Effect.fail(
              new Error('Expected frozen G1 generation state'),
            );
          }
          const generation1AccountBound = generation1State.drainBounds.find(
            bound =>
              bound.repoType === 'FrontendRepo' &&
              bound.repoName.includes(actorId),
          );
          const generation1ServiceBound = generation1State.drainBounds.find(
            bound =>
              bound.repoType === 'ServiceFrontendRepo' &&
              bound.repoName.includes(serviceActorId),
          );
          if (
            generation1AccountBound === undefined ||
            generation1ServiceBound === undefined ||
            generation1AccountBound.frontendBlockRepoName === null ||
            generation1ServiceBound.frontendBlockRepoName === null ||
            generation1AccountBound.terminalFrontendIndex === null ||
            generation1ServiceBound.terminalFrontendIndex === null
          ) {
            return yield* Effect.fail(
              new Error('Expected complete account and service G1 bounds'),
            );
          }
          expect(generation1State).toMatchObject({
            admission: 'draining',
            drainFrozenAt: expect.any(Date),
          });
          expect(generation1AccountBound).toMatchObject({
            segmentKind: 'root',
            predecessorGenerationId: null,
            predecessorRepoName: null,
            predecessorTerminalFrontendIndex: null,
          });
          expect(generation1ServiceBound).toMatchObject({
            segmentKind: 'root',
            predecessorGenerationId: null,
            predecessorRepoName: null,
            predecessorTerminalFrontendIndex: null,
          });

          const repeatedFrozenGeneration1 = yield* drainGeneration({
            deployId: deploy1,
            generationId: generation1,
            mode: 'freeze',
            successorGenerationId: null,
          });
          expect(repeatedFrozenGeneration1).toEqual(frozenGeneration1);
          const repeatedGeneration1State = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation1,
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(repeatedGeneration1State?.drainFrozenAt).toEqual(
            generation1State.drainFrozenAt,
          );
          expect(repeatedGeneration1State?.drainBounds).toEqual(
            generation1State.drainBounds,
          );

          const settledSourceAccountState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const settledSourceServiceState = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(settledSourceAccountState.frontendIndex).toBe(
            generation1AccountBound.terminalFrontendIndex,
          );
          expect(settledSourceAccountState.pushedCommands).toEqual([]);
          expect(settledSourceAccountState.executedPushedCommands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: stagedUpdateThatExecutes.id }),
            ]),
          );
          expect(settledSourceAccountState.failedPushedCommands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: stagedCartThatConflicts.id }),
            ]),
          );
          expect(settledSourceServiceState.frontendIndex).toBe(
            generation1ServiceBound.terminalFrontendIndex,
          );
          expect(settledSourceServiceState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: sourceProductA.payload.id }),
              expect.objectContaining({ id: sourceProductB.payload.id }),
              expect.objectContaining({ id: sourceProductC.payload.id }),
            ]),
          );

          const rejectedPostFreezePush = yield* makeAsync(() =>
            systemWorker.pushCommands({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              commands: [thirdStagedRow],
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(rejectedPostFreezePush._tag).toBe('Left');
          if (rejectedPostFreezePush._tag === 'Left') {
            expect(rejectedPostFreezePush.left.code).toBe(
              'generation-write-admission-closed',
            );
          }
          const rejectedPostFreezeServiceCommand =
            yield* appService.makeCommand({
              contractName: 'createProduct',
              systemVersion: system.version,
              payload: {
                name: 'Rejected post-freeze product',
                description: 'must not prolong G1 drain',
                price: 40,
              },
            });
          const rejectedPostFreezeServiceWrite = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy1,
              generationId: generation1,
              serviceName: appService.name,
              commands: [rejectedPostFreezeServiceCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(rejectedPostFreezeServiceWrite._tag).toBe('Left');
          if (rejectedPostFreezeServiceWrite._tag === 'Left') {
            expect(rejectedPostFreezeServiceWrite.left.code).toBe(
              'generation-write-admission-closed',
            );
          }
          const stateAfterRejectedWrites = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation1,
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(stateAfterRejectedWrites?.drainFrozenAt).toEqual(
            generation1State.drainFrozenAt,
          );
          expect(stateAfterRejectedWrites?.drainBounds).toEqual(
            generation1State.drainBounds,
          );

          // Write admission is now durably closed, but G1 is still the
          // read-routable authority until promotion. Fresh account and service
          // tickets must therefore stay generation-local and allow an exact
          // same-generation resume against each frozen source archive.
          const drainingAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const drainingServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(drainingAccountTicket).toMatchObject({
            generationId: generation1,
            accountId,
            actorId,
          });
          expect(drainingServiceTicket).toMatchObject({
            generationId: generation1,
            serviceName: catalogFrontend.serviceName,
            actorId: serviceActorId,
          });

          const drainingAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          drainingAccountUrl.searchParams.set('publishableKey', 'pk_test');
          drainingAccountUrl.searchParams.set(
            'ticket',
            drainingAccountTicket.ticket,
          );
          const drainingServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          drainingServiceUrl.searchParams.set('publishableKey', 'pk_test');
          drainingServiceUrl.searchParams.set(
            'ticket',
            drainingServiceTicket.ticket,
          );
          const drainingAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(drainingAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const drainingServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(drainingServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(drainingAccountResponse.status).toBe(101);
          expect(drainingServiceResponse.status).toBe(101);
          const drainingAccountSocket = drainingAccountResponse.webSocket;
          const drainingServiceSocket = drainingServiceResponse.webSocket;
          if (
            drainingAccountSocket === null ||
            drainingServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both draining G1 reconnect WebSockets'),
            );
          }
          drainingAccountSocket.accept();
          drainingServiceSocket.accept();
          const drainingAccountMessages: unknown[] = [];
          const drainingServiceMessages: unknown[] = [];
          drainingAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              drainingAccountMessages.push(JSON.parse(event.data));
            }
          });
          drainingServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              drainingServiceMessages.push(JSON.parse(event.data));
            }
          });
          drainingAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: settledSourceAccountState.frontendIndex,
            }),
          );
          drainingServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: settledSourceServiceState.frontendIndex,
            }),
          );
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(drainingAccountMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'replay-complete',
                      generationId: generation1,
                      frontendIndex: settledSourceAccountState.frontendIndex,
                    }),
                  ]),
                );
                expect(drainingServiceMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'replay-complete',
                      generationId: generation1,
                      frontendIndex: settledSourceServiceState.frontendIndex,
                    }),
                  ]),
                );
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
          const spentDrainingAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(drainingAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const spentDrainingServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(drainingServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(spentDrainingAccountResponse.status).toBe(401);
          expect(spentDrainingServiceResponse.status).toBe(401);
          drainingAccountSocket.close(1000, 'draining reconnect verified');
          drainingServiceSocket.close(1000, 'draining reconnect verified');

          // 5 — reads created after the durable freeze are snapshot-only and
          // neither register nor archive a physical segment in G1.
          const postFreezeAccountState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId: postFreezeActorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(postFreezeAccountState).toMatchObject({
            generationId: generation1,
            actorId: postFreezeActorId,
            frontendIndex: 0,
          });
          const authenticatedPostFreezeServiceActorId = yield* makeAsync(() =>
            systemWorker.authenticateServiceFrontend({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              frontendName: catalogFrontend.frontendName,
              signature: { viewerId: postFreezeServiceViewer },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(authenticatedPostFreezeServiceActorId).toBe(
            postFreezeServiceActorId,
          );
          const postFreezeServiceState = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: postFreezeServiceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(postFreezeServiceState).toMatchObject({
            generationId: generation1,
            actorId: postFreezeServiceActorId,
            frontendIndex: 0,
          });

          const postFreezeFrontendRepoName =
            yield* FrontendRepo.repoUtils.nameUtils.makeName({
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId: postFreezeActorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            });
          const postFreezeServiceFrontendRepoName =
            yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: postFreezeServiceActorId,
              frontendName: catalogFrontend.frontendName,
            });
          const postFreezeAccountStorage = yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_REPO.getByName(postFreezeFrontendRepoName),
              (_instance, state) => ({
                emissionMode: state.storage.kv.get('emissionMode'),
                segmentKind: state.storage.kv.get('segmentKind'),
              }),
            ),
          );
          const postFreezeServiceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: postFreezeServiceActorId,
              frontendName: catalogFrontend.frontendName,
            },
          });
          const postFreezeServiceReadiness = yield* makeAsync(() =>
            postFreezeServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(postFreezeAccountStorage).toEqual({
            emissionMode: 'read-only',
            segmentKind: 'no-local-segment',
          });
          expect(postFreezeServiceReadiness.segmentKind).toBe(
            'no-local-segment',
          );
          const generation1FrontendRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation1,
            }).getRepoRegistrations({
              repoType: 'FrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation1ServiceFrontendRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation1,
            }).getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(
            generation1FrontendRegistrations.some(
              registration =>
                registration.repoName === postFreezeFrontendRepoName,
            ),
          ).toBe(false);
          expect(
            generation1ServiceFrontendRegistrations.some(
              registration =>
                registration.repoName === postFreezeServiceFrontendRepoName,
            ),
          ).toBe(false);

          // 6 — make the persisted G1 spec represent an older compatible
          // frontend identity with a different service model definition. The
          // real generation preparation path must replay authoritative state,
          // install snapshot/no-emission projections, and append one boundary.
          const generation1PersistedSystemSpec = structuredClone(systemSpec);
          const generation1PersistedAppService =
            generation1PersistedSystemSpec.serviceControllers[appService.name];
          const generation1PersistedProduct =
            generation1PersistedAppService?.models.product;
          if (generation1PersistedProduct === undefined) {
            return yield* Effect.fail(
              new Error('Expected Shopping Product in the persisted G1 spec'),
            );
          }
          generation1PersistedProduct.indexes = [
            {
              name: 'g1_product_name_for_lineage_acceptance',
              columns: ['name'],
              unique: false,
            },
          ];
          const encodedGeneration1PersistedSystemSpec =
            Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
              generation1PersistedSystemSpec,
            );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation1}`),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                  encodedGeneration1PersistedSystemSpec,
                  generation1,
                );
              },
            ),
          );

          const preparedGeneration2 = yield* prepareGeneration({
            deployId: deploy2,
            generationId: generation2,
            prevGenerationId: generation1,
            systemSpec,
            seeds: [],
          });
          expect(preparedGeneration2).toEqual({
            deployId: deploy2,
            generationId: generation2,
            readiness: 'ready',
            reusedGeneration: false,
          });
          const preparedGeneration2State = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation2,
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(preparedGeneration2State).toMatchObject({
            generationId: generation2,
            prevGenerationId: generation1,
            initialDeployId: deploy2,
            readiness: 'ready',
            admission: 'closed',
          });

          const generation2FrontendRepo = yield* getFrontendRepo({
            key: {
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation2FrontendBlockRepo = yield* getFrontendBlockRepo({
            key: {
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation2ServiceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId: generation2,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            },
          });
          const generation2ServiceFrontendBlockRepo =
            yield* getServiceFrontendBlockRepo({
              key: {
                generationId: generation2,
                serviceName: catalogFrontend.serviceName,
                actorName: catalogFrontend.actorName,
                actorId: serviceActorId,
                frontendName: catalogFrontend.frontendName,
              },
            });
          const generation2AccountReadiness = yield* makeAsync(() =>
            generation2FrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceReadiness = yield* makeAsync(() =>
            generation2ServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2AccountReadiness.frontendIndex).toBe(
            generation1AccountBound.terminalFrontendIndex + 1,
          );
          expect(generation2ServiceReadiness).toMatchObject({
            frontendIndex: generation1ServiceBound.terminalFrontendIndex + 1,
            segmentKind: 'inherited',
            predecessorGenerationId: generation1,
            predecessorRepoName: generation1ServiceBound.frontendBlockRepoName,
            predecessorTerminalFrontendIndex:
              generation1ServiceBound.terminalFrontendIndex,
          });
          const generation2AccountDescriptor = yield* makeAsync(() =>
            generation2FrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceDescriptor = yield* makeAsync(() =>
            generation2ServiceFrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2AccountDescriptor.predecessor).toEqual({
            generationId: generation1,
            repoName: generation1AccountBound.frontendBlockRepoName,
            terminalFrontendIndex:
              generation1AccountBound.terminalFrontendIndex,
          });
          expect(generation2ServiceDescriptor.predecessor).toEqual({
            generationId: generation1,
            repoName: generation1ServiceBound.frontendBlockRepoName,
            terminalFrontendIndex:
              generation1ServiceBound.terminalFrontendIndex,
          });
          const generation2AccountBoundary = yield* makeAsync(() =>
            generation2FrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex: generation1AccountBound.terminalFrontendIndex,
              throughFrontendIndex:
                generation1AccountBound.terminalFrontendIndex + 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceBoundary = yield* makeAsync(() =>
            generation2ServiceFrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex: generation1ServiceBound.terminalFrontendIndex,
              throughFrontendIndex:
                generation1ServiceBound.terminalFrontendIndex + 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2AccountBoundary).toEqual([
            {
              kind: 'generation-boundary',
              systemId: sourceAccountStateAtRoot.systemId,
              prevGenerationId: generation1,
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              frontendIndex: generation1AccountBound.terminalFrontendIndex + 1,
            },
          ]);
          expect(generation2ServiceBoundary).toEqual([
            {
              kind: 'generation-boundary',
              systemId: sourceServiceStateAtRoot.systemId,
              prevGenerationId: generation1,
              generationId: generation2,
              serviceName: catalogFrontend.serviceName,
              actorId: serviceActorId,
              actorName: catalogFrontend.actorName,
              frontendName: catalogFrontend.frontendName,
              frontendIndex: generation1ServiceBound.terminalFrontendIndex + 1,
            },
          ]);

          yield* openGeneration({
            deployId: deploy2,
            generationId: generation2,
          });
          const generation2AuthenticatedActor = yield* makeAsync(() =>
            systemWorker.authenticate({
              deployId: deploy2,
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              signature: { clerkUserId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2AuthenticatedActor).toEqual({
            accountId,
            actorId,
          });
          yield* makeAsync(() =>
            systemWorker.authorize({
              deployId: deploy2,
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              actor: generation2AuthenticatedActor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2AccountState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy2,
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceState = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy2,
              generationId: generation2,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2AccountState).toMatchObject({
            generationId: generation2,
            frontendIndex: generation1AccountBound.terminalFrontendIndex + 1,
            executedPushedCommands:
              settledSourceAccountState.executedPushedCommands,
            failedPushedCommands:
              settledSourceAccountState.failedPushedCommands,
          });
          expect(generation2ServiceState).toMatchObject({
            generationId: generation2,
            frontendIndex: generation1ServiceBound.terminalFrontendIndex + 1,
          });
          expect(generation2ServiceState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: sourceProductA.payload.id }),
              expect.objectContaining({ id: sourceProductB.payload.id }),
              expect.objectContaining({ id: sourceProductC.payload.id }),
            ]),
          );

          // 7 — targets first read only after G1 froze were never physical G1
          // segments. Their first real G2 projections are roots, not inherited.
          const generation2PostFreezeAccountState = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy2,
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId: postFreezeActorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2PostFreezeServiceState = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy2,
              generationId: generation2,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: postFreezeServiceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2PostFreezeAccountState.frontendIndex).toBe(0);
          expect(generation2PostFreezeServiceState.frontendIndex).toBe(0);
          const generation2PostFreezeAccountBlockRepo =
            yield* getFrontendBlockRepo({
              key: {
                generationId: generation2,
                accountId,
                accountName: shopperFrontend.accountName,
                actorId: postFreezeActorId,
                actorName: shopperFrontend.actorName,
                frontendName: shopperFrontend.frontendName,
              },
            });
          const generation2PostFreezeServiceBlockRepo =
            yield* getServiceFrontendBlockRepo({
              key: {
                generationId: generation2,
                serviceName: catalogFrontend.serviceName,
                actorName: catalogFrontend.actorName,
                actorId: postFreezeServiceActorId,
                frontendName: catalogFrontend.frontendName,
              },
            });
          const generation2PostFreezeAccountDescriptor = yield* makeAsync(() =>
            generation2PostFreezeAccountBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2PostFreezeServiceDescriptor = yield* makeAsync(() =>
            generation2PostFreezeServiceBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2PostFreezeAccountDescriptor.predecessor).toBeNull();
          expect(generation2PostFreezeServiceDescriptor.predecessor).toBeNull();

          // The durable lifecycle contains one ready/drained generation that
          // never owned local projection archives. G2 points back through that
          // empty hop while its archive descriptor still names nearest real G1.
          const encodedSystemSpec = Schema.encodeUnknownSync(
            Schema.parseJson(SystemSpecSchema),
          )(systemSpec);
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${skippedGeneration}`),
              (_instance, state) => {
                state.storage.sql.exec(
                  `INSERT INTO generationState (
                    generationId, prevGenerationId, initialDeployId,
                    activeDeployId, preparingDeployId, readiness, admission,
                    activeSystemSpec, preparingSystemSpec, failure,
                    createdAt, readyAt, openedAt, drainFrozenAt, drainedAt,
                    successorGenerationId
                  ) VALUES (?, ?, ?, ?, NULL, 'ready', 'drained', ?, NULL, NULL, ?, ?, ?, ?, ?, ?)`,
                  skippedGeneration,
                  generation1,
                  skippedDeploy,
                  skippedDeploy,
                  encodedSystemSpec,
                  1,
                  2,
                  3,
                  4,
                  5,
                  generation2,
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation2}`),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE generationState SET prevGenerationId = ? WHERE generationId = ?',
                  skippedGeneration,
                  generation2,
                );
              },
            ),
          );

          // 8 — promoting through the empty lifecycle hop closes every real G1
          // room with the reserved generation-superseded signal.
          const completedGeneration1 = yield* drainGeneration({
            deployId: deploy1,
            generationId: generation1,
            mode: 'complete',
            successorGenerationId: skippedGeneration,
          });
          expect(completedGeneration1).toEqual({
            deployId: deploy1,
            generationId: generation1,
            admission: 'drained',
          });
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(predecessorAccountCloseCode).toBe(4001);
                expect(predecessorAccountCloseReason).toBe(
                  'generation-superseded',
                );
                expect(predecessorServiceCloseCode).toBe(4001);
                expect(predecessorServiceCloseReason).toBe(
                  'generation-superseded',
                );
              },
              { timeout: 30_000, interval: 25 },
            ),
          );

          // 9 — create one ordinary G2 block in each family. Temporarily make
          // each projection report an unacknowledged archive row; ticket mint
          // from drained G1 must follow the empty hop and stop on readiness.
          const generation2AccountRepo = yield* getAccountRepo({
            key: {
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const generation2AccountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const generation2ActorBlockRepo = yield* getActorBlockRepo({
            key: {
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId,
            },
          });
          const generation2UserUpdate = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, name: 'G2 replay-before-live update' },
          });
          const generation2UserUpdateBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(generation2AccountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: shopperFrontend.accountName,
              commands: [generation2UserUpdate],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(generation2UserUpdateBlock.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            generation2AccountRepo.drainAccountOutboxes(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2AccountBlockRepo.drainActorOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ActorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2FrontendRepo.drainFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const generation2ProductD = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G2 replay-before-live product',
              description: 'already archived when the target socket connects',
              price: 50,
            },
          });
          const generation2ProductDResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy2,
              generationId: generation2,
              serviceName: appService.name,
              commands: [generation2ProductD],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2ProductDResult.failedCommands).toEqual([]);
          const generation2ServiceRepo = yield* getServiceRepo({
            key: { generationId: generation2, serviceName: appService.name },
          });
          const generation2ServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: generation2, serviceName: appService.name },
          });
          yield* makeAsync(() =>
            generation2ServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ServiceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ServiceFrontendRepo.drainServiceFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const generation2FrontendRepoName =
            yield* FrontendRepo.repoUtils.nameUtils.makeName({
              generationId: generation2,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            });
          const generation2ServiceFrontendRepoName =
            yield* ServiceFrontendRepo.repoUtils.nameUtils.makeName({
              generationId: generation2,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            });
          const heldAccountArchiveAcknowledgement = yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_REPO.getByName(generation2FrontendRepoName),
              (_instance, state) => {
                const row = state.storage.sql
                  .exec<{ frontendIndex: number; publishedAt: number }>(
                    `SELECT frontendIndex, publishedAt
                     FROM frontendBlockOutbox
                     WHERE publishedAt IS NOT NULL
                     ORDER BY frontendIndex DESC
                     LIMIT 1`,
                  )
                  .one();
                state.storage.sql.exec(
                  'UPDATE frontendBlockOutbox SET publishedAt = NULL WHERE frontendIndex = ?',
                  row.frontendIndex,
                );
                return row;
              },
            ),
          );
          const heldServiceArchiveAcknowledgement = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_REPO.getByName(
                generation2ServiceFrontendRepoName,
              ),
              (_instance, state) => {
                const row = state.storage.sql
                  .exec<{ frontendIndex: number; publishedAt: number }>(
                    `SELECT frontendIndex, publishedAt
                     FROM serviceFrontendBlockOutbox
                     WHERE publishedAt IS NOT NULL
                     ORDER BY frontendIndex DESC
                     LIMIT 1`,
                  )
                  .one();
                state.storage.sql.exec(
                  'UPDATE serviceFrontendBlockOutbox SET publishedAt = NULL WHERE frontendIndex = ?',
                  row.frontendIndex,
                );
                return row;
              },
            ),
          );
          const accountTicketWhileArchivePending = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          const serviceTicketWhileArchivePending = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc), Effect.either);
          expect(accountTicketWhileArchivePending._tag).toBe('Left');
          if (accountTicketWhileArchivePending._tag === 'Left') {
            expect(accountTicketWhileArchivePending.left.code).toBe(
              'frontend-projection-archive-pending',
            );
          }
          expect(serviceTicketWhileArchivePending._tag).toBe('Left');
          if (serviceTicketWhileArchivePending._tag === 'Left') {
            expect(serviceTicketWhileArchivePending.left.code).toBe(
              'service-frontend-projection-archive-pending',
            );
          }
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_REPO.getByName(generation2FrontendRepoName),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE frontendBlockOutbox SET publishedAt = ? WHERE frontendIndex = ?',
                  heldAccountArchiveAcknowledgement.publishedAt,
                  heldAccountArchiveAcknowledgement.frontendIndex,
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_REPO.getByName(
                generation2ServiceFrontendRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE serviceFrontendBlockOutbox SET publishedAt = ? WHERE frontendIndex = ?',
                  heldServiceArchiveAcknowledgement.publishedAt,
                  heldServiceArchiveAcknowledgement.frontendIndex,
                );
              },
            ),
          );

          const ancestorAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const ancestorServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(ancestorAccountTicket).toMatchObject({
            generationId: generation2,
            accountId,
            actorId,
          });
          expect(ancestorServiceTicket).toMatchObject({
            generationId: generation2,
            serviceName: catalogFrontend.serviceName,
            actorId: serviceActorId,
          });
          const sourceAccountTicketCount = yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation1}`),
              (_instance, state) =>
                state.storage.sql
                  .exec<{ count: number }>(
                    'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                  )
                  .one(),
            ),
          );
          const skippedAccountTicketCount = yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${skippedGeneration}`),
              (_instance, state) =>
                state.storage.sql
                  .exec<{ count: number }>(
                    'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                  )
                  .one(),
            ),
          );
          const targetAccountTicketCount = yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation2}`),
              (_instance, state) =>
                state.storage.sql
                  .exec<{ count: number }>(
                    'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                  )
                  .one(),
            ),
          );
          const targetServiceTicketCount = yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation2}`),
              (_instance, state) =>
                state.storage.sql
                  .exec<{ count: number }>(
                    'SELECT COUNT(*) AS count FROM serviceFrontendWebSocketTickets',
                  )
                  .one(),
            ),
          );
          expect(sourceAccountTicketCount.count).toBe(0);
          expect(skippedAccountTicketCount.count).toBe(0);
          expect(targetAccountTicketCount.count).toBe(1);
          expect(targetServiceTicketCount.count).toBe(1);

          // 10 — tickets are target-bound, route-specific, and one-use. An
          // exact G1 resume emits one source suffix block, the first G2 boundary,
          // a transition receipt, no replay-complete, and then reserved close.
          const ancestorAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          ancestorAccountUrl.searchParams.set('publishableKey', 'pk_test');
          ancestorAccountUrl.searchParams.set(
            'ticket',
            ancestorAccountTicket.ticket,
          );
          const ancestorAccountWrongRouteUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          ancestorAccountWrongRouteUrl.searchParams.set(
            'publishableKey',
            'pk_test',
          );
          ancestorAccountWrongRouteUrl.searchParams.set(
            'ticket',
            ancestorAccountTicket.ticket,
          );
          const ancestorServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          ancestorServiceUrl.searchParams.set('publishableKey', 'pk_test');
          ancestorServiceUrl.searchParams.set(
            'ticket',
            ancestorServiceTicket.ticket,
          );
          const ancestorServiceWrongRouteUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          ancestorServiceWrongRouteUrl.searchParams.set(
            'publishableKey',
            'pk_test',
          );
          ancestorServiceWrongRouteUrl.searchParams.set(
            'ticket',
            ancestorServiceTicket.ticket,
          );
          const ancestorAccountWrongRouteResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorAccountWrongRouteUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const ancestorServiceWrongRouteResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorServiceWrongRouteUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(ancestorAccountWrongRouteResponse.status).toBe(401);
          expect(ancestorServiceWrongRouteResponse.status).toBe(401);
          const ancestorAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const ancestorServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(ancestorAccountResponse.status).toBe(101);
          expect(ancestorServiceResponse.status).toBe(101);
          const ancestorAccountSocket = ancestorAccountResponse.webSocket;
          const ancestorServiceSocket = ancestorServiceResponse.webSocket;
          if (
            ancestorAccountSocket === null ||
            ancestorServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both ancestor replay WebSockets'),
            );
          }
          ancestorAccountSocket.accept();
          ancestorServiceSocket.accept();
          const ancestorAccountMessages: unknown[] = [];
          const ancestorServiceMessages: unknown[] = [];
          let ancestorAccountCloseCode: number | null = null;
          let ancestorServiceCloseCode: number | null = null;
          ancestorAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              ancestorAccountMessages.push(JSON.parse(event.data));
            }
          });
          ancestorServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              ancestorServiceMessages.push(JSON.parse(event.data));
            }
          });
          ancestorAccountSocket.addEventListener('close', event => {
            ancestorAccountCloseCode = event.code;
          });
          ancestorServiceSocket.addEventListener('close', event => {
            ancestorServiceCloseCode = event.code;
          });
          ancestorAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1AccountBound.terminalFrontendIndex - 1,
            }),
          );
          ancestorServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1ServiceBound.terminalFrontendIndex - 1,
            }),
          );
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(ancestorAccountCloseCode).toBe(4002);
                expect(ancestorServiceCloseCode).toBe(4002);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
          expect(ancestorAccountMessages).toHaveLength(3);
          expect(ancestorAccountMessages[0]).toMatchObject({
            type: 'frontendBlock',
            sync: {
              kind: 'frontend',
              frontendBlock: {
                frontendIndex: generation1AccountBound.terminalFrontendIndex,
              },
            },
          });
          expect(ancestorAccountMessages[1]).toEqual({
            type: 'frontendBlock',
            sync: generation2AccountBoundary[0],
          });
          expect(ancestorAccountMessages[2]).toMatchObject({
            type: 'lineage-transition-required',
            kind: 'lineage-transition-required',
            generationId: generation2,
            appliedBoundaryIndex:
              generation1AccountBound.terminalFrontendIndex + 1,
            remainingBoundaries: [],
          });
          expect(ancestorAccountMessages).not.toContainEqual(
            expect.objectContaining({ type: 'replay-complete' }),
          );
          expect(ancestorServiceMessages).toHaveLength(3);
          expect(ancestorServiceMessages[0]).toMatchObject({
            type: 'serviceFrontendBlock',
            sync: {
              kind: 'service-frontend',
              frontendBlock: {
                frontendIndex: generation1ServiceBound.terminalFrontendIndex,
              },
            },
          });
          expect(ancestorServiceMessages[1]).toEqual({
            type: 'serviceFrontendBlock',
            sync: generation2ServiceBoundary[0],
          });
          expect(ancestorServiceMessages[2]).toMatchObject({
            type: 'lineage-transition-required',
            kind: 'lineage-transition-required',
            generationId: generation2,
            appliedBoundaryIndex:
              generation1ServiceBound.terminalFrontendIndex + 1,
            remainingBoundaries: [],
          });
          expect(ancestorServiceMessages).not.toContainEqual(
            expect.objectContaining({ type: 'replay-complete' }),
          );
          const spentAncestorAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const spentAncestorServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(ancestorServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(spentAncestorAccountResponse.status).toBe(401);
          expect(spentAncestorServiceResponse.status).toBe(401);

          // 11 — fresh tickets resolve to G2. Existing G2 blocks remain silent
          // until resume; target replay reaches a receipt, then later blocks fan
          // out live on the same socket.
          const targetAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const targetAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          targetAccountUrl.searchParams.set('publishableKey', 'pk_test');
          targetAccountUrl.searchParams.set(
            'ticket',
            targetAccountTicket.ticket,
          );
          const targetServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          targetServiceUrl.searchParams.set('publishableKey', 'pk_test');
          targetServiceUrl.searchParams.set(
            'ticket',
            targetServiceTicket.ticket,
          );
          const targetAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(targetAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const targetServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(targetServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const targetAccountSocket = targetAccountResponse.webSocket;
          const targetServiceSocket = targetServiceResponse.webSocket;
          if (targetAccountSocket === null || targetServiceSocket === null) {
            return yield* Effect.fail(
              new Error('Expected both target G2 WebSockets'),
            );
          }
          targetAccountSocket.accept();
          targetServiceSocket.accept();
          const targetAccountMessages: unknown[] = [];
          const targetServiceMessages: unknown[] = [];
          let targetAccountCloseCode: number | null = null;
          let targetServiceCloseCode: number | null = null;
          targetAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              targetAccountMessages.push(JSON.parse(event.data));
            }
          });
          targetServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              targetServiceMessages.push(JSON.parse(event.data));
            }
          });
          targetAccountSocket.addEventListener('close', event => {
            targetAccountCloseCode = event.code;
          });
          targetServiceSocket.addEventListener('close', event => {
            targetServiceCloseCode = event.code;
          });
          expect(targetAccountMessages).toEqual([]);
          expect(targetServiceMessages).toEqual([]);
          targetAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation1AccountBound.terminalFrontendIndex + 1,
            }),
          );
          targetServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation1ServiceBound.terminalFrontendIndex + 1,
            }),
          );
          const generation2AccountReadinessAfterReplayWrite = yield* makeAsync(
            () => generation2FrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceReadinessAfterReplayWrite = yield* makeAsync(
            () => generation2ServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(targetAccountMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'frontendBlock',
                      sync: expect.objectContaining({
                        kind: 'frontend',
                        frontendBlock: expect.objectContaining({
                          frontendIndex:
                            generation2AccountReadinessAfterReplayWrite.frontendIndex,
                        }),
                      }),
                    }),
                    {
                      type: 'replay-complete',
                      generationId: generation2,
                      frontendIndex:
                        generation2AccountReadinessAfterReplayWrite.frontendIndex,
                    },
                  ]),
                );
                expect(targetServiceMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'serviceFrontendBlock',
                      sync: expect.objectContaining({
                        kind: 'service-frontend',
                        frontendBlock: expect.objectContaining({
                          frontendIndex:
                            generation2ServiceReadinessAfterReplayWrite.frontendIndex,
                        }),
                      }),
                    }),
                    {
                      type: 'replay-complete',
                      generationId: generation2,
                      frontendIndex:
                        generation2ServiceReadinessAfterReplayWrite.frontendIndex,
                    },
                  ]),
                );
              },
              { timeout: 30_000, interval: 25 },
            ),
          );

          const generation2LiveUserUpdate = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, name: 'G2 live user update' },
          });
          const generation2LiveUserUpdateBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(generation2AccountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: shopperFrontend.accountName,
              commands: [generation2LiveUserUpdate],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(generation2LiveUserUpdateBlock.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            generation2AccountRepo.drainAccountOutboxes(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2AccountBlockRepo.drainActorOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ActorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2FrontendRepo.drainFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2LiveProduct = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G2 live product',
              description: 'broadcast after replay complete',
              price: 60,
            },
          });
          const generation2LiveProductResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy2,
              generationId: generation2,
              serviceName: appService.name,
              commands: [generation2LiveProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation2LiveProductResult.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            generation2ServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ServiceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ServiceFrontendRepo.drainServiceFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2AccountReadinessAfterLiveWrite = yield* makeAsync(
            () => generation2FrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation2ServiceReadinessAfterLiveWrite = yield* makeAsync(
            () => generation2ServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(targetAccountMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'frontendBlock',
                      sync: expect.objectContaining({
                        frontendBlock: expect.objectContaining({
                          frontendIndex:
                            generation2AccountReadinessAfterLiveWrite.frontendIndex,
                        }),
                      }),
                    }),
                  ]),
                );
                expect(targetServiceMessages).toEqual(
                  expect.arrayContaining([
                    expect.objectContaining({
                      type: 'serviceFrontendBlock',
                      sync: expect.objectContaining({
                        frontendBlock: expect.objectContaining({
                          frontendIndex:
                            generation2ServiceReadinessAfterLiveWrite.frontendIndex,
                        }),
                      }),
                    }),
                  ]),
                );
              },
              { timeout: 30_000, interval: 25 },
            ),
          );

          // 12 — freeze G2 after both replayed and live writes. Its inherited
          // bounds retain nearest physical G1 even though lifecycle prev points
          // through the archive-free skipped generation.
          const frozenGeneration2 = yield* drainGeneration({
            deployId: deploy2,
            generationId: generation2,
            mode: 'freeze',
            successorGenerationId: null,
          });
          expect(frozenGeneration2).toEqual({
            deployId: deploy2,
            generationId: generation2,
            admission: 'draining',
          });
          const generation2State = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: generation2,
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          if (generation2State === null) {
            return yield* Effect.fail(
              new Error('Expected frozen G2 generation state'),
            );
          }
          const generation2AccountBound = generation2State.drainBounds.find(
            bound =>
              bound.repoType === 'FrontendRepo' &&
              bound.repoName.includes(actorId),
          );
          const generation2ServiceBound = generation2State.drainBounds.find(
            bound =>
              bound.repoType === 'ServiceFrontendRepo' &&
              bound.repoName.includes(serviceActorId),
          );
          if (
            generation2AccountBound === undefined ||
            generation2ServiceBound === undefined ||
            generation2AccountBound.frontendBlockRepoName === null ||
            generation2ServiceBound.frontendBlockRepoName === null ||
            generation2AccountBound.terminalFrontendIndex === null ||
            generation2ServiceBound.terminalFrontendIndex === null
          ) {
            return yield* Effect.fail(
              new Error('Expected complete account and service G2 bounds'),
            );
          }
          expect(generation2State.prevGenerationId).toBe(skippedGeneration);
          expect(generation2AccountBound).toMatchObject({
            segmentKind: 'inherited',
            predecessorGenerationId: generation1,
            predecessorRepoName: generation1AccountBound.frontendBlockRepoName,
            predecessorTerminalFrontendIndex:
              generation1AccountBound.terminalFrontendIndex,
          });
          expect(generation2ServiceBound).toMatchObject({
            segmentKind: 'inherited',
            predecessorGenerationId: generation1,
            predecessorRepoName: generation1ServiceBound.frontendBlockRepoName,
            predecessorTerminalFrontendIndex:
              generation1ServiceBound.terminalFrontendIndex,
          });

          const generation2PersistedSystemSpec = structuredClone(systemSpec);
          const generation2PersistedAppService =
            generation2PersistedSystemSpec.serviceControllers[appService.name];
          const generation2PersistedProduct =
            generation2PersistedAppService?.models.product;
          if (generation2PersistedProduct === undefined) {
            return yield* Effect.fail(
              new Error('Expected Shopping Product in the persisted G2 spec'),
            );
          }
          generation2PersistedProduct.indexes = [
            {
              name: 'g2_product_price_for_lineage_acceptance',
              columns: ['price'],
              unique: false,
            },
          ];
          const encodedGeneration2PersistedSystemSpec =
            Schema.encodeUnknownSync(Schema.parseJson(SystemSpecSchema))(
              generation2PersistedSystemSpec,
            );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SYSTEM_REPO.getByName(`sysrepo_${generation2}`),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                  encodedGeneration2PersistedSystemSpec,
                  generation2,
                );
              },
            ),
          );
          const preparedGeneration3 = yield* prepareGeneration({
            deployId: deploy3,
            generationId: generation3,
            prevGenerationId: generation2,
            systemSpec,
            seeds: [],
          });
          expect(preparedGeneration3).toEqual({
            deployId: deploy3,
            generationId: generation3,
            readiness: 'ready',
            reusedGeneration: false,
          });
          const generation3FrontendRepo = yield* getFrontendRepo({
            key: {
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation3FrontendBlockRepo = yield* getFrontendBlockRepo({
            key: {
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            },
          });
          const generation3ServiceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId: generation3,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            },
          });
          const generation3ServiceFrontendBlockRepo =
            yield* getServiceFrontendBlockRepo({
              key: {
                generationId: generation3,
                serviceName: catalogFrontend.serviceName,
                actorName: catalogFrontend.actorName,
                actorId: serviceActorId,
                frontendName: catalogFrontend.frontendName,
              },
            });
          const generation3AccountReadiness = yield* makeAsync(() =>
            generation3FrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceReadiness = yield* makeAsync(() =>
            generation3ServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AccountReadiness.frontendIndex).toBe(
            generation2AccountBound.terminalFrontendIndex + 1,
          );
          expect(generation3ServiceReadiness.frontendIndex).toBe(
            generation2ServiceBound.terminalFrontendIndex + 1,
          );
          const generation3AccountDescriptor = yield* makeAsync(() =>
            generation3FrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceDescriptor = yield* makeAsync(() =>
            generation3ServiceFrontendBlockRepo.getPredecessor(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AccountDescriptor.predecessor).toEqual({
            generationId: generation2,
            repoName: generation2AccountBound.frontendBlockRepoName,
            terminalFrontendIndex:
              generation2AccountBound.terminalFrontendIndex,
          });
          expect(generation3ServiceDescriptor.predecessor).toEqual({
            generationId: generation2,
            repoName: generation2ServiceBound.frontendBlockRepoName,
            terminalFrontendIndex:
              generation2ServiceBound.terminalFrontendIndex,
          });
          const generation3AccountBoundary = yield* makeAsync(() =>
            generation3FrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex: generation2AccountBound.terminalFrontendIndex,
              throughFrontendIndex:
                generation2AccountBound.terminalFrontendIndex + 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceBoundary = yield* makeAsync(() =>
            generation3ServiceFrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex: generation2ServiceBound.terminalFrontendIndex,
              throughFrontendIndex:
                generation2ServiceBound.terminalFrontendIndex + 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AccountBoundary).toEqual([
            {
              kind: 'generation-boundary',
              systemId: sourceAccountStateAtRoot.systemId,
              prevGenerationId: generation2,
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              frontendIndex: generation2AccountBound.terminalFrontendIndex + 1,
            },
          ]);
          expect(generation3ServiceBoundary).toEqual([
            {
              kind: 'generation-boundary',
              systemId: sourceServiceStateAtRoot.systemId,
              prevGenerationId: generation2,
              generationId: generation3,
              serviceName: catalogFrontend.serviceName,
              actorId: serviceActorId,
              actorName: catalogFrontend.actorName,
              frontendName: catalogFrontend.frontendName,
              frontendIndex: generation2ServiceBound.terminalFrontendIndex + 1,
            },
          ]);
          yield* openGeneration({
            deployId: deploy3,
            generationId: generation3,
          });
          const completedGeneration2 = yield* drainGeneration({
            deployId: deploy2,
            generationId: generation2,
            mode: 'complete',
            successorGenerationId: generation3,
          });
          expect(completedGeneration2.admission).toBe('drained');
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(targetAccountCloseCode).toBe(4001);
                expect(targetServiceCloseCode).toBe(4001);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );

          // 13 — a ticket requested against G1 traverses G1 -> empty hop -> G2
          // -> G3 and is stored only in G3. Ancestor resume exposes the G1
          // suffix and first G2 boundary; G2 ordinary indexes stay hidden while
          // the exact G3 boundary is carried only in remainingBoundaries.
          const multigenerationAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const multigenerationServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(multigenerationAccountTicket.generationId).toBe(generation3);
          expect(multigenerationServiceTicket.generationId).toBe(generation3);
          const multigenerationAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          multigenerationAccountUrl.searchParams.set(
            'publishableKey',
            'pk_test',
          );
          multigenerationAccountUrl.searchParams.set(
            'ticket',
            multigenerationAccountTicket.ticket,
          );
          const multigenerationServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          multigenerationServiceUrl.searchParams.set(
            'publishableKey',
            'pk_test',
          );
          multigenerationServiceUrl.searchParams.set(
            'ticket',
            multigenerationServiceTicket.ticket,
          );
          const multigenerationAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(multigenerationAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const multigenerationServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(multigenerationServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const multigenerationAccountSocket =
            multigenerationAccountResponse.webSocket;
          const multigenerationServiceSocket =
            multigenerationServiceResponse.webSocket;
          if (
            multigenerationAccountSocket === null ||
            multigenerationServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both multigeneration WebSockets'),
            );
          }
          multigenerationAccountSocket.accept();
          multigenerationServiceSocket.accept();
          const multigenerationAccountMessages: unknown[] = [];
          const multigenerationServiceMessages: unknown[] = [];
          let multigenerationAccountCloseCode: number | null = null;
          let multigenerationServiceCloseCode: number | null = null;
          multigenerationAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              multigenerationAccountMessages.push(JSON.parse(event.data));
            }
          });
          multigenerationServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              multigenerationServiceMessages.push(JSON.parse(event.data));
            }
          });
          multigenerationAccountSocket.addEventListener('close', event => {
            multigenerationAccountCloseCode = event.code;
          });
          multigenerationServiceSocket.addEventListener('close', event => {
            multigenerationServiceCloseCode = event.code;
          });
          multigenerationAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1AccountBound.terminalFrontendIndex - 1,
            }),
          );
          multigenerationServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1ServiceBound.terminalFrontendIndex - 1,
            }),
          );
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(multigenerationAccountCloseCode).toBe(4002);
                expect(multigenerationServiceCloseCode).toBe(4002);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
          expect(multigenerationAccountMessages).toHaveLength(3);
          expect(multigenerationAccountMessages[0]).toMatchObject({
            type: 'frontendBlock',
            sync: {
              kind: 'frontend',
              frontendBlock: {
                frontendIndex: generation1AccountBound.terminalFrontendIndex,
              },
            },
          });
          expect(multigenerationAccountMessages[1]).toEqual({
            type: 'frontendBlock',
            sync: generation2AccountBoundary[0],
          });
          expect(multigenerationAccountMessages[2]).toMatchObject({
            type: 'lineage-transition-required',
            generationId: generation3,
            appliedBoundaryIndex:
              generation1AccountBound.terminalFrontendIndex + 1,
            remainingBoundaries: generation3AccountBoundary,
          });
          expect(multigenerationServiceMessages).toHaveLength(3);
          expect(multigenerationServiceMessages[0]).toMatchObject({
            type: 'serviceFrontendBlock',
            sync: {
              kind: 'service-frontend',
              frontendBlock: {
                frontendIndex: generation1ServiceBound.terminalFrontendIndex,
              },
            },
          });
          expect(multigenerationServiceMessages[1]).toEqual({
            type: 'serviceFrontendBlock',
            sync: generation2ServiceBoundary[0],
          });
          expect(multigenerationServiceMessages[2]).toMatchObject({
            type: 'lineage-transition-required',
            generationId: generation3,
            appliedBoundaryIndex:
              generation1ServiceBound.terminalFrontendIndex + 1,
            remainingBoundaries: generation3ServiceBoundary,
          });
          expect(multigenerationAccountMessages).not.toContainEqual(
            expect.objectContaining({ type: 'replay-complete' }),
          );
          expect(multigenerationServiceMessages).not.toContainEqual(
            expect.objectContaining({ type: 'replay-complete' }),
          );

          const generation2TicketRowsAfterPromotion = yield* Effect.promise(
            () =>
              runInDurableObject(
                env.SYSTEM_REPO.getByName(`sysrepo_${generation2}`),
                (_instance, state) => ({
                  account: state.storage.sql
                    .exec<{ count: number }>(
                      'SELECT COUNT(*) AS count FROM frontendWebSocketTickets',
                    )
                    .one().count,
                  service: state.storage.sql
                    .exec<{ count: number }>(
                      'SELECT COUNT(*) AS count FROM serviceFrontendWebSocketTickets',
                    )
                    .one().count,
                }),
              ),
          );
          expect(generation2TicketRowsAfterPromotion).toEqual({
            account: 0,
            service: 0,
          });

          // 14 — each failure below uses a fresh ticket in both families and
          // must produce the complete state-required payload before close 4003.
          // First, a target-generation replica cannot claim an index ahead of
          // the authoritative G3 archive.
          const aheadAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const aheadServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const aheadAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=${aheadAccountTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const aheadServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-service-frontend-blocks?publishableKey=pk_test&ticket=${aheadServiceTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const aheadAccountSocket = aheadAccountResponse.webSocket;
          const aheadServiceSocket = aheadServiceResponse.webSocket;
          if (aheadAccountSocket === null || aheadServiceSocket === null) {
            return yield* Effect.fail(
              new Error('Expected both ahead-index WebSockets'),
            );
          }
          aheadAccountSocket.accept();
          aheadServiceSocket.accept();
          const aheadAccountMessage = new Promise<unknown>(resolve => {
            aheadAccountSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const aheadServiceMessage = new Promise<unknown>(resolve => {
            aheadServiceSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const aheadAccountClose = new Promise<CloseEvent>(resolve => {
            aheadAccountSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          const aheadServiceClose = new Promise<CloseEvent>(resolve => {
            aheadServiceSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          aheadAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation3,
              frontendIndex: generation3AccountReadiness.frontendIndex + 1,
            }),
          );
          aheadServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation3,
              frontendIndex: generation3ServiceReadiness.frontendIndex + 1,
            }),
          );
          expect(
            yield* Effect.promise(() => aheadAccountMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
            frontendIndex: generation3AccountReadiness.frontendIndex,
          });
          expect(
            yield* Effect.promise(() => aheadServiceMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
            frontendIndex: generation3ServiceReadiness.frontendIndex,
          });
          const aheadAccountCloseEvent = yield* Effect.promise(
            () => aheadAccountClose,
          );
          const aheadServiceCloseEvent = yield* Effect.promise(
            () => aheadServiceClose,
          );
          expect(aheadAccountCloseEvent.code).toBe(4003);
          expect(aheadServiceCloseEvent.code).toBe(4003);

          // A generation that is neither G3 nor one of its exact descriptor
          // ancestors is an invalid resume target.
          const unrelatedAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const unrelatedServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const unrelatedAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=${unrelatedAccountTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const unrelatedServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-service-frontend-blocks?publishableKey=pk_test&ticket=${unrelatedServiceTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const unrelatedAccountSocket = unrelatedAccountResponse.webSocket;
          const unrelatedServiceSocket = unrelatedServiceResponse.webSocket;
          if (
            unrelatedAccountSocket === null ||
            unrelatedServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both unrelated-generation WebSockets'),
            );
          }
          unrelatedAccountSocket.accept();
          unrelatedServiceSocket.accept();
          const unrelatedAccountMessage = new Promise<unknown>(resolve => {
            unrelatedAccountSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const unrelatedServiceMessage = new Promise<unknown>(resolve => {
            unrelatedServiceSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const unrelatedAccountClose = new Promise<CloseEvent>(resolve => {
            unrelatedAccountSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          const unrelatedServiceClose = new Promise<CloseEvent>(resolve => {
            unrelatedServiceSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          unrelatedAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: 'gen_shopping_lineage_unrelated',
              frontendIndex: 0,
            }),
          );
          unrelatedServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: 'gen_shopping_lineage_unrelated',
              frontendIndex: 0,
            }),
          );
          expect(
            yield* Effect.promise(() => unrelatedAccountMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          expect(
            yield* Effect.promise(() => unrelatedServiceMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          const unrelatedAccountCloseEvent = yield* Effect.promise(
            () => unrelatedAccountClose,
          );
          const unrelatedServiceCloseEvent = yield* Effect.promise(
            () => unrelatedServiceClose,
          );
          expect(unrelatedAccountCloseEvent.code).toBe(4003);
          expect(unrelatedServiceCloseEvent.code).toBe(4003);

          // Remove each frozen G2 terminal row after ticket admission. G3's
          // immutable predecessor pointer can no longer prove that exact source
          // archive, so neither family may attempt a partial replay.
          const missingAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const missingServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const removedAccountTerminalBlock = yield* makeAsync(() =>
            generation2FrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex:
                generation2AccountBound.terminalFrontendIndex - 1,
              throughFrontendIndex:
                generation2AccountBound.terminalFrontendIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const removedServiceTerminalBlock = yield* makeAsync(() =>
            generation2ServiceFrontendBlockRepo.getArchivedBlocks({
              afterFrontendIndex:
                generation2ServiceBound.terminalFrontendIndex - 1,
              throughFrontendIndex:
                generation2ServiceBound.terminalFrontendIndex,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(removedAccountTerminalBlock).toHaveLength(1);
          expect(removedServiceTerminalBlock).toHaveLength(1);
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation2AccountBound.frontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  'DELETE FROM frontendBlocks WHERE frontendIndex = ?',
                  generation2AccountBound.terminalFrontendIndex,
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation2ServiceBound.frontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  'DELETE FROM serviceFrontendBlocks WHERE frontendIndex = ?',
                  generation2ServiceBound.terminalFrontendIndex,
                );
              },
            ),
          );
          const missingAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=${missingAccountTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const missingServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-service-frontend-blocks?publishableKey=pk_test&ticket=${missingServiceTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const missingAccountSocket = missingAccountResponse.webSocket;
          const missingServiceSocket = missingServiceResponse.webSocket;
          if (missingAccountSocket === null || missingServiceSocket === null) {
            return yield* Effect.fail(
              new Error('Expected both missing-archive WebSockets'),
            );
          }
          missingAccountSocket.accept();
          missingServiceSocket.accept();
          const missingAccountMessage = new Promise<unknown>(resolve => {
            missingAccountSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const missingServiceMessage = new Promise<unknown>(resolve => {
            missingServiceSocket.addEventListener(
              'message',
              event => {
                resolve(
                  typeof event.data === 'string'
                    ? JSON.parse(event.data)
                    : event.data,
                );
              },
              { once: true },
            );
          });
          const missingAccountClose = new Promise<CloseEvent>(resolve => {
            missingAccountSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          const missingServiceClose = new Promise<CloseEvent>(resolve => {
            missingServiceSocket.addEventListener('close', resolve, {
              once: true,
            });
          });
          missingAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation2AccountBound.terminalFrontendIndex - 1,
            }),
          );
          missingServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation2ServiceBound.terminalFrontendIndex - 1,
            }),
          );
          expect(
            yield* Effect.promise(() => missingAccountMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          expect(
            yield* Effect.promise(() => missingServiceMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          const missingAccountCloseEvent = yield* Effect.promise(
            () => missingAccountClose,
          );
          const missingServiceCloseEvent = yield* Effect.promise(
            () => missingServiceClose,
          );
          expect(missingAccountCloseEvent.code).toBe(4003);
          expect(missingServiceCloseEvent.code).toBe(4003);
          yield* makeAsync(() =>
            generation2FrontendBlockRepo.storeFrontendBlocks({
              blocks: removedAccountTerminalBlock,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation2ServiceFrontendBlockRepo.storeServiceFrontendBlocks({
              blocks: removedServiceTerminalBlock,
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          // Corrupt only the G3 predecessor repo pointer after a ticket is
          // admitted. The WebSocket must reject invalid ancestry instead of
          // following an unverified durable-object name.
          const invalidAncestryAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const invalidAncestryServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3FrontendBlockRepoName =
            yield* FrontendBlockRepo.repoUtils.nameUtils.makeName({
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            });
          const generation3ServiceFrontendBlockRepoName =
            yield* ServiceFrontendBlockRepo.repoUtils.nameUtils.makeName({
              generationId: generation3,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            });
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation3FrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  "UPDATE lineage SET predecessorRepoName = 'not-an-account-repo' WHERE id = 'lineage'",
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation3ServiceFrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  "UPDATE lineage SET predecessorRepoName = 'not-a-service-repo' WHERE id = 'lineage'",
                );
              },
            ),
          );
          const invalidAncestryAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=${invalidAncestryAccountTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const invalidAncestryServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-service-frontend-blocks?publishableKey=pk_test&ticket=${invalidAncestryServiceTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const invalidAncestryAccountSocket =
            invalidAncestryAccountResponse.webSocket;
          const invalidAncestryServiceSocket =
            invalidAncestryServiceResponse.webSocket;
          if (
            invalidAncestryAccountSocket === null ||
            invalidAncestryServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both invalid-ancestry WebSockets'),
            );
          }
          invalidAncestryAccountSocket.accept();
          invalidAncestryServiceSocket.accept();
          const invalidAncestryAccountMessage = new Promise<unknown>(
            resolve => {
              invalidAncestryAccountSocket.addEventListener(
                'message',
                event => {
                  resolve(
                    typeof event.data === 'string'
                      ? JSON.parse(event.data)
                      : event.data,
                  );
                },
                { once: true },
              );
            },
          );
          const invalidAncestryServiceMessage = new Promise<unknown>(
            resolve => {
              invalidAncestryServiceSocket.addEventListener(
                'message',
                event => {
                  resolve(
                    typeof event.data === 'string'
                      ? JSON.parse(event.data)
                      : event.data,
                  );
                },
                { once: true },
              );
            },
          );
          const invalidAncestryAccountClose = new Promise<CloseEvent>(
            resolve => {
              invalidAncestryAccountSocket.addEventListener('close', resolve, {
                once: true,
              });
            },
          );
          const invalidAncestryServiceClose = new Promise<CloseEvent>(
            resolve => {
              invalidAncestryServiceSocket.addEventListener('close', resolve, {
                once: true,
              });
            },
          );
          invalidAncestryAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1AccountBound.terminalFrontendIndex,
            }),
          );
          invalidAncestryServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation1,
              frontendIndex: generation1ServiceBound.terminalFrontendIndex,
            }),
          );
          expect(
            yield* Effect.promise(() => invalidAncestryAccountMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          expect(
            yield* Effect.promise(() => invalidAncestryServiceMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          const invalidAncestryAccountCloseEvent = yield* Effect.promise(
            () => invalidAncestryAccountClose,
          );
          const invalidAncestryServiceCloseEvent = yield* Effect.promise(
            () => invalidAncestryServiceClose,
          );
          expect(invalidAncestryAccountCloseEvent.code).toBe(4003);
          expect(invalidAncestryServiceCloseEvent.code).toBe(4003);
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation3FrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE lineage SET predecessorRepoName = ? WHERE id = ?',
                  generation2AccountBound.frontendBlockRepoName,
                  'lineage',
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation3ServiceFrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE lineage SET predecessorRepoName = ? WHERE id = ?',
                  generation2ServiceBound.frontendBlockRepoName,
                  'lineage',
                );
              },
            ),
          );

          // A well-formed but conflicting canonical boundary is still
          // corruption. Mint admission before changing either archive so the
          // failure is exercised by replay, then change only canonicalBytes;
          // lineageBlock retains the immutable bytes originally stored for
          // this same index.
          const conflictingArchiveAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const conflictingArchiveServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const accountBoundaryArchiveBytes = yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation3FrontendBlockRepoName,
              ),
              (_instance, state) =>
                state.storage.sql
                  .exec<{
                    canonicalBytes: string;
                    lineageBlock: string;
                  }>(
                    `SELECT canonicalBytes, lineageBlock
                     FROM frontendBlocks
                     WHERE frontendIndex = ?`,
                    generation2AccountBound.terminalFrontendIndex + 1,
                  )
                  .one(),
            ),
          );
          const serviceBoundaryArchiveBytes = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation3ServiceFrontendBlockRepoName,
              ),
              (_instance, state) =>
                state.storage.sql
                  .exec<{
                    canonicalBytes: string;
                    lineageBlock: string;
                  }>(
                    `SELECT canonicalBytes, lineageBlock
                     FROM serviceFrontendBlocks
                     WHERE frontendIndex = ?`,
                    generation2ServiceBound.terminalFrontendIndex + 1,
                  )
                  .one(),
            ),
          );
          expect(accountBoundaryArchiveBytes.canonicalBytes).toBe(
            accountBoundaryArchiveBytes.lineageBlock,
          );
          expect(serviceBoundaryArchiveBytes.canonicalBytes).toBe(
            serviceBoundaryArchiveBytes.lineageBlock,
          );
          const conflictingAccountBoundaryCanonicalBytes =
            accountBoundaryArchiveBytes.canonicalBytes.replace(
              generation3,
              'gen_shopping_lineage_acceptance_conflicting_account_boundary',
            );
          const conflictingServiceBoundaryCanonicalBytes =
            serviceBoundaryArchiveBytes.canonicalBytes.replace(
              generation3,
              'gen_shopping_lineage_acceptance_conflicting_service_boundary',
            );
          expect(conflictingAccountBoundaryCanonicalBytes).not.toBe(
            accountBoundaryArchiveBytes.canonicalBytes,
          );
          expect(conflictingServiceBoundaryCanonicalBytes).not.toBe(
            serviceBoundaryArchiveBytes.canonicalBytes,
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation3FrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  `UPDATE frontendBlocks
                   SET canonicalBytes = ?
                   WHERE frontendIndex = ?`,
                  conflictingAccountBoundaryCanonicalBytes,
                  generation2AccountBound.terminalFrontendIndex + 1,
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation3ServiceFrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  `UPDATE serviceFrontendBlocks
                   SET canonicalBytes = ?
                   WHERE frontendIndex = ?`,
                  conflictingServiceBoundaryCanonicalBytes,
                  generation2ServiceBound.terminalFrontendIndex + 1,
                );
              },
            ),
          );
          const conflictingArchiveAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-frontend-blocks?publishableKey=pk_test&ticket=${conflictingArchiveAccountTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const conflictingArchiveServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(
              `http://zerospin-test-rpc.invalid/ws-service-frontend-blocks?publishableKey=pk_test&ticket=${conflictingArchiveServiceTicket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          );
          const conflictingArchiveAccountSocket =
            conflictingArchiveAccountResponse.webSocket;
          const conflictingArchiveServiceSocket =
            conflictingArchiveServiceResponse.webSocket;
          if (
            conflictingArchiveAccountSocket === null ||
            conflictingArchiveServiceSocket === null
          ) {
            return yield* Effect.fail(
              new Error('Expected both conflicting-archive WebSockets'),
            );
          }
          conflictingArchiveAccountSocket.accept();
          conflictingArchiveServiceSocket.accept();
          const conflictingArchiveAccountMessage = new Promise<unknown>(
            resolve => {
              conflictingArchiveAccountSocket.addEventListener(
                'message',
                event => {
                  resolve(
                    typeof event.data === 'string'
                      ? JSON.parse(event.data)
                      : event.data,
                  );
                },
                { once: true },
              );
            },
          );
          const conflictingArchiveServiceMessage = new Promise<unknown>(
            resolve => {
              conflictingArchiveServiceSocket.addEventListener(
                'message',
                event => {
                  resolve(
                    typeof event.data === 'string'
                      ? JSON.parse(event.data)
                      : event.data,
                  );
                },
                { once: true },
              );
            },
          );
          const conflictingArchiveAccountClose = new Promise<CloseEvent>(
            resolve => {
              conflictingArchiveAccountSocket.addEventListener(
                'close',
                resolve,
                { once: true },
              );
            },
          );
          const conflictingArchiveServiceClose = new Promise<CloseEvent>(
            resolve => {
              conflictingArchiveServiceSocket.addEventListener(
                'close',
                resolve,
                { once: true },
              );
            },
          );
          conflictingArchiveAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation2AccountBound.terminalFrontendIndex,
            }),
          );
          conflictingArchiveServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation2,
              frontendIndex: generation2ServiceBound.terminalFrontendIndex,
            }),
          );
          expect(
            yield* Effect.promise(() => conflictingArchiveAccountMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          expect(
            yield* Effect.promise(() => conflictingArchiveServiceMessage),
          ).toMatchObject({
            type: 'state-required',
            generationId: generation3,
          });
          const conflictingArchiveAccountCloseEvent = yield* Effect.promise(
            () => conflictingArchiveAccountClose,
          );
          const conflictingArchiveServiceCloseEvent = yield* Effect.promise(
            () => conflictingArchiveServiceClose,
          );
          expect(conflictingArchiveAccountCloseEvent.code).toBe(4003);
          expect(conflictingArchiveServiceCloseEvent.code).toBe(4003);
          yield* Effect.promise(() =>
            runInDurableObject(
              env.FRONTEND_BLOCK_REPO.getByName(
                generation3FrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  `UPDATE frontendBlocks
                   SET canonicalBytes = ?
                   WHERE frontendIndex = ?`,
                  accountBoundaryArchiveBytes.canonicalBytes,
                  generation2AccountBound.terminalFrontendIndex + 1,
                );
              },
            ),
          );
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                generation3ServiceFrontendBlockRepoName,
              ),
              (_instance, state) => {
                state.storage.sql.exec(
                  `UPDATE serviceFrontendBlocks
                   SET canonicalBytes = ?
                   WHERE frontendIndex = ?`,
                  serviceBoundaryArchiveBytes.canonicalBytes,
                  generation2ServiceBound.terminalFrontendIndex + 1,
                );
              },
            ),
          );

          // 15 — authenticate the real G3 account target, obtain fresh
          // single-use tickets through the old public route, resume at the G3
          // watermarks, and require replay-complete before either later live
          // block is observable.
          const generation3AuthenticatedActor = yield* makeAsync(() =>
            systemWorker.authenticate({
              deployId: deploy3,
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              signature: { clerkUserId },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AuthenticatedActor).toEqual({
            accountId,
            actorId,
          });
          yield* makeAsync(() =>
            systemWorker.authorize({
              deployId: deploy3,
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              actor: generation3AuthenticatedActor,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3AccountStateBeforeSocket = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy3,
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceStateBeforeSocket = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy3,
              generationId: generation3,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AccountStateBeforeSocket).toMatchObject({
            generationId: generation3,
            frontendIndex: generation2AccountBound.terminalFrontendIndex + 1,
            pushedCommands: [],
            executedPushedCommands:
              settledSourceAccountState.executedPushedCommands,
            failedPushedCommands:
              settledSourceAccountState.failedPushedCommands,
          });
          expect(generation3ServiceStateBeforeSocket).toMatchObject({
            generationId: generation3,
            frontendIndex: generation2ServiceBound.terminalFrontendIndex + 1,
          });
          const finalAccountTicket = yield* makeAsync(() =>
            systemWorker.createFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const finalServiceTicket = yield* makeAsync(() =>
            systemWorker.createServiceFrontendWebSocketTicket({
              deployId: deploy1,
              generationId: generation1,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(finalAccountTicket.generationId).toBe(generation3);
          expect(finalServiceTicket.generationId).toBe(generation3);
          const finalAccountUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-frontend-blocks',
          );
          finalAccountUrl.searchParams.set('publishableKey', 'pk_test');
          finalAccountUrl.searchParams.set('ticket', finalAccountTicket.ticket);
          const finalServiceUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          finalServiceUrl.searchParams.set('publishableKey', 'pk_test');
          finalServiceUrl.searchParams.set('ticket', finalServiceTicket.ticket);
          const finalAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(finalAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const finalServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(finalServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(finalAccountResponse.status).toBe(101);
          expect(finalServiceResponse.status).toBe(101);
          const finalAccountSocket = finalAccountResponse.webSocket;
          const finalServiceSocket = finalServiceResponse.webSocket;
          if (finalAccountSocket === null || finalServiceSocket === null) {
            return yield* Effect.fail(
              new Error('Expected both final G3 WebSockets'),
            );
          }
          finalAccountSocket.accept();
          finalServiceSocket.accept();
          const finalAccountMessages: unknown[] = [];
          const finalServiceMessages: unknown[] = [];
          let finalAccountCloseCode: number | null = null;
          let finalServiceCloseCode: number | null = null;
          finalAccountSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              finalAccountMessages.push(JSON.parse(event.data));
            }
          });
          finalServiceSocket.addEventListener('message', event => {
            if (typeof event.data === 'string') {
              finalServiceMessages.push(JSON.parse(event.data));
            }
          });
          finalAccountSocket.addEventListener('close', event => {
            finalAccountCloseCode = event.code;
          });
          finalServiceSocket.addEventListener('close', event => {
            finalServiceCloseCode = event.code;
          });
          const spentFinalAccountResponse = yield* Effect.promise(() =>
            SELF.fetch(finalAccountUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          const spentFinalServiceResponse = yield* Effect.promise(() =>
            SELF.fetch(finalServiceUrl, {
              headers: { Upgrade: 'websocket' },
            }),
          );
          expect(spentFinalAccountResponse.status).toBe(401);
          expect(spentFinalServiceResponse.status).toBe(401);
          finalAccountSocket.send(
            JSON.stringify({
              replicaGenerationId: generation3,
              frontendIndex: generation3AccountStateBeforeSocket.frontendIndex,
            }),
          );
          finalServiceSocket.send(
            JSON.stringify({
              replicaGenerationId: generation3,
              frontendIndex: generation3ServiceStateBeforeSocket.frontendIndex,
            }),
          );
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(finalAccountMessages).toEqual([
                  {
                    type: 'replay-complete',
                    generationId: generation3,
                    frontendIndex:
                      generation3AccountStateBeforeSocket.frontendIndex,
                  },
                ]);
                expect(finalServiceMessages).toEqual([
                  {
                    type: 'replay-complete',
                    generationId: generation3,
                    frontendIndex:
                      generation3ServiceStateBeforeSocket.frontendIndex,
                  },
                ]);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
          expect(finalAccountCloseCode).toBeNull();
          expect(finalServiceCloseCode).toBeNull();

          const generation3AccountRepo = yield* getAccountRepo({
            key: {
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const generation3AccountBlockRepo = yield* getAccountBlockRepo({
            key: {
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
            },
          });
          const generation3ActorBlockRepo = yield* getActorBlockRepo({
            key: {
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorName: shopperFrontend.actorName,
              actorId,
            },
          });
          const generation3LiveUserUpdate = yield* userAccount.makeCommand({
            contractName: 'updateUser',
            accountId,
            systemName: shopperFrontend.systemName,
            systemVersion: system.version,
            payload: { id: userId, name: 'G3 live user update' },
          });
          const generation3LiveUserUpdateBlock = yield* makeTraceableRpcTarget<
            Pick<AccountRepo, 'finalizeAccountBlock'>
          >(generation3AccountRepo)
            .finalizeAccountBlock({
              accountId,
              accountName: shopperFrontend.accountName,
              commands: [generation3LiveUserUpdate],
            })
            .pipe(
              Effect.provideService(
                TelemetryCollector,
                makeTelemetryCollector(),
              ),
              Effect.catchAll(error => Effect.die(error)),
            );
          expect(generation3LiveUserUpdateBlock.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            generation3AccountRepo.drainAccountOutboxes(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation3AccountBlockRepo.drainActorOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation3ActorBlockRepo.drainFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation3FrontendRepo.drainFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const generation3LiveProduct = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'G3 live product',
              description: 'broadcast after final replay complete',
              price: 70,
            },
          });
          const generation3LiveProductResult = yield* makeAsync(() =>
            systemWorker.finalizeServiceCommands({
              deployId: deploy3,
              generationId: generation3,
              serviceName: appService.name,
              commands: [generation3LiveProduct],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3LiveProductResult.failedCommands).toEqual([]);
          const generation3ServiceRepo = yield* getServiceRepo({
            key: { generationId: generation3, serviceName: appService.name },
          });
          const generation3ServiceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: generation3, serviceName: appService.name },
          });
          yield* makeAsync(() =>
            generation3ServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation3ServiceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* makeAsync(() =>
            generation3ServiceFrontendRepo.drainServiceFrontendBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const generation3AccountReadinessAfterLiveWrite = yield* makeAsync(
            () => generation3FrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceReadinessAfterLiveWrite = yield* makeAsync(
            () => generation3ServiceFrontendRepo.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(finalAccountMessages).toEqual([
                  {
                    type: 'replay-complete',
                    generationId: generation3,
                    frontendIndex:
                      generation3AccountStateBeforeSocket.frontendIndex,
                  },
                  expect.objectContaining({
                    type: 'frontendBlock',
                    sync: expect.objectContaining({
                      kind: 'frontend',
                      frontendBlock: expect.objectContaining({
                        frontendIndex:
                          generation3AccountReadinessAfterLiveWrite.frontendIndex,
                      }),
                    }),
                  }),
                ]);
                expect(finalServiceMessages).toEqual([
                  {
                    type: 'replay-complete',
                    generationId: generation3,
                    frontendIndex:
                      generation3ServiceStateBeforeSocket.frontendIndex,
                  },
                  expect.objectContaining({
                    type: 'serviceFrontendBlock',
                    sync: expect.objectContaining({
                      kind: 'service-frontend',
                      frontendBlock: expect.objectContaining({
                        frontendIndex:
                          generation3ServiceReadinessAfterLiveWrite.frontendIndex,
                      }),
                    }),
                  }),
                ]);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
          const generation3AccountStateAfterLiveWrite = yield* makeAsync(() =>
            systemWorker.getFrontendState({
              deployId: deploy3,
              generationId: generation3,
              accountId,
              accountName: shopperFrontend.accountName,
              actorId,
              actorName: shopperFrontend.actorName,
              frontendName: shopperFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const generation3ServiceStateAfterLiveWrite = yield* makeAsync(() =>
            systemWorker.getServiceFrontendState({
              deployId: deploy3,
              generationId: generation3,
              serviceName: catalogFrontend.serviceName,
              actorName: catalogFrontend.actorName,
              actorId: serviceActorId,
              frontendName: catalogFrontend.frontendName,
              systemWorkerName: 'sys_shopping:local',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(generation3AccountStateAfterLiveWrite).toMatchObject({
            frontendIndex:
              generation3AccountReadinessAfterLiveWrite.frontendIndex,
            pushedCommands: [],
            executedPushedCommands:
              settledSourceAccountState.executedPushedCommands,
            failedPushedCommands:
              settledSourceAccountState.failedPushedCommands,
          });
          expect(generation3AccountStateAfterLiveWrite.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: userId,
                name: 'G3 live user update',
              }),
            ]),
          );
          expect(generation3ServiceStateAfterLiveWrite).toMatchObject({
            frontendIndex:
              generation3ServiceReadinessAfterLiveWrite.frontendIndex,
          });
          expect(generation3ServiceStateAfterLiveWrite.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: generation3LiveProduct.payload.id,
              }),
            ]),
          );
          finalAccountSocket.close(1000, 'test-complete');
          finalServiceSocket.close(1000, 'test-complete');
          yield* Effect.promise(() =>
            vi.waitFor(
              () => {
                expect(finalAccountCloseCode).toBe(1000);
                expect(finalServiceCloseCode).toBe(1000);
              },
              { timeout: 30_000, interval: 25 },
            ),
          );
        }).pipe(Effect.provide(WorkerExportsSystemWorkerResolver)),
      300_000,
    );
  });
});
