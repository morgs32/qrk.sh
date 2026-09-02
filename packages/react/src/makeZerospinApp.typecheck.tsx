import { authenticationSignature, main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel } from '@zerospin/core/models/makeModel';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import type { InferResource } from '@zerospin/core/models/types';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';
import type { ISessionProviderRuntime } from './types';

declare const sessionRuntime: ISessionProviderRuntime;

const products = makeFrontendController({
  systemName: 'system-worker',
  serviceName: 'catalog',
  frontendName: 'products',
  models: {},
});

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: {
    signature: authenticationSignature,
    version: '1.0.0',
  },
  frontends: {
    main: { controller: main },
    products: { controller: products },
  },
  runtime: sessionRuntime,
});

const exactProvider = (
  <ZerospinApp.Provider
    // @ts-expect-error — production Provider identity is returned by frontend bootstrap.
    userId="user_1"
    aggregateIds={{ user: 'acct_1' }}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void exactProvider;

const providerWithoutDeclaredUser = (
  <ZerospinApp.Provider
    aggregateIds={{ user: 'acct_1' }}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void providerWithoutDeclaredUser;

const missingAggregateTarget = (
  <ZerospinApp.Provider
    // @ts-expect-error — aggregateIds must contain each configured aggregate name.
    aggregateIds={{}}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void missingAggregateTarget;

const wrongAuthenticationSignature = (
  <ZerospinApp.Provider
    aggregateIds={{ user: 'acct_1' }}
    generateSignature={() =>
      Effect.succeed({
        // @ts-expect-error — Provider signatures must match the selected universal signature.
        userId: 1,
      })
    }
  >
    {null}
  </ZerospinApp.Provider>
);
void wrongAuthenticationSignature;

const mismatchedFrontendKey = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {
    // @ts-expect-error — configured key must equal the controller frontendName.
    wrong: { controller: main },
  },
  runtime: sessionRuntime,
});
void mismatchedFrontendKey;

const mismatchedSystem = makeZerospinApp({
  systemName: 'another-system',
  authentication: { signature: authenticationSignature },
  frontends: {
    // @ts-expect-error — every configured controller must match makeZerospinApp.systemName.
    main: { controller: main },
  },
  runtime: sessionRuntime,
});
void mismatchedSystem;

const unknownModelSelection = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {
    main: {
      controller: main,
      models: {
        // @ts-expect-error — selections accept only controller model keys.
        missing: '1.0.0',
      },
    },
  },
  runtime: sessionRuntime,
});
void unknownModelSelection;

const unavailableModelVersion = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {
    main: {
      controller: main,
      models: {
        // @ts-expect-error — selections accept only retained exact versions.
        list: '9.0.0',
      },
    },
  },
  runtime: sessionRuntime,
});
void unavailableModelVersion;

const emptyFrontends = makeZerospinApp({
  systemName: 'system-worker',
  authentication: { signature: authenticationSignature },
  frontends: {},
  runtime: sessionRuntime,
});
void emptyFrontends;

const VersionedProduct = makeModel(
  {
    abbreviation: 'vprd',
    modelName: 'versionedProduct',
    attributes: {
      description: primitives.text(),
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
  [
    {
      abbreviation: 'vprd',
      modelName: 'versionedProduct',
      attributes: { name: primitives.text() },
      indexes: [],
      version: '1.0.0',
      adaptResource: ({ resource }) =>
        Effect.succeed({
          id: resource.id,
          modelName: resource.modelName,
          createdAt: resource.createdAt,
          updatedAt: resource.updatedAt,
          version: '1.0.0',
          name: resource.name,
        }),
    },
  ],
);
const VersionedProductReplica = makeReplica({
  sourceModel: VersionedProduct,
  serviceName: 'catalog',
});
const historicalServiceProducts = makeFrontendController({
  systemName: 'historical-app',
  serviceName: 'catalog',
  frontendName: 'service-products',
  models: { versionedProduct: VersionedProduct },
});
const historicalAggregateProducts = makeFrontendController({
  systemName: 'historical-app',
  aggregateName: 'account',
  frontendName: 'aggregate-products',
  contracts: {},
  models: { versionedProduct: VersionedProductReplica },
});
const historicalApp = makeZerospinApp({
  systemName: 'historical-app',
  authentication: { signature: authenticationSignature },
  frontends: {
    'aggregate-products': {
      controller: historicalAggregateProducts,
      models: { versionedProduct: '1.0.0' },
    },
    'service-products': {
      controller: historicalServiceProducts,
      models: { versionedProduct: '1.0.0' },
    },
  },
  runtime: sessionRuntime,
});
const selectedServiceProduct =
  historicalApp.frontends['service-products'].frontend.models.versionedProduct;
const selectedAggregateProduct =
  historicalApp.frontends['aggregate-products'].frontend.models
    .versionedProduct;

assert<Equals<typeof selectedServiceProduct.version, '1.0.0'>>();
assert<
  Equals<
    'deletedAt' extends keyof typeof selectedServiceProduct.propertiesShape
      ? true
      : false,
    false
  >
>();
assert<
  Equals<
    'sourceModel' extends keyof typeof selectedServiceProduct ? true : false,
    false
  >
>();
assert<
  Equals<
    'description' extends keyof typeof selectedServiceProduct.propertiesShape
      ? true
      : false,
    false
  >
>();
assert<Equals<typeof selectedAggregateProduct.version, '1.0.0'>>();
assert<Equals<typeof selectedAggregateProduct.serviceName, 'catalog'>>();
assert<Equals<typeof selectedAggregateProduct.sourceModel.version, '1.0.0'>>();
assert<
  Equals<
    'deletedAt' extends keyof typeof selectedAggregateProduct.propertiesShape
      ? true
      : false,
    true
  >
>();
assert<
  Equals<
    InferResource<typeof selectedAggregateProduct>['deletedAt'],
    Date | null
  >
>();
assert<
  Equals<
    'description' extends keyof typeof selectedAggregateProduct.propertiesShape
      ? true
      : false,
    false
  >
>();
