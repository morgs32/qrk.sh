import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { env } from 'cloudflare:workers';
import { Effect, Result } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerRepo } from '../registerRepo/registerRepo.js';
import { registerRepos } from '../registerRepos/registerRepos.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { checkSystemSpec } from './checkSystemSpec.js';

const aggregate = {
  name: 'cart',
  version: '1.0.0',
  services: { directory: '1.0.0' },
  models: {},
  contracts: {},
  selections: {},
};
const service = {
  name: 'directory',
  version: '1.0.0',
  models: {},
  contracts: {},
  queries: {},
  frontends: {},
  historicalDefinitions: [
    { version: '0.1.0', models: {}, contracts: {} },
    { version: '0.2.0', models: {}, contracts: {} },
  ],
};
const spec: ISystemSpec = {
  systemName: 'test',
  authentication: [],
  aggregates: { cart: { '1.0.0': aggregate } },
  services: { directory: { '1.0.0': service } },
};

let db: IDb<typeof systemRepoDbConfig>;
beforeEach(async () => {
  delete env.ZEROSPIN_VERSION_METADATA;
  db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({ dbConfig: systemRepoDbConfig }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
});

describe('SystemRepo spec locks', () => {
  it('returns its executing version metadata and null when the dev binding is absent', async () => {
    expect(await Effect.runPromise(checkSystemSpec({ db, spec }))).toEqual({
      workerVersionId: null,
    });
    env.ZEROSPIN_VERSION_METADATA = { id: 'system-repo-version' };
    expect(await Effect.runPromise(checkSystemSpec({ db, spec }))).toEqual({
      workerVersionId: 'system-repo-version',
    });
  });
  it('accepts aggregate and service definitions once and ignores object-key order', async () => {
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      checkSystemSpec({
        db,
        spec: {
          ...spec,
          aggregates: {
            cart: {
              '1.0.0': {
                selections: {},
                contracts: {},
                models: {},
                services: { directory: '1.0.0' },
                version: '1.0.0',
                name: 'cart',
              },
            },
          },
        },
      }),
    );
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toHaveLength(1);
    expect(
      db.select().from(systemRepoDbConfig.schema.serviceSpecLocks).all(),
    ).toHaveLength(1);
  });

  it('rejects an aggregate conflict without changing the retained definition', async () => {
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    const result = await Effect.runPromise(
      checkSystemSpec({
        db,
        spec: {
          ...spec,
          aggregates: { cart: { '1.0.0': { ...aggregate, services: {} } } },
        },
      }).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-spec-mismatch' },
    });
    expect(
      JSON.parse(
        db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).get()!
          .spec,
      ),
    ).toEqual(aggregate);
  });

  it('preserves array order and rolls back earlier additions when a service conflicts', async () => {
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    const result = await Effect.runPromise(
      checkSystemSpec({
        db,
        spec: {
          ...spec,
          aggregates: { cart: { '2.0.0': { ...aggregate, version: '2.0.0' } } },
          services: {
            directory: {
              '1.0.0': {
                ...service,
                historicalDefinitions:
                  service.historicalDefinitions.toReversed(),
              },
            },
          },
        },
      }).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-spec-mismatch' },
    });
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toHaveLength(1);
    expect(
      db.select().from(systemRepoDbConfig.schema.serviceSpecLocks).all(),
    ).toHaveLength(1);
  });

  it('retains removed definitions, permits identical reintroduction, and adds new versions', async () => {
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      checkSystemSpec({ db, spec: { ...spec, aggregates: {}, services: {} } }),
    );
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      checkSystemSpec({
        db,
        spec: {
          ...spec,
          aggregates: { cart: { '2.0.0': { ...aggregate, version: '2.0.0' } } },
          services: {
            directory: { '2.0.0': { ...service, version: '2.0.0' } },
          },
        },
      }),
    );
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toHaveLength(2);
    expect(
      db.select().from(systemRepoDbConfig.schema.serviceSpecLocks).all(),
    ).toHaveLength(2);
    await expect(
      Effect.runPromise(
        checkSystemSpec({
          db,
          spec: {
            ...spec,
            aggregates: { cart: { '1.0.0': { ...aggregate, services: {} } } },
          },
        }),
      ),
    ).rejects.toThrow('differs from its accepted spec');
  });

  it('serializes concurrent first acceptance so only one conflicting candidate succeeds', async () => {
    const outcomes = await Effect.runPromise(
      Effect.all(
        [
          checkSystemSpec({ db, spec }).pipe(Effect.result),
          checkSystemSpec({
            db,
            spec: {
              ...spec,
              aggregates: { cart: { '1.0.0': { ...aggregate, services: {} } } },
            },
          }).pipe(Effect.result),
        ],
        { concurrency: 'unbounded' },
      ),
    );
    expect(outcomes.filter(Result.isSuccess)).toHaveLength(1);
    expect(outcomes.filter(Result.isFailure)).toHaveLength(1);
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toHaveLength(1);
  });

  it('keeps authentication and system names outside aggregate/service locks', async () => {
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      checkSystemSpec({
        db,
        spec: {
          ...spec,
          systemName: 'renamed',
          authentication: [
            {
              version: '2.0.0',
              signatureJsonSchema: {
                dialect: 'draft-2020-12',
                schema: { type: 'string' },
                definitions: {},
              },
            },
          ],
        },
      }),
    );
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toHaveLength(1);
  });
});

