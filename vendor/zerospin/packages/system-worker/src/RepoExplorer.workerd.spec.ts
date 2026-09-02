import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { getMaterializedServiceRepo } from './MaterializedServiceRepo/getMaterializedServiceRepo/getMaterializedServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';

describe('RepoExplorer', () => {
  it.effect(
    'enumerates static repo registrations from the singleton SystemRepo',
    () =>
      Effect.gen(function* () {
        const serviceRepo = yield* getMaterializedServiceRepo({
          key: {
            systemId: env.ZEROSPIN_SYSTEM_ID,
            serviceName: 'app',
          },
        });
        const productTable = yield* makeAsync(() =>
          serviceRepo.getRepoTableRows({
            tableName: 'product',
          }),
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
            repoType: 'MaterializedServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(registrations).toEqual([
          expect.objectContaining({
            repoType: 'MaterializedServiceRepo',
            repoName: 'matsvcrepo_sys_local/app',
            tableNames: expect.arrayContaining([
              'catalogSettings',
              'product',
              'executionClaims',
              'materializationState',
            ]),
          }),
        ]);
        const repoRows = yield* makeAsync(() =>
          systemRepo.getRepoTableRows({
            tableName: 'repos',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(repoRows.rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              repoName: 'matsvcrepo_sys_local/app',
              repoType: 'MaterializedServiceRepo',
            }),
          ]),
        );

        expect(productTable.columns.map(column => column.name)).toEqual([
          'id',
          'modelName',
          'createdAt',
          'updatedAt',
          'version',
          'name',
        ]);
        expect(productTable.rows).toEqual([]);
        const missingTable = yield* makeAsync(() =>
          serviceRepo.getRepoTableRows({
            tableName: 'sqlite_master',
          }),
        ).pipe(Effect.flatMap(decodeRpc), Effect.result);
        expect(missingTable._tag).toBe('Failure');
      }).pipe(Effect.provide(AsyncLive)),
  );
});
