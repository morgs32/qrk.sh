import {
  main as authenticationFixtureFrontend,
  userAggregate as authenticationFixtureOwner,
} from '@zerospin/core/fixtures/system';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineAggregate } from '../../aggregate/defineAggregate.ts';
import { makeAggregateVersion } from '../../aggregate/makeAggregateVersion.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { defineModel } from '../../models/defineModel.ts';
import { makeModelVersion } from '../../models/makeModelVersion.ts';
import { makeReplica } from '../../models/makeReplica.ts';
import { makeSelection } from '../../models/makeSelection.ts';
import { makeService } from '../../service/makeService.ts';
import { makeSystem } from '../makeSystem.ts';
import { makeSystemSpec } from '../makeSystemSpec.ts';
import { SystemSpecSchema } from '../SystemSpecSchema.ts';

describe('makeSystem', () => {
  /**
   * 1 — Define the authoritative and replica identities and matching frontends.
   * 2 — Accept exact service ownership and aggregate replica bindings.
   * 3 — Reject duplicate or direct source ownership outside the owning service.
   * 4 — Reject aggregate replicas that do not match their system service source.
   */
  it('enforces authoritative service ownership and exact aggregate replica bindings', () => {
    // 1 — Build the identities used by both the accepted and rejected graphs.
    const ProductSource = makeModelVersion(
      defineModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
    );
    const ProductReplica = makeReplica({
      sourceModel: ProductSource,
      modelVersion: ProductSource.version,
      serviceName: 'catalog',
    });
    const _aggregateController = makeFrontendController({
      authenticationSchema:
        authenticationFixtureFrontend.authentication.authenticationSchema,
      aggregateVersion: '1.0.0',
      systemName: 'replica-system',
      aggregateName: 'account',
      name: 'web',
      contracts: {},
      models: { product: ProductReplica },
    });

    const catalog = makeService({
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '1.0.0',
      models: { product: ProductSource },
      contracts: {},
    });

    // 2 — The service owns the source while the aggregate uses its exact replica.
    const system = makeSystem({
      name: 'replica-system',

      aggregates: {
        account: [
          makeAggregateVersion(defineAggregate({ name: 'account' }), {
            ...authenticationFixtureOwner.authentication,
            services: { catalog },

            version: '1.0.0',
            authorize: () => Effect.void,
            models: { product: ProductReplica },
            contracts: {},
            selections: {
              product: makeSelection({
                model: ProductReplica,
                where: () => ({}),
              }),
            },
          }),
        ],
      },
      services: {
        catalog: [
          makeService({
            ...authenticationFixtureOwner.authentication,
            name: 'catalog',
            version: '1.0.0',
            authorize: () => Effect.void,
            models: { product: ProductSource },
            contracts: {},
          }),
        ],
      },
    });

    expect(system.services.catalog['1.0.0'].models.product).toBe(ProductSource);
    expect(system.aggregates.account['1.0.0'].models.product).toBe(
      ProductReplica,
    );

    // 3 — One service owns each source, and aggregates may not use it directly.
    expect(() =>
      makeSystem({
        name: 'duplicate-service-system',

        aggregates: {},
        services: {
          catalog: [
            makeService({
              ...authenticationFixtureOwner.authentication,
              name: 'catalog',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
            }),
          ],
          inventory: [
            makeService({
              ...authenticationFixtureOwner.authentication,
              name: 'inventory',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
            }),
          ],
        },
      }),
    ).toThrow(/reuses a source model already owned by service "catalog"/);

    expect(() =>
      makeSystem({
        name: 'direct-source-system',

        aggregates: {
          account: [
            makeAggregateVersion(defineAggregate({ name: 'account' }), {
              ...authenticationFixtureOwner.authentication,
              services: { catalog },

              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
              selections: {
                product: makeSelection({
                  model: ProductSource,
                  where: () => ({}),
                }),
              },
            }),
          ],
        },
        services: {
          catalog: [
            makeService({
              ...authenticationFixtureOwner.authentication,
              name: 'catalog',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
            }),
          ],
        },
      }),
    ).toThrow(/must use makeReplica for source model "catalog.product"/);

    // 4 — Aggregate replicas must preserve the exact system service source identity.
    const OtherProductSource = makeModelVersion(
      defineModel({ name: 'product', abbreviation: 'prd' }),
      {
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
    );
    const WrongSourceReplica = makeReplica({
      sourceModel: OtherProductSource,
      modelVersion: OtherProductSource.version,
      serviceName: 'catalog',
    });
    const WrongServiceReplica = makeReplica({
      sourceModel: ProductSource,
      modelVersion: ProductSource.version,
      serviceName: 'inventory',
    });

    for (const replica of [WrongSourceReplica, WrongServiceReplica]) {
      expect(() =>
        makeSystem({
          name: 'wrong-replica-system',

          aggregates: {
            account: [
              makeAggregateVersion(defineAggregate({ name: 'account' }), {
                ...authenticationFixtureOwner.authentication,
                services: { catalog },

                version: '1.0.0',
                models: { product: replica },
                contracts: {},
                selections: {
                  product: makeSelection({
                    model: replica,
                    where: () => ({}),
                  }),
                },
              }),
            ],
          },
          services: {
            catalog: [
              makeService({
                ...authenticationFixtureOwner.authentication,
                name: 'catalog',
                version: '1.0.0',
                models: { product: ProductSource },
                contracts: {},
              }),
            ],
          },
        }),
      ).toThrow(/must replicate the exact source model/);
    }
  });

  it('validates each replica against its pinned service snapshot', () => {
    const Product = makeModelVersion(
      defineModel({ name: 'product', abbreviation: 'prd' }),
      {
        version: '2.0.0',
        attributes: { name: primitives.text(), description: primitives.text() },
        indexes: [],
      },
    );
    const ProductReplica = makeReplica({
      sourceModel: Product,
      serviceName: 'catalog',
      modelVersion: '2.0.0',
    });
    const catalog = makeService({
      ...authenticationFixtureOwner.authentication,
      name: 'catalog',
      version: '5.0.0',
      models: { product: Product },
      contracts: {},
    });
    const system = makeSystem({
      name: 'pinned-replicas',

      services: { catalog: [catalog] },
      aggregates: {
        shopper: [
          makeAggregateVersion(defineAggregate({ name: 'shopper' }), {
            ...authenticationFixtureOwner.authentication,
            version: '2.0.0',
            services: { catalog },
            models: { product: ProductReplica },
            contracts: {},
            selections: {
              product: makeSelection({
                model: ProductReplica,
                where: () => ({}),
              }),
            },
          }),
        ],
      },
    });
    const spec = makeSystemSpec({ system });
    const decoded = Schema.decodeUnknownSync(SystemSpecSchema)(
      JSON.parse(JSON.stringify(spec)),
    );
    expect(decoded.aggregates.shopper?.['2.0.0']?.services).toEqual({
      catalog: '5.0.0',
    });

    for (const rejected of [
      {
        services: {},
        expected: /must replicate the exact source model "catalog.product"/,
      },
      {
        services: {
          catalog: makeService({
            ...authenticationFixtureOwner.authentication,
            name: 'catalog',
            version: '9.0.0',
            models: { product: Product },
            contracts: {},
          }),
        },
        expected: /must replicate the exact source model "catalog.product"/,
      },
      {
        services: {
          catalog: makeService({
            ...authenticationFixtureOwner.authentication,
            name: 'catalog',
            version: '4.0.0',
            models: {},
            contracts: {},
          }),
        },
        expected: /must replicate the exact source model "catalog.product"/,
      },
      {
        services: {
          catalog,
          missing: makeService({
            ...authenticationFixtureOwner.authentication,
            name: 'missing',
            version: '1.0.0',
            models: {},
            contracts: {},
          }),
        },
        expected: /references missing service "missing"/,
      },
    ]) {
      expect(() =>
        makeSystem({
          name: 'pinned-replicas',

          services: { catalog: [catalog] },
          aggregates: {
            shopper: [
              makeAggregateVersion(defineAggregate({ name: 'shopper' }), {
                ...authenticationFixtureOwner.authentication,
                version: '1.0.0',
                services: rejected.services,
                models: { product: ProductReplica },
                contracts: {},
                selections: {
                  product: makeSelection({
                    model: ProductReplica,
                    where: () => ({}),
                  }),
                },
              }),
            ],
          },
        }),
      ).toThrow(rejected.expected);
    }
  });
});
