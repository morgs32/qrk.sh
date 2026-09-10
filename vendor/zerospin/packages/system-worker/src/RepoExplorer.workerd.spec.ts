import { it } from '@effect/vitest';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, listDurableObjectIds, runInDurableObject } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { AggregateChain } from './AggregateChain/AggregateChain.js';
import { SystemRepo } from './SystemRepo/SystemRepo.js';
import { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';
import { VersionedServiceRepo } from './VersionedServiceRepo/VersionedServiceRepo.js';

describe('RepoExplorer', () => {
  it.effect(
    'lists activated aggregate instances and schemas without activating additional repos',
    () =>
      Effect.gen(function* () {
        const systemId = env.ZEROSPIN_SYSTEM_ID;
        const aggregateId = 'acct_inactive_inspection';
        const systemRepo = yield* SystemRepo.getRepo({ key: { systemId } });

        const chain = yield* AggregateChain.getRepo({
          key: { systemId, aggregateId, aggregateName: 'notes' },
        });
        yield* makeAsync(() => chain.ready()).pipe(Effect.flatMap(decodeRpc));
        const materializer = yield* VersionedAggregateRepo.getRepo({
          key: {
            systemId,
            aggregateId,
            aggregateName: 'notes',
            aggregateVersion: '1.0.0',
          },
        });
        yield* makeAsync(() => materializer.ready()).pipe(
          Effect.flatMap(decodeRpc),
        );
        const unopenedChains = yield* Effect.promise(() =>
          listDurableObjectIds(env.AGGREGATE_CHAIN),
        );
        const unopenedMaterializers = yield* Effect.promise(() =>
          listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO),
        );
        const chains = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'AggregateChain',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(chains).toEqual([
          expect.objectContaining({
            repoType: 'AggregateChain',
            repoName: `ac_${systemId}/${aggregateId}/notes`,
            tableNames: expect.arrayContaining([
              'versionedAggregateRepos',
              'admittedCommands',
            ]),
          }),
        ]);
        const materializers = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'VersionedAggregateRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(materializers.map(row => row.repoName)).toEqual([
          `var_${systemId}/${aggregateId}/notes/1.0.0`,
        ]);
        expect(materializers[0]?.tableNames).toContain('user');
        expect(materializers[0]?.tableNames).toEqual(
          expect.arrayContaining(['user', 'preference']),
        );

        expect(
          (yield* Effect.promise(() =>
            listDurableObjectIds(env.AGGREGATE_CHAIN),
          ))
            .map(id => id.toString())
            .sort(),
        ).toEqual(unopenedChains.map(id => id.toString()).sort());
        expect(
          (yield* Effect.promise(() =>
            listDurableObjectIds(env.VERSIONED_AGGREGATE_REPO),
          ))
            .map(id => id.toString())
            .sort(),
        ).toEqual(unopenedMaterializers.map(id => id.toString()).sort());

        const materializerTable = yield* makeAsync(() =>
          materializer.getRepoTableRows({ tableName: 'user' }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(materializerTable.rows).toEqual([]);
        const afterActivation = yield* makeAsync(() =>
          systemRepo.getRepoTableRows({ tableName: 'repos' }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(afterActivation.rows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              repoType: 'AggregateChain',
              repoName: `ac_${systemId}/${aggregateId}/notes`,
            }),
            expect.objectContaining({
              repoType: 'VersionedAggregateRepo',
              repoName: `var_${systemId}/${aggregateId}/notes/1.0.0`,
            }),
          ]),
        );
      }).pipe(Effect.provide(AsyncLive)),
  );

  it.effect(
    'enumerates static repo registrations from the singleton SystemRepo',
    () =>
      Effect.gen(function* () {
        const serviceRepo = yield* VersionedServiceRepo.getRepo({
          key: {
            systemId: env.ZEROSPIN_SYSTEM_ID,
            serviceName: 'app',
            serviceVersion: '1.0.0',
          },
        });
        const productTable = yield* makeAsync(() =>
          serviceRepo.getRepoTableRows({
            tableName: 'product',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        const systemRepo = yield* SystemRepo.getRepo({
          key: {
            systemId: env.ZEROSPIN_SYSTEM_ID,
          },
        });
        const openedSystemRepoName = yield* Effect.promise(() =>
          runInDurableObject(systemRepo, (_instance, state) => state.id.name),
        );
        expect(openedSystemRepoName).toBe(env.ZEROSPIN_SYSTEM_ID);

        const registrations = yield* makeAsync(() =>
          systemRepo.getRepoRegistrations({
            repoType: 'VersionedServiceRepo',
          }),
        ).pipe(Effect.flatMap(decodeRpc));
        expect(registrations).toEqual([
          expect.objectContaining({
            repoType: 'VersionedServiceRepo',
            repoName: `vsr_${env.ZEROSPIN_SYSTEM_ID}/app/1.0.0`,
            tableNames: expect.arrayContaining([
              'catalogSettings',
              'product',
              'results',
              'head',
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
              repoName: `vsr_${env.ZEROSPIN_SYSTEM_ID}/app/1.0.0`,
              repoType: 'VersionedServiceRepo',
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
