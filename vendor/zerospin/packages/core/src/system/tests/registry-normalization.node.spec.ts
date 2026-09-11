import { userAggregate as authenticationFixtureOwner } from '@zerospin/core/fixtures/system';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeAggregate } from '../../aggregate/makeAggregate.ts';
import { makeAggregateVersion } from '../../aggregate/makeVersion.ts';
import { makeService } from '../../service/makeService.ts';
import { makeSystem } from '../makeSystem.ts';
import { makeSystemSpec } from '../makeSystemSpec.ts';

describe('makeSystem', () => {
  it('normalizes aggregate and service definitions under their registry keys', () => {
    const system = makeSystem({
      name: 'test',

      aggregates: {
        user: [
          makeAggregateVersion(makeAggregate({ name: 'user' }), {
            authentication: authenticationFixtureOwner.authentication,
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
            authentication: authenticationFixtureOwner.authentication,
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
