import { describe, it } from '@effect/vitest';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { prefixActorId } from '@zerospin/core/utils/prefixActorId';
import { makeTestApis } from '@zerospin/dispatch-worker/makeTestApis';
import { makeWorkerdE2eTestLayer } from '@zerospin/dispatch-worker/vitest/makeWorkerdE2eTestLayer';
import {
  env,
  runDurableObjectAlarm,
  runInDurableObject,
  SELF,
} from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { ServiceBlockSchema } from 'system-worker/blockSchemas';
import { getServiceBlockRepo } from 'system-worker/ServiceBlockRepo/getServiceBlockRepo/getServiceBlockRepo';
import { getServiceFrontendBlockRepo } from 'system-worker/ServiceFrontendBlockRepo/getServiceFrontendBlockRepo/getServiceFrontendBlockRepo';
import { getServiceFrontendRepo } from 'system-worker/ServiceFrontendRepo/getServiceFrontendRepo/getServiceFrontendRepo';
import { getServiceRepo } from 'system-worker/ServiceRepo/getServiceRepo/getServiceRepo';
import { SystemRepo } from 'system-worker/SystemRepo/SystemRepo';
import type { IServiceBlock } from 'system-worker/types';
import { expect, vi } from 'vitest';

import { appService, system } from '@/zerospin/system';

const TestLayer = makeWorkerdE2eTestLayer('serviceFrontendFlow1');

