import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { aggregates } from '../../aggregate/index.ts';
import { authentication } from '../../authentication/index.ts';
import { makeService } from '../../service/makeService.ts';
import { makeSystem } from '../makeSystem.ts';
import { makeSystemSpec } from '../makeSystemSpec.ts';

describe('makeSystem', () => {
  it('normalizes aggregate and service definitions under their registry keys', () => {
    const system = makeSystem({
      name: 'test',
      authentication: [
        authentication.makeVersion({
          version: '1.0.0',
          signature: Schema.Struct({ userId: Schema.NonEmptyString }),
          authenticate: ({ signature }) => Effect.succeed(signature.userId),
        }),
      ],
      aggregates: {
        user: [
          aggregates.makeVersion(aggregates.makeAggregate({ name: 'user' }), {
            version: '1.0.0',
            models: {},
            contracts: {},
            selections: {},
          }),
        ],
      },
      services: {
        catalog: [
          makeService({
            name: 'catalog',
            version: '1.0.0',
            models: {},
            contracts: {},
            queries: {
              products: {
                paramsSchema: Schema.Struct({}),
                query: () => Effect.succeed([]),
              },
            },
            frontends: {},
          }),
        ],
      },
    });

    expect(system.name).toBe('test');
    expect(system).not.toHaveProperty('version');
    expect(system.aggregates.user['1.0.0'].name).toBe('user');
    expect(system.services.catalog['1.0.0'].name).toBe('catalog');
    expect(system.services.catalog['1.0.0'].queries.products).toMatchObject({
      kind: 'service',
      name: 'products',
      serviceName: 'catalog',
    });
    const spec = makeSystemSpec({ system });
    expect(spec).not.toHaveProperty('version');
    expect(spec.services.catalog?.['1.0.0']?.queries.products).toMatchObject({
      name: 'products',
      serviceName: 'catalog',
    });
    expect(spec.aggregates.user?.['1.0.0']).not.toHaveProperty('queries');
  });
});
