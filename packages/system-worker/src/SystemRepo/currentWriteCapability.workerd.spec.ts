import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { encodeCommand } from '@zerospin/core/contracts/encodeCommand';
import { makeSessionCommand } from '@zerospin/core/contracts/makeSessionCommand';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { IncrementalMonotonicFactory } from '@zerospin/core/test-utils/IncrementalMonotonicFactory';
import { makePrefixedIncrementalIdFactory } from '@zerospin/core/test-utils/makePrefixedIncrementalIdFactory';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAggregateId } from '@zerospin/core/utils/makeAggregateId';
import { makeCursor } from '@zerospin/core/utils/makeCursor';
import { env, runInDurableObject } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { Effect, Layer, Schema } from 'effect';
import { afterAll, describe, expect } from 'vitest';

import { AggregateFrontendApi } from '../AggregateFrontendApi/AggregateFrontendApi.js';
import { AggregateFrontendRepo } from '../AggregateFrontendRepo/AggregateFrontendRepo.js';
import { getAggregateFrontendRepo } from '../AggregateFrontendRepo/getAggregateFrontendRepo/getAggregateFrontendRepo.js';
import { main, system } from '../fixtures/system.js';
import { makeSystemRuntime } from '../makeSystemRuntime.js';
import { managedRuntime } from '../managedRuntime.js';
import { getServiceRepo } from '../ServiceRepo/getServiceRepo/getServiceRepo.js';
import { WorkerExportsSystemWorkerResolver } from '../SystemWorkerResolver/WorkerExportsSystemWorkerResolver.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';
import { prepareGenerationStateFixture } from '../workerd-utils/prepareGenerationStateFixture.js';

import { SystemRepo } from './SystemRepo.js';

const runtime = makeSystemRuntime({
  systemWorkerResolver: WorkerExportsSystemWorkerResolver,
});

afterAll(async () => {
  await runtime.dispose();
});

