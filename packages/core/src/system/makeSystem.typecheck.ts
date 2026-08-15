import { Effect, Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type { IUserRef } from '../aggregate/types.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeSystem } from './makeSystem.ts';

const system = makeSystem({
  name: 'test',
  version: '1.2.3',
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

const OwnerItem = makeModel({
  abbreviation: 'oit',
  modelName: 'ownerItem',
  attributes: {},
  indexes: [],
  version: '1.0.0',
});
const OwnerUserIdSchema = Schema.String.pipe(Schema.brand('OwnerUserId'));
const ownerController = makeFrontendController({
  systemName: 'owner-type-test',
  aggregateName: 'account',
  frontendName: 'web',
  models: {},
  contracts: {},
  userId: OwnerUserIdSchema,
  signature: Schema.Struct({ userId: OwnerUserIdSchema }),
});
const ownerSystem = makeSystem({
  name: 'owner-type-test',
  version: '1.0.0',
  aggregates: {
    account: {
      models: { item: OwnerItem },
      contracts: {},
      userId: OwnerUserIdSchema,
      authenticate: ({ signature }) => {
        assert<
          Equals<
            typeof signature.userId,
            Schema.Schema.Type<typeof OwnerUserIdSchema>
          >
        >();
        return Effect.succeed(signature.userId);
      },
      selections: {
        current: {
          model: OwnerItem,
          where: ({
            userId,
          }: {
            userId: Schema.Schema.Type<typeof OwnerUserIdSchema>;
          }) => {
            assert<
              Equals<
                typeof userId,
                Schema.Schema.Type<typeof OwnerUserIdSchema>
              >
            >();
            return {};
          },
        },
      },
      frontends: { web: { controller: ownerController } },
    },
  },
});

assert<
  Equals<
    Schema.Schema.Type<typeof ownerSystem.aggregates.account.userId>,
    Schema.Schema.Type<typeof OwnerUserIdSchema>
  >
>();
assert<
  Equals<
    IUserRef<Schema.Schema.Type<typeof OwnerUserIdSchema>>['userId'],
    Schema.Schema.Type<typeof OwnerUserIdSchema>
  >
>();

const ownerServiceController = makeFrontendController({
  systemName: 'service-owner-type-test',
  serviceName: 'catalog',
  frontendName: 'browse',
  models: {},
  userId: OwnerUserIdSchema,
  signature: Schema.Struct({ userId: OwnerUserIdSchema }),
});

makeSystem({
  name: 'service-owner-type-test',
  version: '1.0.0',
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

// @ts-expect-error — version is required at the factory call site
makeSystem({
  name: 'test',
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