describe('registration requires accepted definitions', () => {
  const registration = {
    repoType: 'VersionedAggregateChain',
    repoName: 'cart/1.0.0',
    tableNames: ['commands'],
  } satisfies Parameters<typeof registerRepo>[0]['registration'];

  it('does not create locks or registrations for an unaccepted bundle', async () => {
    const outcome = await Effect.runPromise(
      registerRepo({
        db,
        spec,
        registration,
        repoTable: systemRepoDbConfig.schema.repos,
      }).pipe(Effect.result),
    );
    expect(outcome).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-spec-not-accepted' },
    });
    expect(
      db.select().from(systemRepoDbConfig.schema.aggregateSpecLocks).all(),
    ).toEqual([]);
    expect(
      db.select().from(systemRepoDbConfig.schema.serviceSpecLocks).all(),
    ).toEqual([]);
    expect(db.select().from(systemRepoDbConfig.schema.repos).all()).toEqual([]);
  });

  it('requires service locks too and preserves existing registration after a rejected restart', async () => {
    await Effect.runPromise(
      checkSystemSpec({ db, spec: { ...spec, services: {} } }),
    );
    const missingService = await Effect.runPromise(
      registerRepo({
        db,
        spec,
        registration,
        repoTable: systemRepoDbConfig.schema.repos,
      }).pipe(Effect.result),
    );
    expect(missingService).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'service-spec-not-accepted' },
    });
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(
      registerRepo({
        db,
        spec,
        registration,
        repoTable: systemRepoDbConfig.schema.repos,
      }),
    );
    const changed = await Effect.runPromise(
      registerRepo({
        db,
        registration: { ...registration, tableNames: ['wrong'] },
        repoTable: systemRepoDbConfig.schema.repos,
        spec: {
          ...spec,
          aggregates: { cart: { '1.0.0': { ...aggregate, services: {} } } },
        },
      }).pipe(Effect.result),
    );
    expect(changed).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-spec-mismatch' },
    });
    expect(
      db.select().from(systemRepoDbConfig.schema.repos).get()!.tableNames,
    ).toBe('["commands"]');
  });

  it('rejects an unaccepted bulk pair atomically and records both after acceptance', async () => {
    const pair = {
      db,
      spec,
      repoTable: systemRepoDbConfig.schema.repos,
      frontendRepo: {
        repoType: 'UserVersionedAggregateRepo',
        repoName: 'frontend',
        tableNames: ['projection'],
      },
      finalizedCommandChain: {
        repoType: 'UserVersionedAggregateChain',
        repoName: 'chain',
        tableNames: ['commands'],
      },
    } satisfies Parameters<typeof registerRepos>[0];
    await expect(Effect.runPromise(registerRepos(pair))).rejects.toThrow(
      'has no accepted spec',
    );
    expect(db.select().from(systemRepoDbConfig.schema.repos).all()).toEqual([]);
    await Effect.runPromise(checkSystemSpec({ db, spec }));
    await Effect.runPromise(registerRepos(pair));
    expect(
      db.select().from(systemRepoDbConfig.schema.repos).all(),
    ).toHaveLength(2);
  });
});
