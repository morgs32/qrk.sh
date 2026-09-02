import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeSystem } from '../makeSystem.ts';

describe('makeSystem', () => {
  it('normalizes aggregate and service definitions under their registry keys', () => {
    const system = makeSystem({
      name: 'test',
      version: '1.2.3',
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
          contracts: {},
          selections: {},
          frontends: {},
        },
      },
      services: {
        catalog: {
          models: {},
          contracts: {},
          frontends: {},
        },
      },
    });

    expect(system.name).toBe('test');
    expect(system.version).toBe('1.2.3');
    expect(system.aggregates.user.name).toBe('user');
    expect(system.services.catalog.name).toBe('catalog');
  });

  it('resolves aggregate query grants directly to service queries', () => {
    const system = makeSystem({
      name: 'test',
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
          contracts: {},
          selections: {},
          queries: {
            products: { service: 'catalog', query: 'products' },
          },
          frontends: {},
        },
      },
      services: {
        catalog: {
          models: {},
          contracts: {},
          queries: {
            products: {
              paramsSchema: Schema.Struct({}),
              query: () => Effect.succeed([]),
            },
          },
          frontends: {},
        },
      },
    });

    expect(system.aggregates.user.queries.products).toBe(
      system.services.catalog.queries.products,
    );
    expect(system.aggregates.user.queries.products).toMatchObject({
      kind: 'service',
      name: 'products',
      serviceName: 'catalog',
    });
  });
});
