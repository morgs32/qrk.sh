import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ServiceFrontendBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendBlock } from '@zerospin/core/serviceSession/types';
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

describe('ServiceFrontendBlockRepo', () => {
  it.effect(
    'closes replaying sockets before broadcast while leaving awaiting-resume sockets idle',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_delivery_replay_race',
          serviceName: 'app',
          userId: 'user_service_frontend_delivery_replay_race',
          frontendName: 'products',
        };
        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }
        const repo = yield* getServiceFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

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
                  serviceName: key.serviceName,
                  userId: key.userId,
                  frontendName: key.frontendName,
                  serviceFrontendLock,
                },
                send: replayingSend,
                close: replayingClose,
              },
              {
                state: {
                  phase: 'awaiting-resume',
                  serviceName: key.serviceName,
                  userId: key.userId,
                  frontendName: key.frontendName,
                  serviceFrontendLock,
                },
                send: awaitingResumeSend,
                close: awaitingResumeClose,
              },
            ]);
          }),
        );

        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({
            blocks: [
              {
                serviceName: key.serviceName,
                userId: key.userId,
                frontendName: key.frontendName,
                frontendIndex: 1,
                lastServiceCursor:
                  'svcur_service_frontend_delivery_replay_race',
                delta: { inserted: [], updated: [], deleted: [] },
              },
            ],
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(replayingSend).not.toHaveBeenCalled();
        expect(replayingClose).toHaveBeenCalledTimes(1);
        expect(replayingClose).toHaveBeenCalledWith(
          1012,
          'service-frontend-delivery-replay-raced',
        );
        expect(awaitingResumeSend).not.toHaveBeenCalled();
        expect(awaitingResumeClose).not.toHaveBeenCalled();
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'stores a strict contiguous archive with identical-only retries',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_archive',
          serviceName: 'app',
          userId: 'user_service_frontend_archive',
          frontendName: 'products',
        };
        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }
        const repo = yield* getServiceFrontendBlockRepo({ key });

        // 1 — immutable root lineage is installed before any append.
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const firstBlock: IServiceFrontendBlock = {
          serviceName: key.serviceName,
          userId: key.userId,
          frontendName: key.frontendName,
          frontendIndex: 1,
          lastServiceCursor: 'svcur_service_frontend_archive_1',
          delta: { inserted: [], updated: [], deleted: [] },
        };

        // 2 — an exact duplicate succeeds without creating a second row.
        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [firstBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [firstBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));

        const archiveBound = yield* makeAsync(() =>
          repo.getArchiveBound(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(archiveBound).toEqual({
          generationId: key.generationId,
          frontendIndex: 1,
        });
        const archivedBlocks = yield* makeAsync(() =>
          repo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(archivedBlocks).toEqual([firstBlock]);

        // 3 — the same index with different canonical bytes is corruption.
        const conflictingBlock: IServiceFrontendBlock = {
          ...firstBlock,
          lastServiceCursor: 'svcur_service_frontend_archive_conflict',
        };
        const conflictingDuplicate = yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [conflictingBlock] }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(conflictingDuplicate._tag).toBe('Left');
        if (conflictingDuplicate._tag === 'Left') {
          expect(conflictingDuplicate.left.code).toBe(
            'service-frontend-archive-conflicting-duplicate',
          );
        }

        // 4 — a new physical row cannot skip an index.
        const gapBlock: IServiceFrontendBlock = {
          ...firstBlock,
          frontendIndex: 3,
          lastServiceCursor: 'svcur_service_frontend_archive_3',
        };
        const gap = yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [gapBlock] }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(gap._tag).toBe('Left');
        if (gap._tag === 'Left') {
          expect(gap.left.code).toBe('service-frontend-archive-index-gap');
        }
        const unchangedArchiveBound = yield* makeAsync(() =>
          repo.getArchiveBound(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(unchangedArchiveBound.frontendIndex).toBe(1);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect('keeps the first predecessor descriptor immutable', () =>
    Effect.gen(function* () {
      const key = {
        generationId: 'gen_service_frontend_predecessor_successor',
        serviceName: 'catalog',
        userId: 'user_service_frontend_predecessor',
        frontendName: 'memberFrontend',
      };
      const repo = yield* getServiceFrontendBlockRepo({ key });
      yield* makeAsync(() =>
        repo.recordPredecessor({
          systemId: 'sys_local',
          predecessor: {
            generationId: 'gen_service_frontend_predecessor_source',
            repoName:
              'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/user_service_frontend_predecessor/memberFrontend',
            terminalFrontendIndex: 3,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));

      const rejected = yield* makeAsync(() =>
        repo.recordPredecessor({
          systemId: 'sys_local',
          predecessor: {
            generationId: 'gen_service_frontend_predecessor_source',
            repoName:
              'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/user_wrong/memberFrontend',
            terminalFrontendIndex: 3,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc), Effect.either);
      expect(rejected._tag).toBe('Left');
      if (rejected._tag === 'Left') {
        expect(rejected.left.code).toBe('service-frontend-lineage-conflict');
      }

      const stored = yield* makeAsync(() => repo.getPredecessor()).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(stored).toMatchObject({
        systemId: 'sys_local',
        generationId: key.generationId,
        serviceName: key.serviceName,
        userId: key.userId,
        frontendName: key.frontendName,
        terminalFrontendIndex: 3,
      });
      expect(stored.predecessor).toEqual({
        generationId: 'gen_service_frontend_predecessor_source',
        repoName:
          'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/user_service_frontend_predecessor/memberFrontend',
        terminalFrontendIndex: 3,
      });
    }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'rejects canonically encoded archive corruption before readiness succeeds',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_archive_readiness',
          serviceName: 'app',
          userId: 'user_service_frontend_archive_readiness',
          frontendName: 'products',
        };
        const serviceFrontendLock = makeSystemSpec({ system }).services.app
          ?.frontends.products?.controller.serviceFrontendLock;
        if (serviceFrontendLock === undefined) {
          return yield* Effect.die(
            new Error('Expected the fixture service frontend lock'),
          );
        }
        const repo = yield* getServiceFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const firstBlock: IServiceFrontendBlock = {
          serviceName: key.serviceName,
          userId: key.userId,
          frontendName: key.frontendName,
          frontendIndex: 1,
          lastServiceCursor: 'svcur_service_frontend_archive_readiness_1',
          delta: { inserted: [], updated: [], deleted: [] },
        };
        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [firstBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          repo.assertArchiveThrough({ frontendIndex: 1 }),
        ).pipe(Effect.flatMap(decodeRpc));

        const mismatchedBlock: IServiceFrontendBlock = {
          ...firstBlock,
          serviceName: 'differentService',
        };
        const mismatchedCanonicalBytes = yield* Schema.encode(
          Schema.parseJson(ServiceFrontendBlockSchema),
        )(mismatchedBlock);
        yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => {
            state.storage.sql.exec(
              `UPDATE serviceFrontendBlocks
               SET canonicalBytes = ?, serviceFrontendBlock = ?
               WHERE frontendIndex = ?`,
              mismatchedCanonicalBytes,
              mismatchedCanonicalBytes,
              1,
            );
          }),
        );

        const readiness = yield* makeAsync(() =>
          repo.getArchivedBlocks({
            afterFrontendIndex: 0,
            throughFrontendIndex: 1,
            serviceFrontendLock,
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(readiness._tag).toBe('Left');
        if (readiness._tag === 'Left') {
          expect(readiness.left.code).toBe(
            'service-frontend-archive-target-mismatch',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'replays service blocks continuously across root, intermediate, and active archive segments',
    () =>
      Effect.gen(function* () {
        const rootKey = {
          generationId: 'gen_service_frontend_continuous_replay_root',
          serviceName: 'app',
          userId: 'user_service_frontend_continuous_replay',
          frontendName: 'products',
        };
        const intermediateKey = {
          ...rootKey,
          generationId: 'gen_service_frontend_continuous_replay_intermediate',
        };
        const activeKey = {
          ...rootKey,
          generationId: 'gen_service_frontend_continuous_replay_active',
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
                lastServiceCursor: 'svcur_service_frontend_continuous_replay_1',
                delta: { inserted: [], updated: [], deleted: [] },
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
                lastServiceCursor: 'svcur_service_frontend_continuous_replay_2',
                delta: { inserted: [], updated: [], deleted: [] },
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
                lastServiceCursor: 'svcur_service_frontend_continuous_replay_3',
                delta: { inserted: [], updated: [], deleted: [] },
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
      }).pipe(Effect.provide(AsyncLive)),
  );
});
