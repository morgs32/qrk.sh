import { PrimitiveKind, primitives } from '@zerospin/schema';
import { Effect } from 'effect';

import { contracts } from '../contracts/index.ts';
import type { IDb, IResourceDbConfig } from '../drizzle/types.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';

import { makeFrontendController } from './makeFrontendController.ts';
import { makeFrontendControllerSpec } from './makeFrontendControllerSpec.ts';

const aggregateFrontend = makeFrontendController({
  aggregateVersion: '1.0.0',
  systemName: 'test',
  aggregateName: 'user',
  name: 'web',
  models: {},
  contracts: {},
});

const aggregateName: 'user' = aggregateFrontend.aggregateName;
const aggregateFrontendName: 'web' = aggregateFrontend.name;
void aggregateName;
void aggregateFrontendName;
// @ts-expect-error — frontend controllers do not expose controller SemVer.
void aggregateFrontend.version;

function assertReadonlyAggregateFrontend(
  frontend: typeof aggregateFrontend,
): void {
  // @ts-expect-error canonical frontend fields are readonly
  frontend.name = 'other';
  // @ts-expect-error canonical frontend model registries are readonly
  frontend.models.other = GuardList;
  // @ts-expect-error canonical frontend contract registries are readonly
  frontend.contracts.other = renameGuardList;
}
void assertReadonlyAggregateFrontend;

const serviceFrontend = makeFrontendController({
  systemName: 'test',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'browse',
  models: {},
});

const serviceName: 'catalog' = serviceFrontend.serviceName;
const serviceFrontendName: 'browse' = serviceFrontend.name;
void serviceName;
void serviceFrontendName;
// @ts-expect-error — frontend controllers do not expose controller SemVer.
void serviceFrontend.version;

function assertReadonlyServiceFrontend(frontend: typeof serviceFrontend): void {
  // @ts-expect-error canonical frontend fields are readonly
  frontend.serviceName = 'other';
  // @ts-expect-error canonical frontend model registries are readonly
  frontend.models.other = ServiceProduct;
}
void assertReadonlyServiceFrontend;

