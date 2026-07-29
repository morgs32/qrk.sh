import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeModel } from '../models/makeModel.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';

import { makeServiceFrontendController } from './makeServiceFrontendController.ts';
import { makeServiceFrontendControllerSpec } from './makeServiceFrontendControllerSpec.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'prd',
      modelName: 'product',
      attributes: {
        name: primitives.text(),
      },
      indexes: [],
      version: '1.0.0',
    },
  ],
);

const OtherServiceProduct = makeServiceModel(
  {
    serviceName: 'other',
    abbreviation: 'oprd',
    modelName: 'otherProduct',
    attributes: {},
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const AccountProduct = makeModel(
  {
    abbreviation: 'aprd',
    modelName: 'accountProduct',
    attributes: {},
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const catalog = makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '3.0.0',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

const systemName: 'shopping' = catalog.systemName;
const serviceName: 'app' = catalog.serviceName;
const actorName: 'shopper' = catalog.actorName;
const frontendName: 'catalog' = catalog.frontendName;
const version: '3.0.0' = catalog.version;
void systemName;
void serviceName;
void actorName;
void frontendName;
void version;
assert<
  Equals<
    Schema.Schema.Type<typeof catalog.signature>['subject'],
    string
  >
>();

assert<Equals<keyof typeof catalog.models, 'product'>>();
void catalog.models.product;
// @ts-expect-error — only explicitly projected models are exposed
void catalog.models.otherProduct;
// @ts-expect-error — service frontends have no contracts
void catalog.contracts;
// @ts-expect-error — service frontends have no query surface
void catalog.queries;
// @ts-expect-error — service frontends have no command constructor
void catalog.makeUnstagedCommand;

const catalogSpec = makeServiceFrontendControllerSpec(catalog);
const specServiceName: 'app' = catalogSpec.serviceName;
const specActorName: 'shopper' = catalogSpec.actorName;
const specFrontendName: 'catalog' = catalogSpec.frontendName;
const specVersion: '3.0.0' = catalogSpec.version;
void specServiceName;
void specActorName;
void specFrontendName;
void specVersion;
void catalogSpec.models.product.properties;
void catalogSpec.signatureJsonSchema;
// @ts-expect-error — the client-safe spec omits the redundant system name
void catalogSpec.systemName;

// @ts-expect-error — models is explicit even when the registry is empty
makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'identity',
  version: '1.0.0',
  signature: Schema.Struct({ subject: Schema.String }),
});

// @ts-expect-error — version is required at the factory call site
makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  models: { product: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  // @ts-expect-error CoreTypeError — registry keys equal modelName
  models: { wrong: Product },
  signature: Schema.Struct({ subject: Schema.String }),
});

makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  // @ts-expect-error — every frontend model belongs to its named service
  models: { otherProduct: OtherServiceProduct },
  signature: Schema.Struct({ subject: Schema.String }),
});

makeServiceFrontendController({
  systemName: 'shopping',
  serviceName: 'app',
  actorName: 'shopper',
  frontendName: 'catalog',
  version: '1.0.0',
  // @ts-expect-error — account-owned models are not service frontend models
  models: { accountProduct: AccountProduct },
  signature: Schema.Struct({ subject: Schema.String }),
});
