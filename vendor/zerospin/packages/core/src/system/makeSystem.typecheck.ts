import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeSignature } from '../authentication/makeSignature.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeSystem } from './makeSystem.ts';

const authenticationSignature = makeSignature(
  {
    version: '1.0.0',
    schema: Schema.Struct({ userId: Schema.String }),
  },
  [],
);
const authentication = {
  signature: authenticationSignature,
  authenticate: ({
    signature,
  }: {
    signature: Schema.Schema.Type<typeof authenticationSignature.schema>;
  }) => Effect.succeed(signature.userId),
};

const system = makeSystem({
  name: 'test',
  version: '1.2.3',
  authentication,
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

const systemName: 'test' = system.name;
const systemVersion: '1.2.3' = system.version;
const aggregateName: 'user' = system.aggregates.user.name;
const serviceName: 'catalog' = system.services.catalog.name;
void systemName;
void systemVersion;
void aggregateName;
void serviceName;

const ownerServiceController = makeFrontendController({
  systemName: 'service-owner-type-test',
  serviceName: 'catalog',
  frontendName: 'browse',
  models: {},
});

makeSystem({
  name: 'service-owner-type-test',
  version: '1.0.0',
  authentication,
  aggregates: {},
  services: {
    // @ts-expect-error — a service with a frontend requires owner authentication
    catalog: {
      models: {},
      contracts: {},
      frontends: { browse: { controller: ownerServiceController } },
    },
  },
});

const ServiceProduct = makeModel({
  abbreviation: 'prd',
  modelName: 'product',
  attributes: { name: primitives.text() },
  indexes: [],
  version: '1.0.0',
});
const AggregateProduct = makeReplica({
  sourceModel: ServiceProduct,
  serviceName: 'catalog',
});
const directSourceAggregateController = makeFrontendController({
  systemName: 'direct-source-frontend-type-test',
  aggregateName: 'account',
  frontendName: 'web',
  contracts: {},
  models: { product: ServiceProduct },
});

makeSystem({
  name: 'invalid-service-replica',
  version: '1.0.0',
  authentication,
  aggregates: {},
  services: {
    catalog: {
      models: {
        // @ts-expect-error services require authoritative source models
        product: AggregateProduct,
      },
      contracts: {},
      frontends: {},
    },
  },
});

const replicaSystem = makeSystem({
  name: 'replica-system',
  version: '1.0.0',
  authentication,
  aggregates: {
    account: {
      models: { product: AggregateProduct },
      contracts: {},
      selections: {
        product: {
          model: AggregateProduct,
          where: () => ({}),
        },
      },
      frontends: {},
    },
  },
  services: {
    catalog: {
      models: { product: ServiceProduct },
      contracts: {},
      frontends: {},
    },
  },
});

assert<
  Equals<
    typeof replicaSystem.services.catalog.models.product,
    typeof ServiceProduct
  >
>();
assert<
  Equals<
    typeof replicaSystem.aggregates.account.models.product,
    typeof AggregateProduct
  >
>();

makeSystem({
  name: 'direct-source-frontend-type-test',
  version: '1.0.0',
  authentication,
  aggregates: {
    account: {
      authorize: () => Effect.void,
      models: { product: AggregateProduct },
      contracts: {},
      selections: {
        product: { model: AggregateProduct, where: () => ({}) },
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
      models: { product: ServiceProduct },
      contracts: {},
      frontends: {},
    },
  },
});

// @ts-expect-error — version is required at the factory call site
makeSystem({
  name: 'test',
  authentication,
  aggregates: {},
});

const VersionedItem = makeModel(
  {
    abbreviation: 'itm',
    modelName: 'item',
    attributes: { amount: primitives.integer() },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'itm',
      modelName: 'item',
      attributes: { quantity: primitives.integer() },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          quantity: resource.amount,
        }),
    },
  ],
);

makeSystem({
  name: 'historical-mutation-adapter-test',
  version: '2.0.0',
  authentication,
  aggregates: {
    list: {
      models: { item: VersionedItem },
      contracts: {},
      mutationAdapters: {
        item: {
          update: [
            {
              source: VersionedItem.updateMutation('1.0.0'),
              destination: VersionedItem.updateMutation('2.0.0'),
              adapter: mutation => {
                assert<Equals<typeof mutation.resourceId, `itm_${string}`>>();
                assert<Equals<typeof mutation.operationName, 'update'>>();
                mutation.operation.mask?.forEach(attribute => {
                  assert<Equals<typeof attribute, string>>();
                });

                return VersionedItem.update('2.0.0', {
                  resourceId: mutation.resourceId,
                  attributes: {
                    amount: mutation.operation.attributes.quantity,
                  },
                });
              },
            },
          ],
        },
      },
      selections: {},
      frontends: {},
    },
  },
});