const ServiceProduct = models.makeVersion(
  models.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const AggregateProduct = makeReplica({
  sourceModel: ServiceProduct,
  modelVersion: ServiceProduct.version,
  serviceName: 'catalog',
});
const productServiceFrontend = makeFrontendController({
  systemName: 'replica-controller-test',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'service-products',
  models: { product: ServiceProduct },
});
const productAggregateFrontend = makeFrontendController({
  aggregateVersion: '1.0.0',
  systemName: 'replica-controller-test',
  aggregateName: 'account',
  name: 'aggregate-products',
  contracts: {},
  models: { product: AggregateProduct },
});

const retainedServiceProduct: typeof ServiceProduct =
  productServiceFrontend.models.product;
const retainedAggregateProduct: typeof AggregateProduct =
  productAggregateFrontend.models.product;
void retainedServiceProduct;
void retainedAggregateProduct;

makeFrontendController({
  systemName: 'replica-controller-test',
  serviceVersion: '1.0.0',
  serviceName: 'catalog',
  name: 'invalid-service-products',
  models: {
    // @ts-expect-error service frontends require authoritative source models
    product: AggregateProduct,
  },
});

makeFrontendController({
  systemName: 'test',
  name: 'invalid',
  models: {},
  // @ts-expect-error — a controller must identify either its aggregate or its service
  contracts: {},
});

makeFrontendController({
  aggregateVersion: '1.0.0',
  systemName: 'test',
  aggregateName: 'user',
  name: 'missing-version',
  models: {},
  contracts: {},
});

const GuardListModel = models.makeModel({
  name: 'guardList',
  abbreviation: 'gls',
});

const GuardList = models.makeVersion(GuardListModel, {
  attributes: { name: primitives.text() },
  indexes: [],
  version: '1.0.0',
});
const GuardUser = models.makeVersion(
  models.makeModel({ name: 'guardUser', abbreviation: 'gus' }),
  {
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
);
const renameGuardList = contracts.makeVersion(
  contracts.makeCommand('renameGuardList'),
  {
    payload: {
      id: primitives.foreignKey({ abbreviation: GuardListModel.abbreviation }),
      name: primitives.text(),
    },
    guard: ({
      db,
      payload,
    }: {
      db: Readonly<
        Pick<
          IDb<
            IResourceDbConfig<
              { guardList: typeof GuardList; guardUser: typeof GuardUser },
              Record<never, never>
            >
          >,
          'query'
        >
      >;
      payload: { id: ReturnType<typeof GuardList.prefixId>; name: string };
    }) => {
      db.query.guardList
        .findFirst({ where: { id: { eq: payload.id } } })
        .sync();
      void db.query.guardUser;
      // @ts-expect-error — authored guard databases expose no mutation API
      void db.insert;
      // @ts-expect-error — authored guard databases expose no raw SQL API
      void db.run;
      // @ts-expect-error — authored guard databases expose no transaction API
      void db.transaction;
      // @ts-expect-error — authored guard databases expose no underlying client
      void db.$client;
      return Effect.void;
    },
    models: { guardList: GuardList },
    program: ({ payload, models }) =>
      Effect.all({
        updated: models.guardList.update({
          resourceId: payload.id,
          attributes: { name: payload.name },
        }),
      }),
    version: '1.0.0',
  },
);
const guardedController = makeFrontendController({
  aggregateVersion: '1.0.0',
  systemName: 'guard-type-test',
  aggregateName: 'account',
  name: 'web',
  contracts: {
    renameGuardList: {
      contract: renameGuardList,
    },
  },
  models: { guardList: GuardList, guardUser: GuardUser },
});
const retainedGuard =
  guardedController.contracts.renameGuardList.contract.guard;
void retainedGuard;

function assertReadonlyContractBinding(
  frontend: typeof guardedController,
): void {
  // @ts-expect-error canonical contract bindings are readonly
  frontend.contracts.renameGuardList.contract.guard = () => Effect.void;
}
void assertReadonlyContractBinding;

const guardedControllerSpec = makeFrontendControllerSpec(guardedController);

function assertReadonlyFrontendControllerSpec(
  spec: typeof guardedControllerSpec,
): void {
  // @ts-expect-error generated spec fields are readonly
  spec.name = 'other';
  // @ts-expect-error generated model registries are readonly
  spec.models.other = spec.models.guardList;
  // @ts-expect-error generated contract registries are readonly
  spec.contracts.other = spec.contracts.renameGuardList;
  // @ts-expect-error generated aggregate locks are readonly
  spec.aggregateFrontendLock.frontendName = 'other';
  // @ts-expect-error generated aggregate lock model registries are readonly
  spec.aggregateFrontendLock.models.other =
    spec.aggregateFrontendLock.models.guardList;
  // @ts-expect-error generated aggregate lock contract registries are readonly
  spec.aggregateFrontendLock.contracts.other =
    spec.aggregateFrontendLock.contracts.renameGuardList;

  const model = spec.models.guardList;
  if (model !== undefined) {
    // @ts-expect-error generated model entries are readonly
    model.modelName = 'other';
    // @ts-expect-error generated model index arrays are readonly
    model.indexes.push({ name: 'other', columns: [] });
    const property = model.properties.name;
    if (property !== undefined) {
      // @ts-expect-error encoded property records are readonly
      property.kind = 'other';
    }
  }

  const contract = spec.contracts.renameGuardList;
  if (contract !== undefined) {
    // @ts-expect-error generated contract entries are readonly
    contract.commandName = 'other';
    // @ts-expect-error generated payload shape maps are readonly
    contract.payloadShape.other = {
      kind: PrimitiveKind.Text,
      nullable: false,
      unique: false,
    };
  }
}
void assertReadonlyFrontendControllerSpec;
