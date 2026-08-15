import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import type { IAggregateFrontendBlock } from '@zerospin/core/session/types';
import { makeSystemSpec } from '@zerospin/core/system/makeSystemSpec';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRight } from '@zerospin/core/utils/encodeRight';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect, vi } from 'vitest';

import { main, system } from '../fixtures/system.js';
import { managedRuntime } from '../managedRuntime.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { AggregateFrontendBlockRepo } from './AggregateFrontendBlockRepo.js';
import { getAggregateFrontendBlockRepo } from './getAggregateFrontendBlockRepo/getAggregateFrontendBlockRepo.js';
import { onMessage } from './onMessage/onMessage.js';

const { adaptFrontendResource, getSystemRepo, registerRepo } = vi.hoisted(
  () => ({
    adaptFrontendResource: vi.fn(),
    getSystemRepo: vi.fn(),
    registerRepo: vi.fn(),
  }),
);

vi.mock('../SystemRepo/SystemRepo.js', () => ({
  SystemRepo: { getRepo: getSystemRepo },
}));

vi.mock(
  '../StaticSystem/adaptFrontendResource/adaptFrontendResource.js',
  () => ({
    adaptFrontendResource,
  }),
);

describe('AggregateFrontendBlockRepo frontend lock delivery', () => {
  it.effect(
    'closes replaying sockets before broadcast while leaving awaiting-resume sockets idle',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_delivery_replay_race',
          aggregateId: 'acct_frontend_delivery_replay_race',
          aggregateName: main.aggregateName,
          userId: 'user_frontend_delivery_replay_race',
          frontendName: main.frontendName,
        };
        registerRepo.mockResolvedValue(encodeRight(undefined));
        getSystemRepo.mockReturnValue({ registerRepo });
        const repo = yield* getAggregateFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const aggregateFrontendLock =
          makeFrontendControllerSpec(main).aggregateFrontendLock;
        const replayingSend = vi.fn();
        const replayingClose = vi.fn();
        const awaitingResumeSend = vi.fn();
        const awaitingResumeClose = vi.fn();
        yield* Effect.promise(() =>
          runInDurableObject(repo, instance => {
            Reflect.set(instance, 'getConnections', () => [
              {
                state: {
                  phase: 'replaying',
                  aggregateId: key.aggregateId,
                  aggregateName: key.aggregateName,
                  userId: key.userId,
                  frontendName: key.frontendName,
                  aggregateFrontendLock,
                },
                send: replayingSend,
                close: replayingClose,
              },
              {
                state: {
                  phase: 'awaiting-resume',
                  aggregateId: key.aggregateId,
                  aggregateName: key.aggregateName,
                  userId: key.userId,
                  frontendName: key.frontendName,
                  aggregateFrontendLock,
                },
                send: awaitingResumeSend,
                close: awaitingResumeClose,
              },
            ]);
          }),
        );

        yield* makeAsync(() =>
          repo.storeAggregateFrontendBlocks({
            blocks: [
              {
                frontendName: key.frontendName,
                lastAggregateCursor: 'acur_frontend_delivery_replay_race',
                frontendIndex: 1,
                delta: { inserted: [], updated: [], deleted: [] },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(replayingSend).not.toHaveBeenCalled();
        expect(replayingClose).toHaveBeenCalledTimes(1);
        expect(replayingClose).toHaveBeenCalledWith(
          1012,
          'aggregate-frontend-delivery-replay-raced',
        );
        expect(awaitingResumeSend).not.toHaveBeenCalled();
        expect(awaitingResumeClose).not.toHaveBeenCalled();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'omits a model outside the bound lock and still advances through an empty block',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_frontend_exact_lock_delivery',
          aggregateId: 'acct_frontend_exact_lock_delivery',
          aggregateName: main.aggregateName,
          userId: 'user_frontend_exact_lock_delivery',
          frontendName: main.frontendName,
        };
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
        registerRepo.mockResolvedValue(encodeRight(undefined));
        getSystemRepo.mockReturnValue({ registerRepo });
        const repo = yield* getAggregateFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const canonicalBlock: IAggregateFrontendBlock = {
          frontendName: key.frontendName,
          lastAggregateCursor: 'acur_frontend_exact_lock_delivery_1',
          frontendIndex: 1,
          delta: {
            inserted: [
              {
                id: 'stk_frontend_exact_lock_delivery',
                modelName: 'stock',
                quantity: 7,
                version: '1.0.0',
                createdAt: new Date(1),
                updatedAt: new Date(1),
                deletedAt: null,
              },
            ],
            updated: [],
            deleted: [
              {
                id: 'stk_frontend_exact_lock_delivery_deleted',
                modelName: 'stock',
              },
            ],
          },
          pendingPushedCommands: [],
          executedPushedCommands: [],
          failedPushedCommands: [],
        };
        yield* makeAsync(() =>
          repo.storeAggregateFrontendBlocks({ blocks: [canonicalBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));
        adaptFrontendResource.mockClear();

        const completeLock =
          makeFrontendControllerSpec(main).aggregateFrontendLock;
        const { stock: _excludedModel, ...models } = completeLock.models;
        const boundLock = {
          ...completeLock,
          models,
        };
        const shapedBlocks = yield* makeAsync(() =>
          repo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            aggregateFrontendLock: boundLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(shapedBlocks[0]?.delta).toEqual({
          inserted: [],
          updated: [],
          deleted: [],
        });
        const sent: string[] = [];
        let connectionState: {
          phase: 'awaiting-resume' | 'replaying' | 'live';
          aggregateId: string;
          aggregateName: string;
          userId: string;
          frontendName: string;
          aggregateFrontendLock: typeof boundLock;
        } = {
          phase: 'awaiting-resume',
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          userId: key.userId,
          frontendName: key.frontendName,
          aggregateFrontendLock: boundLock,
        };

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendBlockRepo,
            repo: AggregateFrontendBlockRepo,
            key,
            fn: ({ db }) =>
              managedRuntime.runPromise(
                Reflect.apply(onMessage, undefined, [
                  {
                    connection: {
                      get state() {
                        return connectionState;
                      },
                      setState(next: typeof connectionState) {
                        connectionState = next;
                      },
                      send(message: unknown) {
                        sent.push(String(message));
                      },
                      close: vi.fn(),
                    },
                    message: JSON.stringify({
                      frontendIndex: 0,
                    }),
                    db,
                    key,
                    parseRepoName: () => Effect.die('unused'),
                    getPredecessorRepo: () => ({
                      getPredecessor: vi.fn(),
                      getArchivedBlocks: vi.fn(),
                    }),
                  },
                ]),
              ),
          }),
        );

        const messages = sent.map(message => JSON.parse(message));
        const delivered = messages.find(
          message => message.type === 'aggregateFrontendBlock',
        );
        expect(delivered.sync.frontendIndex).toBe(1);
        expect(delivered.sync.delta).toEqual({
          inserted: [],
          updated: [],
          deleted: [],
        });
        expect(messages).toContainEqual({
          type: 'replay-complete',
          frontendIndex: 1,
        });
        expect(connectionState.phase).toBe('live');
        expect(adaptFrontendResource).not.toHaveBeenCalled();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'replays one continuous index across root, intermediate, and active archive segments without a promotion block',
    () =>
      Effect.gen(function* () {
        const rootKey = {
          generationId: 'gen_frontend_continuous_replay_root',
          aggregateId: 'acct_frontend_continuous_replay',
          aggregateName: main.aggregateName,
          userId: 'user_frontend_continuous_replay',
          frontendName: main.frontendName,
        };
        const intermediateKey = {
          ...rootKey,
          generationId: 'gen_frontend_continuous_replay_intermediate',
        };
        const activeKey = {
          ...rootKey,
          generationId: 'gen_frontend_continuous_replay_active',
        };
        const materializationSystemSpec = makeSystemSpec({ system });
        const stockModel =
          materializationSystemSpec.aggregates.user?.frontends.main?.controller
            .models.stock;
        if (stockModel === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture stock frontend model'),
          );
        }
        stockModel.version = '3.0.0';
        stockModel.historicalDefinitions = [
          {
            modelName: stockModel.modelName,
            abbreviation: stockModel.abbreviation,
            version: '1.0.0',
            hasDirectAdapter: true,
            properties: stockModel.properties,
            indexes: stockModel.indexes,
          },
          {
            modelName: stockModel.modelName,
            abbreviation: stockModel.abbreviation,
            version: '2.0.0',
            hasDirectAdapter: true,
            properties: stockModel.properties,
            indexes: stockModel.indexes,
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
                quantity: Number(props.resource.quantityV3),
              },
            });
          }
          if (props.modelVersion === '2.0.0') {
            return Effect.succeed({
              modelName: props.resource.modelName,
              resource: {
                ...resource,
                version: '2.0.0',
                quantityText: String(props.resource.quantityV3),
              },
            });
          }
          return Effect.succeed({
            modelName: props.resource.modelName,
            resource: {
              ...resource,
              version: '3.0.0',
              quantityV3: props.resource.quantityV3,
            },
          });
        });
        const rootRepo = yield* getAggregateFrontendBlockRepo({ key: rootKey });
        const intermediateRepo = yield* getAggregateFrontendBlockRepo({
          key: intermediateKey,
        });
        const activeRepo = yield* getAggregateFrontendBlockRepo({
          key: activeKey,
        });
        const rootRepoName =
          yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
            rootKey,
          );
        const intermediateRepoName =
          yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
            intermediateKey,
          );

        yield* makeAsync(() =>
          rootRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          rootRepo.storeAggregateFrontendBlocks({
            blocks: [
              {
                frontendName: rootKey.frontendName,
                lastAggregateCursor: 'acur_frontend_continuous_replay_1',
                frontendIndex: 1,
                delta: {
                  inserted: [
                    {
                      id: 'stk_frontend_continuous_replay',
                      modelName: 'stock',
                      version: '3.0.0',
                      quantityV3: 1,
                      createdAt: new Date(1),
                      updatedAt: new Date(1),
                      deletedAt: null,
                    },
                  ],
                  updated: [],
                  deleted: [],
                },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
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
          intermediateRepo.storeAggregateFrontendBlocks({
            blocks: [
              {
                frontendName: intermediateKey.frontendName,
                lastAggregateCursor: 'acur_frontend_continuous_replay_2',
                frontendIndex: 2,
                delta: {
                  inserted: [],
                  updated: [
                    {
                      id: 'stk_frontend_continuous_replay',
                      modelName: 'stock',
                      version: '3.0.0',
                      quantityV3: 2,
                      createdAt: new Date(1),
                      updatedAt: new Date(2),
                      deletedAt: null,
                    },
                  ],
                  deleted: [],
                },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
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
          activeRepo.storeAggregateFrontendBlocks({
            blocks: [
              {
                frontendName: activeKey.frontendName,
                lastAggregateCursor: 'acur_frontend_continuous_replay_3',
                frontendIndex: 3,
                delta: {
                  inserted: [],
                  updated: [
                    {
                      id: 'stk_frontend_continuous_replay',
                      modelName: 'stock',
                      version: '3.0.0',
                      quantityV3: 3,
                      createdAt: new Date(1),
                      updatedAt: new Date(3),
                      deletedAt: null,
                    },
                  ],
                  deleted: [],
                },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        adaptFrontendResource.mockClear();
        const sent: string[] = [];
        const close = vi.fn();
        const aggregateFrontendLock =
          makeFrontendControllerSpec(main).aggregateFrontendLock;
        let connectionState: {
          phase: 'awaiting-resume' | 'replaying' | 'live';
          aggregateId: string;
          aggregateName: string;
          userId: string;
          frontendName: string;
          aggregateFrontendLock: typeof aggregateFrontendLock;
        } = {
          phase: 'awaiting-resume',
          aggregateId: activeKey.aggregateId,
          aggregateName: activeKey.aggregateName,
          userId: activeKey.userId,
          frontendName: activeKey.frontendName,
          aggregateFrontendLock,
        };

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendBlockRepo,
            repo: AggregateFrontendBlockRepo,
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
                    AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
                      repoName,
                    ),
                  getPredecessorRepo: repoName =>
                    env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(repoName),
                }),
              ),
          }),
        );

        const messages = sent.map(message => JSON.parse(message));
        const blocks = messages.filter(
          message => message.type === 'aggregateFrontendBlock',
        );
        expect(blocks.map(message => message.sync.frontendIndex)).toEqual([
          1, 2, 3,
        ]);
        expect(blocks[0]?.sync.delta.inserted[0]).toMatchObject({
          modelName: 'stock',
          version: '1.0.0',
          quantity: 1,
        });
        expect(blocks[1]?.sync.delta.updated[0]).toMatchObject({
          modelName: 'stock',
          version: '1.0.0',
          quantity: 2,
        });
        expect(blocks[2]?.sync.delta.updated[0]).toMatchObject({
          modelName: 'stock',
          version: '1.0.0',
          quantity: 3,
        });
        const activeV3Decode = yield* Schema.decodeUnknown(
          Schema.Struct({
            id: Schema.String,
            modelName: Schema.Literal('stock'),
            version: Schema.Literal('3.0.0'),
            quantityV3: Schema.Number,
            createdAt: Schema.String,
            updatedAt: Schema.String,
            deletedAt: Schema.Null,
          }),
        )(blocks[0]?.sync.delta.inserted[0], {
          onExcessProperty: 'error',
        }).pipe(Effect.either);
        expect(activeV3Decode._tag).toBe('Left');
        for (const block of blocks) {
          expect(Object.hasOwn(block.sync, 'kind')).toBe(false);
          expect(Object.hasOwn(block.sync, 'generationId')).toBe(false);
        }
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
    'accepts only an index resume and returns state-required for broken archive history',
    () =>
      Effect.gen(function* () {
        const strictKey = {
          generationId: 'gen_frontend_continuous_resume_strict',
          aggregateId: 'acct_frontend_continuous_resume_strict',
          aggregateName: main.aggregateName,
          userId: 'user_frontend_continuous_resume_strict',
          frontendName: main.frontendName,
        };
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
        const strictRepo = yield* getAggregateFrontendBlockRepo({
          key: strictKey,
        });
        yield* makeAsync(() =>
          strictRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          strictRepo.storeAggregateFrontendBlocks({
            blocks: [
              {
                frontendName: strictKey.frontendName,
                lastAggregateCursor: 'acur_frontend_continuous_resume_strict',
                frontendIndex: 1,
                delta: { inserted: [], updated: [], deleted: [] },
                pendingPushedCommands: [],
                executedPushedCommands: [],
                failedPushedCommands: [],
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const strictSent: string[] = [];
        const strictClose = vi.fn();
        const strictAggregateFrontendLock =
          makeFrontendControllerSpec(main).aggregateFrontendLock;
        const strictState: {
          phase: 'awaiting-resume' | 'replaying' | 'live';
          aggregateId: string;
          aggregateName: string;
          userId: string;
          frontendName: string;
          aggregateFrontendLock: typeof strictAggregateFrontendLock;
        } = {
          phase: 'awaiting-resume',
          aggregateId: strictKey.aggregateId,
          aggregateName: strictKey.aggregateName,
          userId: strictKey.userId,
          frontendName: strictKey.frontendName,
          aggregateFrontendLock: strictAggregateFrontendLock,
        };
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendBlockRepo,
            repo: AggregateFrontendBlockRepo,
            key: strictKey,
            fn: ({ db }) =>
              managedRuntime.runPromise(
                onMessage({
                  connection: {
                    state: strictState,
                    setState: vi.fn(),
                    send(message: unknown) {
                      strictSent.push(String(message));
                    },
                    close: strictClose,
                  },
                  message: JSON.stringify({
                    frontendIndex: 0,
                    generationId: strictKey.generationId,
                  }),
                  db,
                  key: strictKey,
                  parseRepoName: repoName =>
                    AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
                      repoName,
                    ),
                  getPredecessorRepo: repoName =>
                    env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(repoName),
                }),
              ),
          }),
        );
        expect(strictSent.map(message => JSON.parse(message))).toEqual([
          { type: 'state-required' },
        ]);
        expect(strictClose).toHaveBeenCalledWith(4003, 'state-required');

        const missingRootKey = {
          ...strictKey,
          generationId: 'gen_frontend_continuous_resume_missing_root',
          aggregateId: 'acct_frontend_continuous_resume_missing',
          userId: 'user_frontend_continuous_resume_missing',
        };
        const missingActiveKey = {
          ...missingRootKey,
          generationId: 'gen_frontend_continuous_resume_missing_active',
        };
        const missingRootRepo = yield* getAggregateFrontendBlockRepo({
          key: missingRootKey,
        });
        const missingActiveRepo = yield* getAggregateFrontendBlockRepo({
          key: missingActiveKey,
        });
        const missingRootRepoName =
          yield* AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.makeName(
            missingRootKey,
          );
        yield* makeAsync(() =>
          missingRootRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          missingActiveRepo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: {
              generationId: missingRootKey.generationId,
              repoName: missingRootRepoName,
              terminalFrontendIndex: 1,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const missingSent: string[] = [];
        const missingClose = vi.fn();
        const missingAggregateFrontendLock =
          makeFrontendControllerSpec(main).aggregateFrontendLock;
        const missingState: {
          phase: 'awaiting-resume' | 'replaying' | 'live';
          aggregateId: string;
          aggregateName: string;
          userId: string;
          frontendName: string;
          aggregateFrontendLock: typeof missingAggregateFrontendLock;
        } = {
          phase: 'awaiting-resume',
          aggregateId: missingActiveKey.aggregateId,
          aggregateName: missingActiveKey.aggregateName,
          userId: missingActiveKey.userId,
          frontendName: missingActiveKey.frontendName,
          aggregateFrontendLock: missingAggregateFrontendLock,
        };
        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getAggregateFrontendBlockRepo,
            repo: AggregateFrontendBlockRepo,
            key: missingActiveKey,
            fn: ({ db }) =>
              managedRuntime.runPromise(
                onMessage({
                  connection: {
                    state: missingState,
                    setState: vi.fn(),
                    send(message: unknown) {
                      missingSent.push(String(message));
                    },
                    close: missingClose,
                  },
                  message: JSON.stringify({ frontendIndex: 0 }),
                  db,
                  key: missingActiveKey,
                  parseRepoName: repoName =>
                    AggregateFrontendBlockRepo.boundDORepoConfig.nameUtils.parseName(
                      repoName,
                    ),
                  getPredecessorRepo: repoName =>
                    env.AGGREGATE_FRONTEND_BLOCK_REPO.getByName(repoName),
                }),
              ),
          }),
        );
        expect(missingSent.map(message => JSON.parse(message))).toEqual([
          { type: 'state-required' },
        ]);
        expect(missingClose).toHaveBeenCalledWith(4003, 'state-required');
      }).pipe(Effect.provide(AsyncLive)),
  );
});
