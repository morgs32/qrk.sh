import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { systemWorkerAbbreviations } from './systemWorkerAbbreviations.js';
import { prepareGenerationStateFixture } from './workerd-utils/prepareGenerationStateFixture.js';

describe('RepoExplorer', () => {
  it.effect(
    'enumerates generation-qualified rows from the singleton SystemRepo',
    () =>
      Effect.gen(function* () {
        const active = yield* prepareGenerationStateFixture({
          clean: false,
          workerVersionId: 'repo-explorer-active',
        });
        const otherGenerationId = 'gen_repo_explorer_other';
        const serviceRepo = yield* getServiceRepo({
          key: {
            generationId: active.generationId,
            serviceName: 'app',
          },
        });
        const otherServiceRepo = yield* getServiceRepo({
          key: {
            generationId: otherGenerationId,
            serviceName: 'app',
          },
        });
        const productTable = yield* makeAsync(() =>
          serviceRepo.getRepoTableRows({ tableName: 'product' }),
        ).pipe(Effect.flatMap(decodeRpc));
        yield* makeAsync(() =>
          otherServiceRepo.getRepoTableRows({ tableName: 'product' }),
        ).pipe(Effect.flatMap(decodeRpc));

        const systemRepo = SystemRepo.getRepo({
          systemId: env.ZEROSPIN_SYSTEM_ID,
        });
        const openedSystemRepoName = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => state.id.name),
        );
        expect(openedSystemRepoName).toBe(env.ZEROSPIN_SYSTEM_ID);

        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: active.generationId,
            repoType: 'ServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const otherRegistrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: otherGenerationId,
            repoType: 'ServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const systemRegistrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            generationId: active.generationId,
            repoType: 'SystemRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        expect(registrations).toEqual([
          expect.objectContaining({
            generationId: active.generationId,
            repoType: 'ServiceRepo',
            repoName: `${systemWorkerAbbreviations.serviceRepo}_${active.generationId}/app`,
            tableNames: expect.arrayContaining([
              'catalogSettings',
              'product',
              'serviceCommandOutcomes',
              'serviceBlockOutbox',
              'serviceReplayReceipts',
            ]),
          }),
        ]);
        expect(otherRegistrations).toEqual([
          expect.objectContaining({
            generationId: otherGenerationId,
            repoName: `${systemWorkerAbbreviations.serviceRepo}_${otherGenerationId}/app`,
          }),
        ]);
        expect(systemRegistrations).toEqual([
          expect.objectContaining({
            generationId: active.generationId,
            repoType: 'SystemRepo',
            repoName: env.ZEROSPIN_SYSTEM_ID,
            tableNames: expect.arrayContaining([
              'deploy',
              'generationState',
              'repos',
            ]),
          }),
        ]);

        const activeRepoRows = yield* makeAsync(() =>
          systemRepo.getRepoTableRows({
            generationId: active.generationId,
            tableName: 'repos',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(activeRepoRows.rows.length).toBeGreaterThan(0);
        expect(
          activeRepoRows.rows.every(
            row => row.generationId === active.generationId,
          ),
        ).toBe(true);
        expect(
          activeRepoRows.rows.some(
            row => row.generationId === otherGenerationId,
          ),
        ).toBe(false);

        expect(productTable.columns.map(column => column.name)).toEqual([
          'id',
          'modelName',
          'createdAt',
          'updatedAt',
          'version',
          'deletedAt',
          'name',
        ]);
        expect(productTable.rows).toEqual([]);
        const missingTable = yield* makeAsync(() =>
          serviceRepo.getRepoTableRows({ tableName: 'sqlite_master' }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.either);
        expect(missingTable._tag).toBe('Left');
      }).pipe(Effect.provide(AsyncLive)),
  );
});