describe('serviceFrontendFlow1: service-owned actor projection', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'authenticates two actors without account state and projects only declared service models',
      () =>
        /*
         * 1. Reject an invalid service signature without creating projection repos.
         * 2. Finalize one projected Product in the singleton ServiceRepo.
         * 3. Admit two service actors, reject a ticket before state, then bootstrap distinct projection pairs.
         * 4. Open one service-only WebSocket with a one-time bound ticket.
         * 5. Finalize an unprojected CatalogMarker and prove no frontend block.
         * 6. Finalize another Product and prove index-one live convergence.
         * 7. Prove the service path created no account or account-actor repos.
         */
        Effect.gen(function* () {
          const apis = makeTestApis();
          const systemRepo = SystemRepo.getRepo({ generationId: 'gen_test' });

          // 1 — signature decoding fails before either actor-specific repo exists.
          const invalidAdmission = yield* makeAsync(() =>
            apis.getServiceFrontendApi({
              publishableKey: 'pk_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              frontendName: 'catalog',
              signature: { viewerId: 42 },
            }),
          );
          expect(invalidAdmission._tag).toBe('Failure');

          const projectionRegistrationsAfterFailure = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const archiveRegistrationsAfterFailure = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(projectionRegistrationsAfterFailure).toEqual([]);
          expect(archiveRegistrationsAfterFailure).toEqual([]);

          // 2 — the source row exists before either actor projection bootstraps.
          const firstProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Service frontend product A',
              description: 'projected before bootstrap',
              price: 10,
            },
          });
          const systemApi = yield* makeAsync(() =>
            apis.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );
          const firstFinalizationEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [firstProductCommand],
                },
              ],
            }),
          );
          const firstFinalization = yield* decodeRpc(
            firstFinalizationEnvelope.result,
          );
          expect(firstFinalization.failed).toEqual([]);
          expect(firstFinalization.executed).toHaveLength(1);

          // 3 — each signature receives its own actor-bound projection pair.
          const viewerA = 'catalog_viewer_a';
          const viewerB = 'catalog_viewer_b';
          const actorIdA = prefixActorId(viewerA);
          const actorIdB = prefixActorId(viewerB);
          const admissionA = yield* makeAsync(() =>
            apis.getServiceFrontendApi({
              publishableKey: 'pk_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              frontendName: 'catalog',
              signature: { viewerId: viewerA },
            }),
          );
          const admissionB = yield* makeAsync(() =>
            apis.getServiceFrontendApi({
              publishableKey: 'pk_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              frontendName: 'catalog',
              signature: { viewerId: viewerB },
            }),
          );

          // Each successful admission passed through the real actor callback,
          // which rejects $client, insert, update, delete, and transaction keys.
          // Success therefore proves the workerd runtime supplied only query.
          expect(admissionA._tag).toBe('Success');
          expect(admissionB._tag).toBe('Success');
          if (admissionA._tag !== 'Success' || admissionB._tag !== 'Success') {
            return yield* Effect.fail(
              new Error('Expected both service frontend admissions to succeed'),
            );
          }

          expect(admissionA.identity).toMatchObject({
            actorId: actorIdA,
            actorName: 'catalogViewer',
            frontendName: 'catalog',
            frontendVersion: '1.0.0',
            generationId: 'gen_test',
            serviceName: 'app',
            systemId: 'sys_shopping',
            systemVersion: system.version,
            systemWorkerName: 'sys_shopping:local',
          });
          expect(admissionA.frontendSpec).toMatchObject({
            actorName: 'catalogViewer',
            frontendName: 'catalog',
            serviceName: 'app',
            version: '1.0.0',
          });
          expect(Object.keys(admissionA.frontendSpec.models)).toEqual([
            'product',
          ]);

          // Admission binds the actor identity but does not initialize either
          // actor-specific repository. Ticket discovery must therefore fail
          // before looking up or registering a partial projection/archive pair.
          const ticketBeforeStateEnvelope = yield* makeAsync(() =>
            admissionA.frontendApi.createFrontendWebSocketTicket({
              traceContext: null,
              args: [],
            }),
          );
          const ticketBeforeState = yield* decodeRpc(
            ticketBeforeStateEnvelope.result,
          ).pipe(Effect.either);
          expect(ticketBeforeState._tag).toBe('Left');
          if (ticketBeforeState._tag === 'Left') {
            expect(ticketBeforeState.left.code).toBe(
              'service-frontend-state-required',
            );
          }

          const projectionRegistrationsBeforeState = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const archiveRegistrationsBeforeState = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(projectionRegistrationsBeforeState).toEqual([]);
          expect(archiveRegistrationsBeforeState).toEqual([]);

          // The failed ticket did not poison initialization. Both actors now
          // bootstrap normally and later ticket creation remains available.
          const stateAEnvelope = yield* makeAsync(() =>
            admissionA.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const stateBEnvelope = yield* makeAsync(() =>
            admissionB.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const initialStateA = yield* decodeRpc(stateAEnvelope.result);
          const initialStateB = yield* decodeRpc(stateBEnvelope.result);
          expect(initialStateA).toMatchObject({
            actorId: actorIdA,
            actorName: 'catalogViewer',
            frontendIndex: 0,
            frontendName: 'catalog',
            generationId: 'gen_test',
            serviceName: 'app',
            systemId: 'sys_shopping',
            systemVersion: system.version,
          });
          expect(initialStateB).toMatchObject({
            actorId: actorIdB,
            frontendIndex: 0,
          });
          expect(initialStateA.resources).toEqual([
            expect.objectContaining({
              id: firstProductCommand.payload.id,
              modelName: 'product',
              name: 'Service frontend product A',
            }),
          ]);
          expect(initialStateB.resources).toEqual(initialStateA.resources);

          const projectionRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const archiveRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'ServiceFrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(projectionRegistrations).toHaveLength(2);
          expect(archiveRegistrations).toHaveLength(2);
          expect(projectionRegistrations[0]?.repoName).not.toBe(
            projectionRegistrations[1]?.repoName,
          );
          expect(archiveRegistrations[0]?.repoName).not.toBe(
            archiveRegistrations[1]?.repoName,
          );
          expect(
            projectionRegistrations.some(registration =>
              registration.repoName.includes(actorIdA),
            ),
          ).toBe(true);
          expect(
            projectionRegistrations.some(registration =>
              registration.repoName.includes(actorIdB),
            ),
          ).toBe(true);

          // 4 — the ticket is generation-prefixed, actor-bound, and single-use.
          const ticketEnvelope = yield* makeAsync(() =>
            admissionA.frontendApi.createFrontendWebSocketTicket({
              traceContext: null,
              args: [],
            }),
          );
          const ticket = yield* decodeRpc(ticketEnvelope.result);
          expect(ticket).toMatchObject({
            actorId: actorIdA,
            actorName: 'catalogViewer',
            frontendName: 'catalog',
            frontendVersion: '1.0.0',
            generationId: 'gen_test',
            serviceName: 'app',
            systemId: 'sys_shopping',
          });
          expect(ticket.ticket).toMatch(/^gen_test\.[A-Za-z0-9_-]{43}$/);

          const websocketUrl = new URL(
            'http://zerospin-test-rpc.invalid/ws-service-frontend-blocks',
          );
          websocketUrl.searchParams.set('publishableKey', 'pk_test');
          websocketUrl.searchParams.set('ticket', ticket.ticket);
          const websocketResponse = yield* Effect.promise(() =>
            SELF.fetch(websocketUrl, { headers: { Upgrade: 'websocket' } }),
          );
          expect(websocketResponse.status).toBe(101);
          const websocket = websocketResponse.webSocket;
          if (websocket === null) {
            return yield* Effect.fail(
              new Error('Service frontend route did not return a WebSocket'),
            );
          }
          websocket.accept();

          const replayCompletePromise = new Promise<unknown>(
            (resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error('service replay-complete timeout')),
                10_000,
              );
              websocket.addEventListener(
                'message',
                event => {
                  clearTimeout(timeout);
                  if (typeof event.data !== 'string') {
                    reject(new Error('Expected a text replay message'));
                    return;
                  }
                  resolve(JSON.parse(event.data));
                },
                { once: true },
              );
            },
          );
          websocket.send(
            JSON.stringify({
              replicaGenerationId: 'gen_test',
              frontendIndex: 0,
            }),
          );
          expect(yield* Effect.promise(() => replayCompletePromise)).toEqual({
            type: 'replay-complete',
            generationId: 'gen_test',
            frontendIndex: 0,
          });

          const spentTicketResponse = yield* Effect.promise(() =>
            SELF.fetch(websocketUrl, { headers: { Upgrade: 'websocket' } }),
          );
          expect(spentTicketResponse.status).toBe(401);

          const liveBlockPromise = new Promise<unknown>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('service live block timeout')),
              10_000,
            );
            websocket.addEventListener(
              'message',
              event => {
                clearTimeout(timeout);
                if (typeof event.data !== 'string') {
                  reject(new Error('Expected a text live message'));
                  return;
                }
                resolve(JSON.parse(event.data));
              },
              { once: true },
            );
          });

          const serviceRepo = yield* getServiceRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });

          // 5 — an unprojected source row advances provenance but emits nothing.
          const markerCommand = yield* appService.makeCommand({
            contractName: 'createCatalogMarker',
            systemVersion: system.version,
            payload: { label: 'not projected' },
          });
          const markerFinalizationEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [markerCommand],
                },
              ],
            }),
          );
          const markerFinalization = yield* decodeRpc(
            markerFinalizationEnvelope.result,
          );
          expect(markerFinalization.failed).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));

          const stateAfterMarkerEnvelope = yield* makeAsync(() =>
            admissionA.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const stateAfterMarker = yield* decodeRpc(
            stateAfterMarkerEnvelope.result,
          );
          expect(stateAfterMarker.frontendIndex).toBe(0);
          expect(stateAfterMarker.resources).toEqual(initialStateA.resources);

          // 6 — the next projected source block becomes frontend index one.
          const secondProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Service frontend product B',
              description: 'projected after bootstrap',
              price: 20,
            },
          });
          const secondFinalizationEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [secondProductCommand],
                },
              ],
            }),
          );
          const secondFinalization = yield* decodeRpc(
            secondFinalizationEnvelope.result,
          );
          expect(secondFinalization.failed).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );
          yield* makeAsync(() =>
            serviceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));

          expect(yield* Effect.promise(() => liveBlockPromise)).toEqual({
            type: 'serviceFrontendBlock',
            sync: expect.objectContaining({
              actorId: actorIdA,
              frontendName: 'catalog',
              generationId: 'gen_test',
              kind: 'service-frontend',
              serviceName: 'app',
              frontendBlock: expect.objectContaining({
                frontendIndex: 1,
                lastServiceCursor:
                  secondFinalization.executed[0]?.serviceCursor,
                delta: expect.objectContaining({
                  inserted: [
                    expect.objectContaining({
                      id: secondProductCommand.payload.id,
                      modelName: 'product',
                    }),
                  ],
                }),
              }),
            }),
          });

          const finalStateAEnvelope = yield* makeAsync(() =>
            admissionA.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const finalStateBEnvelope = yield* makeAsync(() =>
            admissionB.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const finalStateA = yield* decodeRpc(finalStateAEnvelope.result);
          const finalStateB = yield* decodeRpc(finalStateBEnvelope.result);
          expect(finalStateA.frontendIndex).toBe(1);
          expect(finalStateB.frontendIndex).toBe(1);
          expect(finalStateA.resources).toEqual(finalStateB.resources);
          expect(finalStateA.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ id: firstProductCommand.payload.id }),
              expect.objectContaining({ id: secondProductCommand.payload.id }),
            ]),
          );

          const projectionA = yield* getServiceFrontendRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId: actorIdA,
              frontendName: 'catalog',
            },
          });
          const projectionB = yield* getServiceFrontendRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId: actorIdB,
              frontendName: 'catalog',
            },
          });
          const readinessA = yield* makeAsync(() =>
            projectionA.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          const readinessB = yield* makeAsync(() =>
            projectionB.getProjectionReadiness(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(readinessA).toMatchObject({
            frontendIndex: 1,
            serviceIndex: 3,
            segmentKind: 'root',
          });
          expect(readinessB).toMatchObject({
            frontendIndex: 1,
            serviceIndex: 3,
            segmentKind: 'root',
          });

          const archiveA = yield* getServiceFrontendBlockRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId: actorIdA,
              frontendName: 'catalog',
            },
          });
          const archiveB = yield* getServiceFrontendBlockRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId: actorIdB,
              frontendName: 'catalog',
            },
          });
          expect(
            yield* makeAsync(() => archiveA.getArchiveBound()).pipe(
              Effect.flatMap(decodeRpc),
            ),
          ).toEqual({ generationId: 'gen_test', frontendIndex: 1 });
          expect(
            yield* makeAsync(() => archiveB.getArchiveBound()).pipe(
              Effect.flatMap(decodeRpc),
            ),
          ).toEqual({ generationId: 'gen_test', frontendIndex: 1 });
          websocket.close();

          // 7 — service admission never provisions account-side durable state.
          const accountRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({ repoType: 'AccountRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const actorRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({ repoType: 'ActorRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const authorizationRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'AuthorizationRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const frontendRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({ repoType: 'FrontendRepo' }),
          ).pipe(Effect.flatMap(decodeRpc));
          const frontendArchiveRegistrations = yield* makeAsync(() =>
            systemRepo.getRepoRegistrations({
              repoType: 'FrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(accountRegistrations).toEqual([]);
          expect(actorRegistrations).toEqual([]);
          expect(authorizationRegistrations).toEqual([]);
          expect(frontendRegistrations).toEqual([]);
          expect(frontendArchiveRegistrations).toEqual([]);
        }),
    );

    it.effect(
      'drains the service projection outbox through its lifecycle alarm',
      () =>
        Effect.gen(function* () {
          const actorId = prefixActorId('service_frontend_alarm_viewer');
          const repo = yield* getServiceFrontendRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
            },
          });

          yield* Effect.promise(() =>
            runInDurableObject(repo, (_instance, state) =>
              state.storage.setAlarm(Date.now() + 60_000),
            ),
          );

          const didRunAlarm = yield* Effect.promise(() =>
            runDurableObjectAlarm(repo),
          );
          expect(didRunAlarm).toBe(true);

          const scheduledAlarm = yield* Effect.promise(() =>
            runInDurableObject(repo, (_instance, state) =>
              state.storage.getAlarm(),
            ),
          );
          expect(scheduledAlarm).toBeNull();
        }),
    );

    it.effect(
      'prepares a successor from authoritative target service state instead of predecessor projection rows',
      () =>
        /*
         * 1. Replay one valid target-generation service resource.
         * 2. Present stale predecessor projection bytes for a removed model.
         * 3. Prepare the successor at the exact target service watermark.
         * 4. Prove target rows, lineage index, and no-emission semantics.
         */
        Effect.gen(function* () {
          const targetGenerationId =
            'gen_service_frontend_successor_target_state';
          const predecessorGenerationId =
            'gen_service_frontend_successor_predecessor_state';
          const actorId = prefixActorId('successor_target_state_viewer');
          const targetServiceRepo = yield* getServiceRepo({
            key: {
              generationId: targetGenerationId,
              serviceName: 'app',
            },
          });

          // 1 — this row represents the authoritative target-generation result
          // after service replay has applied the target schemas and contracts.
          const targetProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Authoritative successor product',
              description: 'materialized from target ServiceRepo',
              price: 51,
            },
          });
          const targetFinalization = yield* makeAsync(() =>
            targetServiceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [targetProductCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetFinalization.failedCommands).toEqual([]);
          yield* makeAsync(() =>
            targetServiceRepo.drainServiceBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));

          const targetSnapshot = yield* makeAsync(() =>
            targetServiceRepo.getServiceFrontendSnapshot({
              serviceName: 'app',
              actorName: 'catalogViewer',
              frontendName: 'catalog',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const authoritativeTargetResource = targetSnapshot.resources[0];
          if (
            authoritativeTargetResource === undefined ||
            targetSnapshot.lastServiceCursor === null ||
            targetSnapshot.serviceIndex === null
          ) {
            return yield* Effect.fail(
              new Error('Expected a complete target ServiceRepo snapshot'),
            );
          }

          // 2 — a predecessor may contain a model removed from the target
          // projection while the target projection adds or changes other models.
          // These bytes are intentionally invalid for the current target graph.
          const stalePredecessorResource = structuredClone(
            authoritativeTargetResource,
          );
          Reflect.set(
            stalePredecessorResource,
            'modelName',
            'removedLegacyProduct',
          );
          Reflect.set(stalePredecessorResource, 'price', 'legacy-price');

          const targetServiceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId: targetGenerationId,
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
            },
          });
          const predecessorRepoName = `svcfrtbrepo_${predecessorGenerationId}/app/catalogViewer/${actorId}/catalog`;

          // 3 — predecessor state supplies logical lineage, while the causal
          // watermark must exactly match the authoritative target snapshot.
          yield* makeAsync(() =>
            targetServiceFrontendRepo.prepareSuccessor({
              sourceState: {
                actorId,
                systemId: 'sys_shopping',
                generationId: predecessorGenerationId,
                systemVersion: '0.9.0',
                systemWorkerName: 'sys_shopping:successor-source',
                serviceName: 'app',
                actorName: 'catalogViewer',
                frontendName: 'catalog',
                frontendIndex: 7,
                resources: [stalePredecessorResource],
              },
              lastServiceCursor: targetSnapshot.lastServiceCursor,
              serviceIndex: targetSnapshot.serviceIndex,
              predecessor: {
                generationId: predecessorGenerationId,
                repoName: predecessorRepoName,
                terminalFrontendIndex: 7,
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          // 4 — the stale predecessor row was neither decoded nor installed.
          // Preparation emitted only the generation boundary at logical index 8.
          const successorState = yield* makeAsync(() =>
            targetServiceFrontendRepo.getFrontendState({
              systemId: 'sys_shopping',
              systemWorkerName: 'sys_shopping:successor-source',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
              lineage: {
                mode: 'live',
                predecessor: {
                  generationId: predecessorGenerationId,
                  repoName: predecessorRepoName,
                  terminalFrontendIndex: 7,
                },
              },
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(successorState.frontendIndex).toBe(8);
          expect(successorState.resources).toEqual([
            authoritativeTargetResource,
          ]);

          const targetArchive = yield* getServiceFrontendBlockRepo({
            key: {
              generationId: targetGenerationId,
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
            },
          });
          const targetBlocks = yield* makeAsync(() =>
            targetArchive.getArchivedBlocks({
              afterFrontendIndex: 7,
              throughFrontendIndex: 8,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(targetBlocks).toEqual([
            expect.objectContaining({
              kind: 'generation-boundary',
              frontendIndex: 8,
            }),
          ]);
        }),
      120_000,
    );

    it.effect(
      'returns one coherent live resource and frontend-index snapshot after registration awaits',
      () =>
        /*
         * 1. Install root snapshot N and intercept final registration.
         * 2. Deliver relevant block T inside the awaited registration RPC.
         * 3. Require the returned index and resources to remain snapshot N.
         */
        Effect.gen(function* () {
          const generationId = 'gen_service_frontend_coherent_state';
          const actorId = prefixActorId('coherent_state_viewer');
          const serviceRepo = yield* getServiceRepo({
            key: { generationId, serviceName: 'app' },
          });

          const snapshotProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Coherent snapshot product',
              description: 'present before projection bootstrap',
              price: 61,
            },
          });
          const snapshotFinalization = yield* makeAsync(() =>
            serviceRepo.finalizeServiceCommands({
              serviceName: 'app',
              commands: [snapshotProductCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(snapshotFinalization.failedCommands).toEqual([]);
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          // 1 — this command is not finalized until registerRepos runs. The
          // projection therefore captures snapshot N before the live row exists.
          const liveProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Coherent live product',
              description: 'delivered during registration await',
              price: 62,
            },
          });
          let liveServiceIndex: number | undefined;
          const originalRegisterRepos = SystemRepo.prototype.registerRepos;
          const registerReposSpy = vi
            .spyOn(SystemRepo.prototype, 'registerRepos')
            .mockImplementation(async function (props) {
              // 2 — create every stub inside the active SystemRepo context. The
              // reentrant ServiceFrontendRepo delivery commits T while its
              // getFrontendState call is awaiting this registration response.
              const liveServiceRepo = env.SERVICE_REPO.getByName(
                `svcrepo_${generationId}/app`,
              );
              const liveFinalization =
                await liveServiceRepo.finalizeServiceCommands({
                  serviceName: 'app',
                  commands: [liveProductCommand],
                });
              if (
                liveFinalization._tag !== 'Right' ||
                liveFinalization.right.failedCommands.length !== 0 ||
                liveFinalization.right.executedCommands[0] === undefined
              ) {
                throw new Error(
                  'Expected the registration-window service command to execute',
                );
              }
              liveServiceIndex =
                liveFinalization.right.executedCommands[0].serviceIndex;

              const outboxDrain =
                await liveServiceRepo.drainServiceBlockOutbox();
              if (outboxDrain._tag !== 'Right') {
                throw new Error(
                  'Expected the registration-window service outbox to drain',
                );
              }
              const liveServiceBlockRepo = env.SERVICE_BLOCK_REPO.getByName(
                `svcbrepo_${generationId}/app`,
              );
              const subscriberDrain =
                await liveServiceBlockRepo.drainServiceFrontendSubscribers();
              if (subscriberDrain._tag !== 'Right') {
                throw new Error(
                  'Expected the registration-window subscriber to drain',
                );
              }

              return await originalRegisterRepos.call(this, props);
            });

          const serviceFrontendRepo = yield* getServiceFrontendRepo({
            key: {
              generationId,
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
            },
          });
          const stateEnvelope = yield* makeAsync(() =>
            serviceFrontendRepo.getFrontendState({
              systemId: 'sys_shopping',
              systemWorkerName: 'sys_shopping:coherent-state',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
              lineage: { mode: 'live', predecessor: null },
            }),
          );
          registerReposSpy.mockRestore();

          const serviceFrontendRepoName = `svcfrtrepo_${generationId}/app/catalogViewer/${actorId}/catalog`;
          const committedState = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_REPO.getByName(serviceFrontendRepoName),
              (_instance, state) =>
                state.storage.sql
                  .exec<{
                    serviceIndex: number;
                    frontendIndex: number;
                  }>(
                    'SELECT serviceIndex, frontendIndex FROM projectionState WHERE id = ?',
                    'state',
                  )
                  .one(),
            ),
          );
          expect(liveServiceIndex).toBeTypeOf('number');
          expect(committedState).toEqual({
            serviceIndex: liveServiceIndex,
            frontendIndex: 1,
          });

          // 3 — old behavior returned frontendIndex 0 with both resources here.
          // The transactional snapshot must retain N's index and resources
          // together even though T committed during the registration await.
          const coherentState = yield* decodeRpc(stateEnvelope);
          expect(coherentState.frontendIndex).toBe(0);
          expect(coherentState.resources).toEqual([
            expect.objectContaining({
              id: snapshotProductCommand.payload.id,
            }),
          ]);
        }),
      120_000,
    );

    it.effect(
      'keeps snapshot-to-subscribe catch-up unregistered on failure and publishes the pair only after an exact retry',
      () =>
        /*
         * 1. Finalize snapshot block N and admit one service-owned actor.
         * 2. Hold ServiceBlockRepo while the real ServiceRepo snapshot installs.
         * 3. Finalize mutation T, archive it, and inject one corrupt catch-up row.
         * 4. Prove failed initialization leaves both registrations absent.
         * 5. Repair the captured T bytes and retry the deterministic projection.
         * 6. Prove the exact suffix applied once before the pair became visible.
         * 7. Freeze and prove the admitted reservation became a complete bound.
         */
        Effect.gen(function* () {
          const apis = makeTestApis();
          const systemApi = yield* makeAsync(() =>
            apis.getSystemApi({ zerospinSecretKey: 'sk_test' }),
          );

          // 1 — establish a real ServiceRepo snapshot at N.
          const snapshotProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Snapshot product',
              description: 'present at snapshot N',
              price: 30,
            },
          });
          const snapshotFinalizationEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [snapshotProductCommand],
                },
              ],
            }),
          );
          const snapshotFinalization = yield* decodeRpc(
            snapshotFinalizationEnvelope.result,
          );
          expect(snapshotFinalization.failed).toEqual([]);
          const snapshotExecution = snapshotFinalization.executed[0];
          if (snapshotExecution === undefined) {
            return yield* Effect.fail(
              new Error('Expected the snapshot command to execute'),
            );
          }
          const serviceRepo = yield* getServiceRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          yield* makeAsync(() => serviceRepo.drainServiceBlockOutbox()).pipe(
            Effect.flatMap(decodeRpc),
          );

          const viewer = 'snapshot_gap_viewer';
          const actorId = prefixActorId(viewer);
          const admission = yield* makeAsync(() =>
            apis.getServiceFrontendApi({
              publishableKey: 'pk_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              frontendName: 'catalog',
              signature: { viewerId: viewer },
            }),
          );
          expect(admission._tag).toBe('Success');
          if (admission._tag !== 'Success') {
            return yield* Effect.fail(
              new Error('Expected service frontend admission to succeed'),
            );
          }

          const serviceBlockRepoName = 'svcbrepo_gen_test/app';
          const serviceRepoName = 'svcrepo_gen_test/app';
          const serviceFrontendRepoName = `svcfrtrepo_gen_test/app/catalogViewer/${actorId}/catalog`;
          const serviceFrontendBlockRepoName = `svcfrtbrepo_gen_test/app/catalogViewer/${actorId}/catalog`;

          // 2 — hold the singleton archive so getFrontendState can complete
          // its real ServiceRepo snapshot and predecessor write, then wait at
          // the subscriber-registration boundary.
          let markServiceBlockRepoHeld: (() => void) | undefined;
          const serviceBlockRepoHeld = new Promise<void>(resolve => {
            markServiceBlockRepoHeld = resolve;
          });
          let signalGapBlockReady: (() => void) | undefined;
          const gapBlockReady = new Promise<void>(resolve => {
            signalGapBlockReady = resolve;
          });
          let markGapBlockArchived: (() => void) | undefined;
          const gapBlockArchived = new Promise<void>(resolve => {
            markGapBlockArchived = resolve;
          });
          let releaseServiceBlockRepo: (() => void) | undefined;
          const serviceBlockRepoRelease = new Promise<void>(resolve => {
            releaseServiceBlockRepo = resolve;
          });
          let gapBlock: IServiceBlock | undefined;

          const heldServiceBlockRepo = runInDurableObject(
            env.SERVICE_BLOCK_REPO.getByName(serviceBlockRepoName),
            async (instance, state) =>
              await state.blockConcurrencyWhile(async () => {
                markServiceBlockRepoHeld?.();
                await gapBlockReady;
                if (gapBlock === undefined) {
                  throw new Error(
                    'Gap block was not provided to ServiceBlockRepo',
                  );
                }
                const published = await instance.publish(gapBlock);
                expect(published._tag).toBe('Right');
                state.storage.sql.exec(
                  'UPDATE serviceBlocks SET block = ? WHERE serviceIndex = ?',
                  JSON.stringify({ injectedCorruption: true }),
                  gapBlock.serviceIndex,
                );
                markGapBlockArchived?.();
                await serviceBlockRepoRelease;
              }),
          );
          yield* Effect.promise(() => serviceBlockRepoHeld);

          const firstStateEnvelopePromise =
            admission.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            });

          // The lineage write is after snapshot installation and immediately
          // before ServiceBlockRepo subscription, so it is the deterministic
          // signal that the projection is waiting in the intended window.
          yield* Effect.promise(() =>
            vi.waitFor(
              async () => {
                const lineageCount = await runInDurableObject(
                  env.SERVICE_FRONTEND_BLOCK_REPO.getByName(
                    serviceFrontendBlockRepoName,
                  ),
                  (_instance, state) =>
                    state.storage.sql
                      .exec<{ count: number }>(
                        'SELECT COUNT(*) AS count FROM lineage',
                      )
                      .one().count,
                );
                expect(lineageCount).toBe(1);
              },
              { timeout: 10_000, interval: 25 },
            ),
          );

          // 3 — finalize the relevant mutation only after snapshot N is
          // installed. Its real ServiceRepo outbox provides the canonical T
          // block that is archived ahead of subscriber registration.
          const gapProductCommand = yield* appService.makeCommand({
            contractName: 'createProduct',
            systemVersion: system.version,
            payload: {
              name: 'Gap product',
              description: 'finalized between snapshot and subscription',
              price: 40,
            },
          });
          const gapFinalizationEnvelope = yield* makeAsync(() =>
            systemApi.finalizeServiceCommands({
              traceContext: null,
              args: [
                {
                  serviceName: appService.name,
                  commands: [gapProductCommand],
                },
              ],
            }),
          );
          const gapFinalization = yield* decodeRpc(
            gapFinalizationEnvelope.result,
          );
          expect(gapFinalization.failed).toEqual([]);
          const gapExecution = gapFinalization.executed[0];
          if (gapExecution === undefined) {
            return yield* Effect.fail(
              new Error('Expected the gap command to execute'),
            );
          }
          const gapOutboxRow = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_REPO.getByName(serviceRepoName),
              (_instance, state) =>
                state.storage.sql
                  .exec<{ block: string }>(
                    'SELECT block FROM serviceBlockOutbox WHERE serviceIndex = ?',
                    gapExecution.serviceIndex,
                  )
                  .one(),
            ),
          );
          gapBlock = Schema.decodeUnknownSync(
            Schema.parseJson(ServiceBlockSchema),
          )(gapOutboxRow.block);
          expect(gapBlock.serviceIndex).toBe(gapExecution.serviceIndex);
          signalGapBlockReady?.();
          yield* Effect.promise(() => gapBlockArchived);
          releaseServiceBlockRepo?.();
          yield* Effect.promise(() => heldServiceBlockRepo);

          const failedStateEnvelope = yield* Effect.promise(
            () => firstStateEnvelopePromise,
          );
          const failedState = yield* decodeRpc(failedStateEnvelope.result).pipe(
            Effect.either,
          );
          expect(failedState._tag).toBe('Left');

          // 4 — deterministic projection bytes may remain, but neither half
          // is discoverable until catch-up and archive acknowledgement finish.
          const failedProjectionRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const failedArchiveRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).getRepoRegistrations({
              repoType: 'ServiceFrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(failedProjectionRegistrations).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({ repoName: serviceFrontendRepoName }),
            ]),
          );
          expect(failedArchiveRegistrations).not.toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                repoName: serviceFrontendBlockRepoName,
              }),
            ]),
          );

          const retainedProjection = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_FRONTEND_REPO.getByName(serviceFrontendRepoName),
              (_instance, state) =>
                state.storage.sql
                  .exec<{
                    status: string;
                    lastServiceCursor: string;
                    serviceIndex: number;
                    frontendIndex: number;
                  }>(
                    'SELECT status, lastServiceCursor, serviceIndex, frontendIndex FROM projectionState WHERE id = ?',
                    'state',
                  )
                  .one(),
            ),
          );
          expect(retainedProjection).toMatchObject({
            status: 'initializing',
            lastServiceCursor: snapshotExecution.serviceCursor,
            serviceIndex: snapshotExecution.serviceIndex,
            frontendIndex: 0,
          });
          const retainedSubscriber = yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_BLOCK_REPO.getByName(serviceBlockRepoName),
              (_instance, state) =>
                state.storage.sql
                  .exec<{
                    currentServiceIndex: number;
                    catchupThroughServiceIndex: number;
                    status: string;
                  }>(
                    'SELECT currentServiceIndex, catchupThroughServiceIndex, status FROM serviceFrontendSubscribers WHERE serviceFrontendRepoName = ?',
                    serviceFrontendRepoName,
                  )
                  .one(),
            ),
          );
          expect(retainedSubscriber).toEqual({
            currentServiceIndex: snapshotExecution.serviceIndex,
            catchupThroughServiceIndex: gapExecution.serviceIndex,
            status: 'catching-up',
          });

          // 5 — restore the exact canonical T bytes retained by ServiceRepo,
          // then retry the same actor/frontend target without reinstalling N.
          yield* Effect.promise(() =>
            runInDurableObject(
              env.SERVICE_BLOCK_REPO.getByName(serviceBlockRepoName),
              (_instance, state) => {
                state.storage.sql.exec(
                  'UPDATE serviceBlocks SET block = ? WHERE serviceIndex = ?',
                  gapOutboxRow.block,
                  gapExecution.serviceIndex,
                );
              },
            ),
          );
          const retriedStateEnvelope = yield* makeAsync(() =>
            admission.frontendApi.getFrontendState({
              traceContext: null,
              args: [],
            }),
          );
          const retriedState = yield* decodeRpc(retriedStateEnvelope.result);
          expect(retriedState).toMatchObject({
            actorId,
            serviceName: 'app',
            actorName: 'catalogViewer',
            frontendName: 'catalog',
            frontendIndex: 1,
          });
          expect(retriedState.resources).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: snapshotProductCommand.payload.id,
              }),
              expect.objectContaining({ id: gapProductCommand.payload.id }),
            ]),
          );

          // 6 — successful catch-up publishes both registrations atomically,
          // and the relevant T block occupies exactly one archive index.
          const readyProjectionRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).getRepoRegistrations({
              repoType: 'ServiceFrontendRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const readyArchiveRegistrations = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).getRepoRegistrations({
              repoType: 'ServiceFrontendBlockRepo',
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(readyProjectionRegistrations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ repoName: serviceFrontendRepoName }),
            ]),
          );
          expect(readyArchiveRegistrations).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                repoName: serviceFrontendBlockRepoName,
              }),
            ]),
          );

          const archive = yield* getServiceFrontendBlockRepo({
            key: {
              generationId: 'gen_test',
              serviceName: 'app',
              actorName: 'catalogViewer',
              actorId,
              frontendName: 'catalog',
            },
          });
          const archivedGapBlocks = yield* makeAsync(() =>
            archive.getArchivedBlocks({
              afterFrontendIndex: 0,
              throughFrontendIndex: 1,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(archivedGapBlocks).toHaveLength(1);
          expect(archivedGapBlocks[0]).toMatchObject({
            kind: 'service-frontend',
            frontendBlock: {
              frontendIndex: 1,
              lastServiceCursor: gapExecution.serviceCursor,
            },
          });

          // 7 — the pre-freeze lineage reservation is upgraded from nullable
          // admission metadata to this projection's exact immutable archive.
          // The forced corrupt row also delayed the earlier actors in this
          // file, so finish their ordinary live deliveries from the repaired
          // canonical bytes before asserting the generation-wide freeze.
          const serviceBlockRepo = yield* getServiceBlockRepo({
            key: { generationId: 'gen_test', serviceName: 'app' },
          });
          yield* makeAsync(() =>
            serviceBlockRepo.drainServiceFrontendSubscribers(),
          ).pipe(Effect.flatMap(decodeRpc));
          const frozen = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).drainGeneration({
              deployId: 'dpl_test',
              mode: 'freeze',
              successorGenerationId: null,
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(frozen).toEqual({
            deployId: 'dpl_test',
            generationId: 'gen_test',
            admission: 'draining',
          });
          const frozenState = yield* makeAsync(() =>
            SystemRepo.getRepo({
              generationId: 'gen_test',
            }).getGenerationState(),
          ).pipe(Effect.flatMap(decodeRpc));
          expect(frozenState).toMatchObject({
            admission: 'draining',
            drainFrozenAt: expect.any(Date),
            drainBounds: expect.arrayContaining([
              expect.objectContaining({
                repoType: 'ServiceFrontendRepo',
                repoName: serviceFrontendRepoName,
                terminalCursor: gapExecution.serviceCursor,
                terminalIndex: gapExecution.serviceIndex,
                systemWorkerName: 'sys_shopping:local',
                frontendBlockRepoName: serviceFrontendBlockRepoName,
                terminalFrontendIndex: 1,
                segmentKind: 'root',
              }),
            ]),
          });
        }),
      120_000,
    );
  });
});
