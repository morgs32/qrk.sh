import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeSignature } from '../../authentication/makeSignature.ts';
import { makeFrontendController } from '../../frontendController/makeFrontendController.ts';
import { makeModel } from '../../models/makeModel.ts';
import { makeReplica } from '../../models/makeReplica.ts';
import { makeSelection } from '../../models/makeSelection.ts';
import { makeSystem } from '../makeSystem.ts';

describe('makeSystem', () => {
  /**
   * 1 — Define the authoritative and replica identities and matching frontends.
   * 2 — Accept exact service ownership and aggregate replica bindings.
   * 3 — Reject replicas in authoritative service and frontend positions.
   * 4 — Reject duplicate or direct source ownership outside the owning service.
   * 5 — Reject frontend and aggregate replicas that do not match their source.
   */
  it('enforces authoritative service ownership and exact aggregate replica bindings', () => {
    // 1 — Build the identities used by both the accepted and rejected graphs.
    const ProductSource = makeModel(
      {
        abbreviation: 'prd',
        modelName: 'product',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const ProductReplica = makeReplica({
      sourceModel: ProductSource,
      serviceName: 'catalog',
    });
    const serviceController = makeFrontendController({
      systemName: 'replica-system',
      serviceName: 'catalog',
      frontendName: 'browse',
      models: { product: ProductSource },
    });
    const aggregateController = makeFrontendController({
      systemName: 'replica-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: {},
      models: { product: ProductReplica },
    });

    // 2 — The service owns the source while the aggregate uses its exact replica.
    const system = makeSystem({
      name: 'replica-system',
      version: '1.0.0',
      authentication: {
        signature: makeSignature(
          { version: '1.0.0', schema: Schema.Struct({}) },
          [],
        ),
        authenticate: () => Effect.succeed('user'),
      },
      aggregates: {
        account: {
          authorize: () => Effect.void,
          models: { product: ProductReplica },
          contracts: {},
          selections: {
            product: makeSelection({
              model: ProductReplica,
              where: () => ({}),
            }),
          },
          frontends: { web: { controller: aggregateController } },
        },
      },
      services: {
        catalog: {
          authorize: () => Effect.void,
          models: { product: ProductSource },
          contracts: {},
          frontends: { browse: { controller: serviceController } },
        },
      },
    });

    expect(system.services.catalog.models.product).toBe(ProductSource);
    expect(system.aggregates.account.models.product).toBe(ProductReplica);

    // 3 — Neither service declarations nor service frontends may use replicas.
    expect(() =>
      makeFrontendController({
        systemName: 'replica-system',
        serviceName: 'catalog',
        frontendName: 'invalid',
        // @ts-expect-error service frontends require authoritative models
        models: { product: ProductReplica },
      }),
    ).toThrow(/service models.product must be authoritative, not a replica/);

    expect(() =>
      makeSystem({
        name: 'replica-service-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          catalog: {
            // @ts-expect-error services require authoritative models
            models: { product: ProductReplica },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(/must be the authoritative source model, not a replica/);

    // 4 — One service owns each source, and aggregates may not use it directly.
    expect(() =>
      makeSystem({
        name: 'duplicate-service-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {},
        services: {
          catalog: {
            models: { product: ProductSource },
            contracts: {},
            frontends: {},
          },
          inventory: {
            models: { product: ProductSource },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(/reuses a source model already owned by service "catalog"/);

    expect(() =>
      makeSystem({
        name: 'direct-source-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          account: {
            models: { product: ProductSource },
            contracts: {},
            selections: {},
            frontends: {},
          },
        },
        services: {
          catalog: {
            models: { product: ProductSource },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(/must use makeReplica for source model "catalog.product"/);

    // 5 — Frontend and aggregate replicas must preserve the exact source identity.
    const directSourceAggregateController = makeFrontendController({
      systemName: 'direct-source-frontend-system',
      aggregateName: 'account',
      frontendName: 'web',
      contracts: {},
      models: { product: ProductSource },
    });
    expect(() =>
      makeSystem({
        name: 'direct-source-frontend-system',
        version: '1.0.0',
        authentication: {
          signature: makeSignature(
            { version: '1.0.0', schema: Schema.Struct({}) },
            [],
          ),
          authenticate: () => Effect.succeed('user'),
        },
        aggregates: {
          account: {
            authorize: () => Effect.void,
            models: { product: ProductReplica },
            contracts: {},
            selections: {
              product: makeSelection({
                model: ProductReplica,
                where: () => ({}),
              }),
            },
            frontends: {
              web: {
                // @ts-expect-error aggregate frontends cannot identity-bind the authoritative source model over its replica
                controller: directSourceAggregateController,
              },
            },
          },
        },
        services: {
          catalog: {
            models: { product: ProductSource },
            contracts: {},
            frontends: {},
          },
        },
      }),
    ).toThrow(
      /must exactly match aggregate model "product" when no projection adapter is allowed/,
    );

    const OtherProductSource = makeModel(
      {
        abbreviation: 'prd',
        modelName: 'product',
        attributes: { name: primitives.text() },
        indexes: [],
        version: '1.0.0',
      },
      [],
    );
    const WrongSourceReplica = makeReplica({
      sourceModel: OtherProductSource,
      serviceName: 'catalog',
    });
    const WrongServiceReplica = makeReplica({
      sourceModel: ProductSource,
      serviceName: 'inventory',
    });

    for (const replica of [WrongSourceReplica, WrongServiceReplica]) {
      expect(() =>
        makeSystem({
          name: 'wrong-replica-system',
          version: '1.0.0',
          authentication: {
            signature: makeSignature(
              { version: '1.0.0', schema: Schema.Struct({}) },
              [],
            ),
            authenticate: () => Effect.succeed('user'),
          },
          aggregates: {
            account: {
              models: { product: replica },
              contracts: {},
              selections: {},
              frontends: {},
            },
          },
          services: {
            catalog: {
              models: { product: ProductSource },
              contracts: {},
              frontends: {},
            },
          },
        }),
      ).toThrow(/must replicate the exact source model/);
    }
  });
});