describe('SystemRepo current-write routing from a retained AggregateFrontendApi', () => {
  it.layer(
    Layer.mergeAll(
      AsyncLive,
      IncrementalMonotonicFactory,
      makePrefixedIncrementalIdFactory('retained-current-write'),
    ),
  )(it => {
    it.effect(
      'keeps one real capability readable while supported writes follow compatible, linked, and clean promotion',
      () =>
        Effect.gen(function* () {
          const initial = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'retained-current-write-initial',
          });
          const systemId = Schema.decodeUnknownSync(
            makeAbbreviationIdSchema(coreAbbreviations.system),
          )(env.ZEROSPIN_SYSTEM_ID);
          const aggregateId = makeAggregateId({
            id: 'retained-current-write',
          });
          const userId = system.aggregates.user.models.user.prefixId(
            'retained-current-write',
          );
          const frontendSpec = makeFrontendControllerSpec(main);
          const aggregateFrontendLock = frontendSpec.aggregateFrontendLock;
          const systemRepo = SystemRepo.getRepo({ systemId });
          const service = system.services.app;
          const compatibleProductId = service.models.product.prefixId(
            'retained-compatible',
          );
          const linkedProductId =
            service.models.product.prefixId('retained-linked');
          const cleanListId =
            system.aggregates.user.models.list.prefixId('retained-clean');
          const unsupportedProductId = service.models.product.prefixId(
            'retained-unsupported',
          );

          const compatibleProductCommand = yield* service.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: compatibleProductId,
              name: 'Compatible retained command',
            },
          });
          const linkedProductCommand = yield* service.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: linkedProductId,
              name: 'Linked retained command',
            },
          });
          const unsupportedProductCommand = yield* service.makeCommand({
            contractName: 'createProduct',
            payload: {
              id: unsupportedProductId,
              name: 'Unsupported retained command',
            },
          });
          const encodedCompatibleProductCommand = yield* encodeCommand({
            contract: service.contracts.createProduct,
            command: compatibleProductCommand,
          });
          const encodedLinkedProductCommand = yield* encodeCommand({
            contract: service.contracts.createProduct,
            command: linkedProductCommand,
          });
          const encodedUnsupportedProductCommand = yield* encodeCommand({
            contract: service.contracts.createProduct,
            command: unsupportedProductCommand,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeServiceCommands({
              serviceName: service.name,
              commands: [
                encodedCompatibleProductCommand,
                encodedLinkedProductCommand,
                encodedUnsupportedProductCommand,
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));

          const serviceRepo = yield* getServiceRepo({
            key: {
              generationId: initial.generationId,
              serviceName: service.name,
            },
          });
          const productSnapshot = yield* makeAsync(() =>
            serviceRepo.getReplicatedResources({
              currentServiceIndex: null,
              resources: [
                {
                  modelName: service.models.product.modelName,
                  resourceId: compatibleProductId,
                },
                {
                  modelName: service.models.product.modelName,
                  resourceId: linkedProductId,
                },
                {
                  modelName: service.models.product.modelName,
                  resourceId: unsupportedProductId,
                },
              ],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const compatibleProduct = productSnapshot.resources.find(
            resource => resource.resourceId === compatibleProductId,
          );
          const linkedProduct = productSnapshot.resources.find(
            resource => resource.resourceId === linkedProductId,
          );
          const unsupportedProduct = productSnapshot.resources.find(
            resource => resource.resourceId === unsupportedProductId,
          );
          if (
            compatibleProduct?.status !== 'found' ||
            linkedProduct?.status !== 'found' ||
            unsupportedProduct?.status !== 'found'
          ) {
            return yield* Effect.die(
              new Error('Expected all retained capability service resources'),
            );
          }

          const sessionId = 'sesn_retained_current_write';
          const compatibleSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.replicateProduct,
            payload: { product: compatibleProduct.resource },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const linkedSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.replicateProduct,
            payload: { product: linkedProduct.resource },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const cleanSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.createList,
            payload: {
              id: cleanListId,
              name: 'Clean retained command',
              userId,
            },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const unsupportedSessionCommand = yield* makeSessionCommand({
            aggregateId,
            aggregateName: main.aggregateName,
            userId,
            contract: main.contracts.replicateProduct,
            payload: { product: unsupportedProduct.resource },
            sessionId,
            frontendName: main.frontendName,
            systemName: system.name,
          });
          const compatibleStagedCommand = yield* encodeCommand({
            contract: main.contracts.replicateProduct,
            command: {
              ...compatibleSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-05-01T00:00:00.000Z'),
              replicaIndex: 1,
              status: 'staged',
            },
          });
          const linkedStagedCommand = yield* encodeCommand({
            contract: main.contracts.replicateProduct,
            command: {
              ...linkedSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-05-01T00:00:01.000Z'),
              replicaIndex: 2,
              status: 'staged',
            },
          });
          const cleanStagedCommand = yield* encodeCommand({
            contract: main.contracts.createList,
            command: {
              ...cleanSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-05-01T00:00:02.000Z'),
              replicaIndex: 3,
              status: 'staged',
            },
          });
          const encodedUnsupportedStagedCommand = yield* encodeCommand({
            contract: main.contracts.replicateProduct,
            command: {
              ...unsupportedSessionCommand,
              commandType: 'frontend',
              stagedCursor: yield* makeCursor({
                abbreviation: coreAbbreviations.stagedCursor,
              }),
              stagedAt: new Date('2026-05-01T00:00:03.000Z'),
              replicaIndex: 4,
              status: 'staged',
            },
          });
          const unsupportedStagedCommand = {
            ...encodedUnsupportedStagedCommand,
            contractVersion: '0.9.0',
          };

          const retainedAggregateFrontendApi = new AggregateFrontendApi({
            authResults: {
              actorRef: {
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
              },
              aggregateFrontendLock,
              frontendName: main.frontendName,
              frontendSpec,
              generationId: initial.generationId,
              systemId,
              systemVersion: system.version,
              systemWorkerName: 'retained-current-write',
            },
            runtime,
          });
          const acquiredState = yield* makeAsync(() =>
            retainedAggregateFrontendApi.getState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(acquiredState).toMatchObject({
            aggregateId,
            userId,
            frontendName: main.frontendName,
          });

          const compatible = yield* prepareGenerationStateFixture({
            clean: false,
            workerVersionId: 'retained-current-write-compatible',
          });
          expect(compatible.generationId).toBe(initial.generationId);
          const compatiblePush = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [compatibleStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(compatiblePush.pushedCommands).toEqual([
            expect.objectContaining({ id: compatibleStagedCommand.id }),
          ]);
          const compatibleAggregateFrontendRepo =
            yield* getAggregateFrontendRepo({
              key: {
                generationId: compatible.generationId,
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                frontendName: main.frontendName,
              },
            });
          yield* makeAsync(() =>
            compatibleAggregateFrontendRepo.drainPushBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const compatibleSettled = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [compatibleStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(compatibleSettled.executedCommands).toEqual([
            expect.objectContaining({ id: compatibleStagedCommand.id }),
          ]);

          const historicalSystemSpec = structuredClone(
            makeSystemSpec({ system }),
          );
          historicalSystemSpec.version = '0.9.0';
          Reflect.deleteProperty(historicalSystemSpec.services, 'inventory');
          yield* Effect.promise(() =>
            runInDurableObject(systemRepo, (_instance, state) => {
              const encodedHistoricalSystemSpec =
                JSON.stringify(historicalSystemSpec);
              state.storage.sql.exec(
                'UPDATE deploy SET systemSpec = ? WHERE id = ?',
                encodedHistoricalSystemSpec,
                compatible.deployId,
              );
              state.storage.sql.exec(
                'UPDATE generationState SET activeSystemSpec = ? WHERE generationId = ?',
                encodedHistoricalSystemSpec,
                compatible.generationId,
              );
            }),
          );

          const linked = yield* prepareGenerationStateFixture({
            clean: false,
            workerVersionId: 'retained-current-write-linked',
          });
          expect(linked.generationId).not.toBe(initial.generationId);
          const linkedRead = yield* makeAsync(() =>
            retainedAggregateFrontendApi.getState({
              traceContext: null,
              args: [],
            }),
          ).pipe(
            Effect.flatMap(envelope => decodeRpc(envelope.result)),
            Effect.either,
          );
          expect(linkedRead._tag).toBe('Left');
          if (linkedRead._tag === 'Left') {
            expect(linkedRead.left.code).toBe(
              'generation-read-admission-closed',
            );
          }
          const linkedPush = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [linkedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(linkedPush.pushedCommands).toEqual([
            expect.objectContaining({ id: linkedStagedCommand.id }),
          ]);
          const linkedStoredCommand = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key: {
                generationId: linked.generationId,
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                frontendName: main.frontendName,
              },
              fn: ({ db, schema }) =>
                db
                  .select({ id: schema.pushedCommands.id })
                  .from(schema.pushedCommands)
                  .where(eq(schema.pushedCommands.id, linkedStagedCommand.id))
                  .get(),
            }),
          );
          expect(linkedStoredCommand).toEqual({ id: linkedStagedCommand.id });
          const linkedAggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key: {
              generationId: linked.generationId,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
            },
          });
          yield* makeAsync(() =>
            linkedAggregateFrontendRepo.drainPushBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const linkedSettled = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [linkedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(linkedSettled.executedCommands).toEqual([
            expect.objectContaining({ id: linkedStagedCommand.id }),
          ]);

          const clean = yield* prepareGenerationStateFixture({
            clean: true,
            workerVersionId: 'retained-current-write-clean',
          });
          expect(clean.generationId).not.toBe(linked.generationId);
          const cleanUserCommand = yield* system.aggregates.user.makeCommand({
            contractName: 'createUser',
            aggregateId,
            systemName: system.name,
            payload: { id: userId, name: 'Clean retained user' },
          });
          const encodedCleanUserCommand = yield* encodeCommand({
            contract: system.aggregates.user.contracts.createUser,
            command: cleanUserCommand,
          });
          yield* makeAsync(() =>
            systemRepo.finalizeAggregateCommands({
              aggregateId,
              aggregateName: main.aggregateName,
              commands: [encodedCleanUserCommand],
            }),
          ).pipe(Effect.flatMap(decodeRpc));
          const cleanGenerationAggregateFrontendApi = new AggregateFrontendApi({
            authResults: {
              actorRef: {
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
              },
              aggregateFrontendLock,
              frontendName: main.frontendName,
              frontendSpec,
              generationId: clean.generationId,
              systemId,
              systemVersion: system.version,
              systemWorkerName: 'retained-current-write',
            },
            runtime,
          });
          const cleanRead = yield* makeAsync(() =>
            cleanGenerationAggregateFrontendApi.getState({
              traceContext: null,
              args: [],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(cleanRead).toMatchObject({
            aggregateId,
            userId,
            frontendName: main.frontendName,
          });
          const cleanPush = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [cleanStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(cleanPush.pushedCommands).toEqual([
            expect.objectContaining({ id: cleanStagedCommand.id }),
          ]);
          const cleanStoredCommand = yield* Effect.promise(() =>
            executeInRepo({
              managedRuntime,
              getRepo: getAggregateFrontendRepo,
              repo: AggregateFrontendRepo,
              key: {
                generationId: clean.generationId,
                aggregateId,
                aggregateName: main.aggregateName,
                userId,
                frontendName: main.frontendName,
              },
              fn: ({ db, schema }) =>
                db
                  .select({ id: schema.pushedCommands.id })
                  .from(schema.pushedCommands)
                  .where(eq(schema.pushedCommands.id, cleanStagedCommand.id))
                  .get(),
            }),
          );
          expect(cleanStoredCommand).toEqual({ id: cleanStagedCommand.id });
          const cleanAggregateFrontendRepo = yield* getAggregateFrontendRepo({
            key: {
              generationId: clean.generationId,
              aggregateId,
              aggregateName: main.aggregateName,
              userId,
              frontendName: main.frontendName,
            },
          });
          yield* makeAsync(() =>
            cleanAggregateFrontendRepo.drainPushBlockOutbox(),
          ).pipe(Effect.flatMap(decodeRpc));
          const cleanSettled = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [cleanStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(cleanSettled.executedCommands).toEqual([
            expect.objectContaining({ id: cleanStagedCommand.id }),
          ]);

          const unsupported = yield* makeAsync(() =>
            retainedAggregateFrontendApi.pushCommands({
              traceContext: null,
              args: [{ commands: [unsupportedStagedCommand] }],
            }),
          ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
          expect(unsupported.failedStagedCommands).toEqual([
            expect.objectContaining({
              id: unsupportedStagedCommand.id,
              failure: expect.stringContaining(
                'aggregate-frontend-contract-definition-missing',
              ),
            }),
          ]);
          const unsupportedFailure =
            unsupported.failedStagedCommands[0]?.failure ?? '';
          expect(unsupportedFailure).not.toContain('generation-');
          expect(unsupportedFailure).not.toContain('deploy');
        }),
      40_000,
    );
  });
});
