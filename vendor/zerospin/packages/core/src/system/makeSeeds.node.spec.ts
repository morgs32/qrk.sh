import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { makeSignature } from '../authentication/makeSignature.ts';
import { makeContract } from '../contracts/makeContract.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';
import { makeAggregateId } from '../utils/makeAggregateId.ts';

import { makeSeeds } from './makeSeeds.ts';
import { makeSystem } from './makeSystem.ts';

const createUser = makeContract({
  commandName: 'createUser',
  version: '1.0.0',
  payload: { name: primitives.text() },
  mutations: null,
});

const refreshCatalog = makeContract({
  commandName: 'refreshCatalog',
  version: '1.0.0',
  payload: { reason: primitives.text() },
  mutations: null,
});

const system = makeSystem({
  name: 'shopping',
  version: '1.0.0',
  authentication: {
    signature: makeSignature(
      {
        version: '1.0.0',
        schema: Schema.Struct({ userId: Schema.NonEmptyString }),
      },
      [],
    ),
    authenticate: ({ signature }) => Effect.succeed(signature.userId),
  },
  aggregates: {
    user: {
      models: {},
      contracts: { createUser },
      selections: {},
      frontends: {},
    },
  },
  services: {
    catalog: {
      models: {},
      contracts: { refreshCatalog },
      frontends: {},
    },
  },
});

const userAggregateId = makeAggregateId({ id: 'user-1' });

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeSeeds'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeSeeds', () => {
  it.layer(TestLayer)(it => {
    it.effect('resolves aggregate commands before service commands', () =>
      Effect.gen(function* () {
        const aggregateCommand = system.aggregates.user.makeCommand({
          contractName: 'createUser',
          aggregateId: userAggregateId,
          systemName: 'shopping',
          payload: { name: 'Ada' },
        });
        const serviceCommand = system.services.catalog.makeCommand({
          contractName: 'refreshCatalog',
          payload: { reason: 'initial import' },
        });

        const seeds = yield* makeSeeds({
          system,
          aggregates: { user: [aggregateCommand] },
          services: { catalog: [serviceCommand] },
        });

        expect(seeds).toHaveLength(2);
        expect(seeds[0]).toMatchObject({
          commandType: 'aggregate',
          aggregateId: userAggregateId,
          aggregateName: 'user',
        });
        expect(seeds[1]).toMatchObject({
          commandType: 'service',
          serviceName: 'catalog',
        });
      }),
    );

    it.effect('rejects an empty aggregate seed group', () =>
      Effect.gen(function* () {
        const error = yield* makeSeeds({
          system,
          aggregates: { user: [] },
          services: {},
        }).pipe(Effect.flip);

        expect(error.message).toBe(
          'invalid-seeds: Seed aggregate group "user" must contain at least one command',
        );
      }),
    );

    it.effect('rejects an aggregate command assigned to the wrong group', () =>
      Effect.gen(function* () {
        const wrongAggregateCommand = system.aggregates.user
          .makeCommand({
            contractName: 'createUser',
            aggregateId: makeAggregateId({ id: 'user-2' }),
            systemName: 'shopping',
            payload: { name: 'Grace' },
          })
          .pipe(
            Effect.map(command => ({
              ...command,
              aggregateName: 'admin',
            })),
          );
        const error = yield* makeSeeds({
          system,
          aggregates: { user: [wrongAggregateCommand] },
          services: {},
        }).pipe(Effect.flip);

        expect(error.message).toBe(
          'invalid-seeds: Seed aggregate group "user" received aggregateName "admin"',
        );
      }),
    );

    it.effect('rejects a service command assigned to the wrong group', () =>
      Effect.gen(function* () {
        const wrongServiceCommand = system.services.catalog
          .makeCommand({
            contractName: 'refreshCatalog',
            payload: { reason: 'scheduled import' },
          })
          .pipe(
            Effect.map(command => ({
              ...command,
              serviceName: 'billing',
            })),
          );
        const error = yield* makeSeeds({
          system,
          aggregates: {},
          services: { catalog: [wrongServiceCommand] },
        }).pipe(Effect.flip);

        expect(error.message).toBe(
          'invalid-seeds: Seed service group "catalog" received serviceName "billing"',
        );
      }),
    );
  });
});
