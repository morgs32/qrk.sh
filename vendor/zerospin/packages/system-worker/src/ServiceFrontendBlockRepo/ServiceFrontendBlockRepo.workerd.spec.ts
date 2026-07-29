import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ServiceFrontendLineageBlockSchema } from '@zerospin/core/serviceSession/ServiceFrontendBlockSchema';
import type { IServiceFrontendLineageBlock } from '@zerospin/core/serviceSession/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { runInDurableObject } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { getServiceFrontendBlockRepo } from './getServiceFrontendBlockRepo/getServiceFrontendBlockRepo.js';

describe('ServiceFrontendBlockRepo', () => {
  it.effect(
    'stores a strict contiguous archive with identical-only retries',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_archive',
          serviceName: 'catalog',
          actorName: 'member',
          actorId: 'actr_service_frontend_archive',
          frontendName: 'memberFrontend',
        };
        const repo = yield* getServiceFrontendBlockRepo({ key });

        // 1 — immutable root lineage is installed before any append.
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const firstBlock: IServiceFrontendLineageBlock = {
          kind: 'service-frontend',
          systemId: 'sys_local',
          generationId: key.generationId,
          serviceName: key.serviceName,
          actorName: key.actorName,
          actorId: key.actorId,
          frontendName: key.frontendName,
          frontendBlock: {
            serviceName: key.serviceName,
            actorName: key.actorName,
            actorId: key.actorId,
            frontendName: key.frontendName,
            frontendIndex: 1,
            lastServiceCursor: 'svcur_service_frontend_archive_1',
            delta: { inserted: [], updated: [], deleted: [] },
          },
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
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(archivedBlocks).toEqual([firstBlock]);

        // 3 — the same index with different canonical bytes is corruption.
        const conflictingBlock: IServiceFrontendLineageBlock = {
          ...firstBlock,
          frontendBlock: {
            ...firstBlock.frontendBlock,
            lastServiceCursor: 'svcur_service_frontend_archive_conflict',
          },
        };
        const conflictingDuplicate = yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [conflictingBlock] }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(conflictingDuplicate._tag).toBe('Left');
        if (conflictingDuplicate._tag === 'Left') {
          expect(conflictingDuplicate.left.code).toBe(
            'drizzle-transaction-failed',
          );
        }

        // 4 — a new physical row cannot skip an index.
        const gapBlock: IServiceFrontendLineageBlock = {
          ...firstBlock,
          frontendBlock: {
            ...firstBlock.frontendBlock,
            frontendIndex: 3,
            lastServiceCursor: 'svcur_service_frontend_archive_3',
          },
        };
        const gap = yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [gapBlock] }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(gap._tag).toBe('Left');
        if (gap._tag === 'Left') {
          expect(gap.left.code).toBe('drizzle-transaction-failed');
        }
        const unchangedArchiveBound = yield* makeAsync(() =>
          repo.getArchiveBound(),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(unchangedArchiveBound.frontendIndex).toBe(1);
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'rejects a predecessor repo name for a different logical target before insertion',
    () =>
      Effect.gen(function* () {
        const key = {
          generationId: 'gen_service_frontend_predecessor_successor',
          serviceName: 'catalog',
          actorName: 'member',
          actorId: 'actr_service_frontend_predecessor',
          frontendName: 'memberFrontend',
        };
        const repo = yield* getServiceFrontendBlockRepo({ key });
        const rejected = yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: {
              generationId: 'gen_service_frontend_predecessor_source',
              repoName:
                'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/member/actr_wrong/memberFrontend',
              terminalFrontendIndex: 3,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(rejected._tag).toBe('Left');
        if (rejected._tag === 'Left') {
          expect(rejected.left.code).toBe(
            'service-frontend-predecessor-target-mismatch',
          );
        }

        // The rejected descriptor did not become the immutable first write;
        // the exact same logical target can still install its valid pointer.
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: {
              generationId: 'gen_service_frontend_predecessor_source',
              repoName:
                'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/member/actr_service_frontend_predecessor/memberFrontend',
              terminalFrontendIndex: 3,
            },
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const stored = yield* makeAsync(() => repo.getPredecessor()).pipe(
          Effect.flatMap(decodeRpc),
        );
        expect(stored.predecessor).toEqual({
          generationId: 'gen_service_frontend_predecessor_source',
          repoName:
            'svcfrtbrepo_gen_service_frontend_predecessor_source/catalog/member/actr_service_frontend_predecessor/memberFrontend',
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
          serviceName: 'catalog',
          actorName: 'member',
          actorId: 'actr_service_frontend_archive_readiness',
          frontendName: 'memberFrontend',
        };
        const repo = yield* getServiceFrontendBlockRepo({ key });
        yield* makeAsync(() =>
          repo.recordPredecessor({
            systemId: 'sys_local',
            predecessor: null,
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const firstBlock: IServiceFrontendLineageBlock = {
          kind: 'service-frontend',
          systemId: 'sys_local',
          generationId: key.generationId,
          serviceName: key.serviceName,
          actorName: key.actorName,
          actorId: key.actorId,
          frontendName: key.frontendName,
          frontendBlock: {
            serviceName: key.serviceName,
            actorName: key.actorName,
            actorId: key.actorId,
            frontendName: key.frontendName,
            frontendIndex: 1,
            lastServiceCursor: 'svcur_service_frontend_archive_readiness_1',
            delta: { inserted: [], updated: [], deleted: [] },
          },
        };
        yield* makeAsync(() =>
          repo.storeServiceFrontendBlocks({ blocks: [firstBlock] }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          repo.assertArchiveThrough({ frontendIndex: 1 }),
        ).pipe(Effect.flatMap(decodeRpc));

        const mismatchedBlock: IServiceFrontendLineageBlock = {
          ...firstBlock,
          actorName: 'differentActor',
        };
        const mismatchedCanonicalBytes = yield* Schema.encode(
          Schema.parseJson(ServiceFrontendLineageBlockSchema),
        )(mismatchedBlock);
        yield* Effect.promise(() =>
          runInDurableObject(repo, (_instance, state) => {
            state.storage.sql.exec(
              `UPDATE serviceFrontendBlocks
               SET canonicalBytes = ?, lineageBlock = ?
               WHERE frontendIndex = ?`,
              mismatchedCanonicalBytes,
              mismatchedCanonicalBytes,
              1,
            );
          }),
        );

        const readiness = yield* makeAsync(() =>
          repo.assertArchiveThrough({ frontendIndex: 1 }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(readiness._tag).toBe('Left');
        if (readiness._tag === 'Left') {
          expect(readiness.left.code).toBe(
            'service-frontend-archive-target-mismatch',
          );
        }
      }).pipe(Effect.provide(AsyncLive)),
  );
});
