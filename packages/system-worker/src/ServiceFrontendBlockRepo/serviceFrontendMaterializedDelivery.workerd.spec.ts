import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect, vi } from 'vitest';

import { system } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { getServiceFrontendBlockRepo } from './getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';
import { onMessage } from './onMessage/onMessage.js';
import { ServiceFrontendBlockRepo } from './ServiceFrontendBlockRepo.js';

const { adaptFrontendResource } = vi.hoisted(() => ({
  adaptFrontendResource: vi.fn(),
}));

vi.mock(
  '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js',
  () => ({
    adaptFrontendResource,
  }),
);

describe('ServiceFrontendBlockRepo persisted model-version delivery', () => {
  it.effect(
    'replays persisted v1 resources through root, intermediate, and active segments whose canonical resources are v3',
    () =>
      Effect.gen(function* () {
        const materializationSystemSpec = makeSystemSpec({ system });
        const productModel =
          materializationSystemSpec.services.app?.frontends.products?.controller
            .models.product;
        if (productModel === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture product frontend model'),
          );
        }
        productModel.version = '3.0.0';
        productModel.historicalDefinitions = [
          {
            modelName: productModel.modelName,
            abbreviation: productModel.abbreviation,
            version: '1.0.0',
            hasDirectAdapter: true,
            properties: productModel.properties,
            indexes: productModel.indexes,
          },
          {
            modelName: productModel.modelName,
            abbreviation: productModel.abbreviation,
            version: '2.0.0',
            hasDirectAdapter: true,
            properties: productModel.properties,
            indexes: productModel.indexes,
          },
        ];
        adaptFrontendResource.mockImplementation(props => {
          const resource = {
            id: props.resource.id,
            modelName: props.resource.modelName,
            createdAt: props.resource.createdAt.toISOString(),
            updatedAt: props.resource.updatedAt.toISOString(),
            deletedAt:
              props.resource.deletedAt === null ||
              props.resource.deletedAt === undefined
                ? props.resource.deletedAt
                : props.resource.deletedAt.toISOString(),
          };
          if (props.modelVersion === '1.0.0') {
            return Effect.succeed({
              modelName: props.resource.modelName,
              resource: {
                ...resource,
                version: '1.0.0',
                name: String(props.resource.nameV3),
              },
            });
          }
          if (props.modelVersion === '2.0.0') {
            return Effect.succeed({
              modelName: props.resource.modelName,
              resource: {
                ...resource,
                version: '2.0.0',
                displayName: String(props.resource.nameV3),
              },
            });
          }
          return Effect.succeed({
            modelName: props.resource.modelName,
            resource: {
              ...resource,
              version: '3.0.0',
              nameV3: props.resource.nameV3,
            },
          });
        });
        const rootKey = {
          generationId: 'gen_service_materialized_root',
          serviceName: 'app',
          userId: 'user_service_materialized_continuity',
          frontendName: 'products',
        };
        const intermediateKey = {
          ...rootKey,
          generationId: 'gen_service_materialized_intermediate',
        };
        const activeKey = {
          ...rootKey,
          generationId: 'gen_service_materialized_active',
        };
        const rootRepo = yield* getServiceFrontendBlockRepo({ key: rootKey });
        const intermediateRepo = yield* getServiceFrontendBlockRepo({
          key: intermediateKey,
        });
        const activeRepo = yield* getServiceFrontendBlockRepo({
          key: activeKey,
        });
        const rootRepoName =
          yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
            rootKey,
          );
        const intermediateRepoName =
          yield* ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
            intermediateKey,
          );

        yield* makeAsync(() =>
          rootRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          rootRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: rootKey.serviceName,
                userId: rootKey.userId,
                frontendName: rootKey.frontendName,
                frontendIndex: 1,
                lastServiceCursor: 'svcur_service_materialized_1',
                delta: {
                  inserted: [
                    {
                      id: 'prd_service_materialized',
                      modelName: 'product',
                      version: '3.0.0',
                      nameV3: 'one',
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* makeAsync(() =>
          intermediateRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: {
              generationId: rootKey.generationId,
              repoName: rootRepoName,
              terminalFrontendIndex: 1,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          intermediateRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: intermediateKey.serviceName,
                userId: intermediateKey.userId,
                frontendName: intermediateKey.frontendName,
                frontendIndex: 2,
                lastServiceCursor: 'svcur_service_materialized_2',
                delta: {
                  inserted: [],
                  updated: [
                    {
                      id: 'prd_service_materialized',
                      modelName: 'product',
                      version: '3.0.0',
                      nameV3: 'two',
                      createdAt: new Date(1),
                      updatedAt: new Date(2),
                      deletedAt: null,
                    },
                  ],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        yield* makeAsync(() =>
          activeRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: {
              generationId: intermediateKey.generationId,
              repoName: intermediateRepoName,
              terminalFrontendIndex: 2,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          activeRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: activeKey.serviceName,
                userId: activeKey.userId,
                frontendName: activeKey.frontendName,
                frontendIndex: 3,
                lastServiceCursor: 'svcur_service_materialized_3',
                delta: {
                  inserted: [],
                  updated: [
                    {
                      id: 'prd_service_materialized',
                      modelName: 'product',
                      version: '3.0.0',
                      nameV3: 'three',
                      createdAt: new Date(1),
                      updatedAt: new Date(3),
                      deletedAt: null,
                    },
                  ],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }
        adaptFrontendResource.mockClear();
        const sent: string[] = [];
        const close = vi.fn();
        let connectionState: {
          phase: 'awaiting-resume' | 'replaying' | 'live';
          serviceName: string;
          userId: string;
          frontendName: string;
          serviceFrontendLock: typeof serviceFrontendLock;
        } = {
          phase: 'awaiting-resume',
          serviceName: activeKey.serviceName,
          userId: activeKey.userId,
          frontendName: activeKey.frontendName,
          serviceFrontendLock,
        };
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceFrontendBlockRepo,
            repo: ServiceFrontendBlockRepo,
            key: activeKey,
            fn: ({ db }) =>
              managedRuntime.runPromise(
                onMessage({
                  connection: {
                    get state() {
                      return connectionState;
                    },
                    setState(next) {
                      connectionState = next;
                    },
                    send(message: unknown) {
                      sent.push(String(message));
                    },
                    close,
                  },
                  message: JSON.stringify({ frontendIndex: 0 }),
                  db,
                  key: activeKey,
                  parseRepoName: repoName =>
                    ServiceFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
                      repoName,
                    ),
                  getPredecessorRepo: repoName =>
                    env.SERVICE_FRONTEND_BLOCK_REPO.getByName(repoName),
                }),
              ),
          }),
        );

        const messages = sent.map(message => JSON.parse(message));
        const blocks = messages.filter(
          message => message.type === 'serviceFrontendBlock',
        );
        expect(blocks.map(message => message.sync.frontendIndex)).toEqual([
          1, 2, 3,
        ]);
        expect(blocks[0]?.sync.delta.inserted[0]).toMatchObject({
          modelName: 'product',
          version: '1.0.0',
          name: 'one',
        });
        expect(blocks[1]?.sync.delta.updated[0]).toMatchObject({
          modelName: 'product',
          version: '1.0.0',
          name: 'two',
        });
        expect(blocks[2]?.sync.delta.updated[0]).toMatchObject({
          modelName: 'product',
          version: '1.0.0',
          name: 'three',
        });
        const activeV3Decode = yield* Schema.decodeUnknown(
          Schema.Struct({
            id: Schema.String,
            modelName: Schema.Literal('product'),
            version: Schema.Literal('3.0.0'),
            nameV3: Schema.String,
            createdAt: Schema.String,
            updatedAt: Schema.String,
            deletedAt: Schema.Null,
          }),
        )(blocks[0]?.sync.delta.inserted[0], {
          onExcessProperty: 'error',
        }).pipe(Effect.either);
        expect(activeV3Decode._tag).toBe('Left');
        expect(messages).toContainEqual({
          type: 'replay-complete',
          frontendIndex: 3,
        });
        expect(connectionState.phase).toBe('live');
        expect(close).not.toHaveBeenCalled();
        expect(adaptFrontendResource).not.toHaveBeenCalled();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'returns state-required below coverage floors and for missing or corrupt persisted variants',
    () =>
      Effect.gen(function* () {
        adaptFrontendResource.mockImplementation(props =>
          Effect.succeed({
            modelName: props.resource.modelName,
            resource: {
              ...props.resource,
              createdAt: props.resource.createdAt.toISOString(),
              updatedAt: props.resource.updatedAt.toISOString(),
              deletedAt:
                props.resource.deletedAt === null ||
                props.resource.deletedAt === undefined
                  ? props.resource.deletedAt
                  : props.resource.deletedAt.toISOString(),
            },
          }),
        );
        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }

        const floorKey = {
          generationId: 'gen_service_materialized_floor',
          serviceName: 'app',
          userId: 'user_service_materialized_floor',
          frontendName: 'products',
        };
        const floorRepo = yield* getServiceFrontendBlockRepo({ key: floorKey });
        yield* makeAsync(() =>
          floorRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          floorRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: floorKey.serviceName,
                userId: floorKey.userId,
                frontendName: floorKey.frontendName,
                frontendIndex: 1,
                lastServiceCursor: 'svcur_service_materialized_floor',
                delta: {
                  inserted: [
                    {
                      id: 'prd_service_materialized_floor',
                      modelName: 'product',
                      version: '1.0.0',
                      name: 'floor',
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceFrontendBlockRepo,
            repo: ServiceFrontendBlockRepo,
            key: floorKey,
            fn: ({ state }) => {
              state.storage.sql.exec(
                `UPDATE serviceFrontendModelVersionCoverage
                 SET replayFloorFrontendIndex = 1
                 WHERE modelName = 'product' AND modelVersion = '1.0.0'`,
              );
            },
          }),
        );
        const belowFloor = yield* makeAsync(() =>
          floorRepo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(belowFloor._tag).toBe('Left');
        if (belowFloor._tag === 'Left') {
          expect(belowFloor.left.code).toBe(
            'service-frontend-archive-state-required',
          );
        }

        const missingKey = {
          ...floorKey,
          generationId: 'gen_service_materialized_missing',
          userId: 'user_service_materialized_missing',
        };
        const missingRepo = yield* getServiceFrontendBlockRepo({
          key: missingKey,
        });
        yield* makeAsync(() =>
          missingRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          missingRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: missingKey.serviceName,
                userId: missingKey.userId,
                frontendName: missingKey.frontendName,
                frontendIndex: 1,
                lastServiceCursor: 'svcur_service_materialized_missing',
                delta: {
                  inserted: [
                    {
                      id: 'prd_service_materialized_missing',
                      modelName: 'product',
                      version: '1.0.0',
                      name: 'missing',
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceFrontendBlockRepo,
            repo: ServiceFrontendBlockRepo,
            key: missingKey,
            fn: ({ state }) => {
              state.storage.sql.exec(
                `DELETE FROM serviceFrontendResourceMaterializations
                 WHERE frontendIndex = 1
                   AND deltaKind = 'inserted'
                   AND canonicalOrdinal = 0
                   AND modelName = 'product'
                   AND modelVersion = '1.0.0'`,
              );
            },
          }),
        );
        const missing = yield* makeAsync(() =>
          missingRepo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(missing._tag).toBe('Left');
        if (missing._tag === 'Left') {
          expect(missing.left.code).toBe(
            'service-frontend-archive-state-required',
          );
        }

        const corruptKey = {
          ...floorKey,
          generationId: 'gen_service_materialized_corrupt',
          userId: 'user_service_materialized_corrupt',
        };
        const corruptRepo = yield* getServiceFrontendBlockRepo({
          key: corruptKey,
        });
        yield* makeAsync(() =>
          corruptRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          corruptRepo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: corruptKey.serviceName,
                userId: corruptKey.userId,
                frontendName: corruptKey.frontendName,
                frontendIndex: 1,
                lastServiceCursor: 'svcur_service_materialized_corrupt',
                delta: {
                  inserted: [
                    {
                      id: 'prd_service_materialized_corrupt',
                      modelName: 'product',
                      version: '1.0.0',
                      name: 'corrupt',
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getServiceFrontendBlockRepo,
            repo: ServiceFrontendBlockRepo,
            key: corruptKey,
            fn: ({ state }) => {
              state.storage.sql.exec(
                `UPDATE serviceFrontendResourceMaterializations
                 SET canonicalResourceBytes = '{}'
                 WHERE frontendIndex = 1
                   AND deltaKind = 'inserted'
                   AND canonicalOrdinal = 0
                   AND modelName = 'product'
                   AND modelVersion = '1.0.0'`,
              );
            },
          }),
        );
        const corrupt = yield* makeAsync(() =>
          corruptRepo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(corrupt._tag).toBe('Left');
        if (corrupt._tag === 'Left') {
          expect(corrupt.left.code).toBe(
            'service-frontend-archive-state-required',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'uses persisted shaping for live delivery without a second runtime adaptation',
    () =>
      Effect.gen(function* () {
        adaptFrontendResource.mockImplementation(props =>
          Effect.succeed({
            modelName: props.resource.modelName,
            resource: {
              ...props.resource,
              createdAt: props.resource.createdAt.toISOString(),
              updatedAt: props.resource.updatedAt.toISOString(),
              deletedAt:
                props.resource.deletedAt === null ||
                props.resource.deletedAt === undefined
                  ? props.resource.deletedAt
                  : props.resource.deletedAt.toISOString(),
            },
          }),
        );
        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }
        const key = {
          generationId: 'gen_service_materialized_live',
          serviceName: 'app',
          userId: 'user_service_materialized_live',
          frontendName: 'products',
        };
        const repo = yield* getServiceFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const sent: string[] = [];
        const close = vi.fn();
        yield* Effect.promise(() =>
          runInDurableObject(repo, instance => {
            Reflect.set(instance, 'getConnections', () => [
              {
                state: {
                  phase: 'live',
                  serviceName: key.serviceName,
                  userId: key.userId,
                  frontendName: key.frontendName,
                  serviceFrontendLock,
                },
                send(message: unknown) {
                  sent.push(String(message));
                },
                close,
              },
            ]);
          }),
        );
        adaptFrontendResource.mockClear();
        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: key.serviceName,
                userId: key.userId,
                frontendName: key.frontendName,
                frontendIndex: 1,
                lastServiceCursor: 'svcur_service_materialized_live',
                delta: {
                  inserted: [
                    {
                      id: 'prd_service_materialized_live',
                      modelName: 'product',
                      version: '1.0.0',
                      name: 'live',
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(adaptFrontendResource).toHaveBeenCalledTimes(1);
        expect(sent.map(message => JSON.parse(message))).toEqual([
          {
            type: 'serviceFrontendBlock',
            sync: expect.objectContaining({
              frontendIndex: 1,
              delta: {
                inserted: [
                  expect.objectContaining({
                    modelName: 'product',
                    version: '1.0.0',
                    name: 'live',
                  }),
                ],
                updated: [],
                deleted: [],
              },
            }),
          },
        ]);
        expect(close).not.toHaveBeenCalled();
      }).pipe(Effect.provide(AsyncLive)),
  );
});
