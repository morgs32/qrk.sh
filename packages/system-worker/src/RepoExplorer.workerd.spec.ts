/*
 * System-worker annotation:
 * Verifies Studio repo registration and safe table reads through real Durable Objects.
 */

import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { getServiceRepo } from './ServiceRepo/getServiceRepo/getServiceRepo.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';

describe('RepoExplorer', () => {
  it.effect('registers repos and reads only registered tables', () =>
    Effect.gen(function* () {
      const serviceRepo = yield* getServiceRepo({
        key: {
          generationId: 'gen_test',
          serviceName: 'app',
        },
      });
      const fixedSystemRepoName = `${coreAbbreviations.systemRepo}_gen_test`;
      const openedSystemRepoName = yield* Effect.promise(() =>
        runInDurableObject(
          env.SYSTEM_REPO.getByName(fixedSystemRepoName),
          (_instance, state) => state.id.name,
        ),
      );
      expect(openedSystemRepoName).toBe(fixedSystemRepoName);

      const productTable = yield* makeAsync(() =>
        serviceRepo.getRepoTableRows({ tableName: 'product' }),
      ).pipe(Effect.flatMap(decodeRpc));

      const otherServiceRepo = yield* getServiceRepo({
        key: {
          generationId: 'gen_other',
          serviceName: 'app',
        },
      });
      yield* makeAsync(() =>
        otherServiceRepo.getRepoTableRows({ tableName: 'product' }),
      ).pipe(Effect.flatMap(decodeRpc));

      const registrations = yield* makeAsync(() =>
        SystemRepo.getRepo({ generationId: 'gen_test' }).getRepoRegistrations({
          repoType: 'ServiceRepo',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const systemRepoRegistrations = yield* makeAsync(() =>
        SystemRepo.getRepo({ generationId: 'gen_test' }).getRepoRegistrations({
          repoType: 'SystemRepo',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const otherRegistrations = yield* makeAsync(() =>
        SystemRepo.getRepo({
          generationId: 'gen_other',
        }).getRepoRegistrations({ repoType: 'ServiceRepo' }),
      ).pipe(Effect.flatMap(decodeRpc));

      expect(registrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repoType: 'ServiceRepo',
            repoName: `${coreAbbreviations.serviceRepo}_gen_test/app`,
            tableNames: expect.arrayContaining([
              'product',
              'serviceCursors',
              'serviceBlockOutbox',
            ]),
          }),
        ]),
      );
      expect(systemRepoRegistrations).toEqual([
        expect.objectContaining({
          repoType: 'SystemRepo',
          repoName: fixedSystemRepoName,
          tableNames: expect.arrayContaining(['accounts', 'repos']),
        }),
      ]);
      expect(otherRegistrations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repoType: 'ServiceRepo',
            repoName: `${coreAbbreviations.serviceRepo}_gen_other/app`,
          }),
        ]),
      );
      expect(registrations).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repoName: `${coreAbbreviations.serviceRepo}_gen_other/app`,
          }),
        ]),
      );
      expect(otherRegistrations).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repoName: `${coreAbbreviations.serviceRepo}_gen_test/app`,
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
        serviceRepo.getRepoTableRows({ tableName: 'sqlite_master' }),
      ).pipe(Effect.flatMap(decodeRpc), Effect.either);

      expect(missingTable._tag).toBe('Left');
    }).pipe(Effect.provide(AsyncLive)),
  );
});
