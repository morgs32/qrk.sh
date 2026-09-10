import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { aggregates } from '../../aggregate/index.ts';
import { authentication } from '../../authentication/index.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { models } from '../../models/index.ts';
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
    const ProductSource = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
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
    const serviceController = makeFrontendController({
      systemName: 'replica-system',
      serviceVersion: '1.0.0',
      serviceName: 'catalog',
      name: 'browse',
      models: { product: ProductSource },
    });
    const _aggregateController = makeFrontendController({
      aggregateVersion: '1.0.0',
      systemName: 'replica-system',
      aggregateName: 'account',
      name: 'web',
      contracts: {},
      models: { product: ProductReplica },
    });

    const catalog = makeService({
      name: 'catalog',
      version: '1.0.0',
      models: { product: ProductSource },
      contracts: {},
      frontends: {},
    });

    // 2 — The service owns the source while the aggregate uses its exact replica.
    const system = makeSystem({
      name: 'replica-system',
      authentication: [
        authentication.makeVersion({
          version: '1.0.0',
          signature: Schema.Struct({}),
          authenticate: () => Effect.succeed('user'),
        }),
      ],
      aggregates: {
        account: [
          aggregates.makeVersion(
            aggregates.makeAggregate({ name: 'account' }),
            {
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
            },
          ),
        ],
      },
      services: {
        catalog: [
          makeService({
            name: 'catalog',
            version: '1.0.0',
            authorize: () => Effect.void,
            models: { product: ProductSource },
            contracts: {},
            frontends: { browse: { controller: serviceController } },
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
        authentication: [
          authentication.makeVersion({
            version: '1.0.0',
            signature: Schema.Struct({}),
            authenticate: () => Effect.succeed('user'),
          }),
        ],
        aggregates: {},
        services: {
          catalog: [
            makeService({
              name: 'catalog',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
              frontends: {},
            }),
          ],
          inventory: [
            makeService({
              name: 'inventory',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
              frontends: {},
            }),
          ],
        },
      }),
    ).toThrow(/reuses a source model already owned by service "catalog"/);

    expect(() =>
      makeSystem({
        name: 'direct-source-system',
        authentication: [
          authentication.makeVersion({
            version: '1.0.0',
            signature: Schema.Struct({}),
            authenticate: () => Effect.succeed('user'),
          }),
        ],
        aggregates: {
          account: [
            aggregates.makeVersion(
              aggregates.makeAggregate({ name: 'account' }),
              {
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
              },
            ),
          ],
        },
        services: {
          catalog: [
            makeService({
              name: 'catalog',
              version: '1.0.0',
              models: { product: ProductSource },
              contracts: {},
              frontends: {},
            }),
          ],
        },
      }),
    ).toThrow(/must use makeReplica for source model "catalog.product"/);

    // 4 — Aggregate replicas must preserve the exact system service source identity.
    const OtherProductSource = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
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
          authentication: [
            authentication.makeVersion({
              version: '1.0.0',
              signature: Schema.Struct({}),
              authenticate: () => Effect.succeed('user'),
            }),
          ],
          aggregates: {
            account: [
              aggregates.makeVersion(
                aggregates.makeAggregate({ name: 'account' }),
                {
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
                },
              ),
            ],
          },
          services: {
            catalog: [
              makeService({
                name: 'catalog',
                version: '1.0.0',
                models: { product: ProductSource },
                contracts: {},
                frontends: {},
              }),
            ],
          },
        }),
      ).toThrow(/must replicate the exact source model/);
    }
  });

  it('validates each replica against its pinned service snapshot', () => {
    const Product = models.makeVersion(
      models.makeModel({ name: 'product', abbreviation: 'prd' }),
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
      name: 'catalog',
      version: '5.0.0',
      historicalDefinitions: [
        { version: '4.0.0', models: { product: '1.0.0' }, contracts: {} },
      ],
      models: { product: Product },
      contracts: {},
      frontends: {},
    });
    const authenticationV1 = authentication.makeVersion({
      version: '1.0.0',
      signature: Schema.Struct({}),
      authenticate: () => Effect.succeed('user'),
    });
    const system = makeSystem({
      name: 'pinned-replicas',
      authentication: [authenticationV1],
      services: { catalog: [catalog] },
      aggregates: {
        shopper: [
          aggregates.makeVersion(
            aggregates.makeAggregate({ name: 'shopper' }),
            {
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
            },
          ),
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
            name: 'catalog',
            version: '9.0.0',
            models: { product: Product },
            contracts: {},
            frontends: {},
          }),
        },
        expected: /must replicate the exact source model "catalog.product"/,
      },
      {
        services: {
          catalog: makeService({
            name: 'catalog',
            version: '4.0.0',
            models: {},
            contracts: {},
            frontends: {},
          }),
        },
        expected: /must replicate the exact source model "catalog.product"/,
      },
      {
        services: {
          catalog,
          missing: makeService({
            name: 'missing',
            version: '1.0.0',
            models: {},
            contracts: {},
            frontends: {},
          }),
        },
        expected: /references missing service "missing"/,
      },
    ]) {
      expect(() =>
        makeSystem({
          name: 'pinned-replicas',
          authentication: [authenticationV1],
          services: { catalog: [catalog] },
          aggregates: {
            shopper: [
              aggregates.makeVersion(
                aggregates.makeAggregate({ name: 'shopper' }),
                {
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
                },
              ),
            ],
          },
        }),
      ).toThrow(rejected.expected);
    }
  });
});
