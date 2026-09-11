import { main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { makeModel, makeModelVersion } from '@zerospin/core/models/makeModel';
import { makeReplica } from '@zerospin/core/models/makeReplica';
import { ApiRequestInit } from '@zerospin/core/services/ApiRequestInit';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAnyError } from '@zerospin/error';
import { CuidFactory, primitives } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeZerospinApp } from './makeZerospinApp';

declare const sessionRuntimeLayer: Layer.Layer<
  PublishableKey | ZerospinApiUrl,
  IAnyError
>;

const products = makeFrontendController({
  authentication: main.authentication,
  serviceVersion: '1.0.0',
  systemName: 'system-worker',
  serviceName: 'catalog',
  name: 'products',
  models: {},
});

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',

  frontends: {
    main,
    products,
  },
  layer: sessionRuntimeLayer,
});

const exactProvider = (
  <ZerospinApp.Provider
    // @ts-expect-error — production Provider identity is returned by frontend bootstrap.
    userId="user_1"
    generateSignature={{
      main: () => Effect.succeed({ userId: 'usr_1' }),
      products: () => Effect.succeed({ userId: 'usr_1' }),
    }}
  >
    {null}
  </ZerospinApp.Provider>
);
void exactProvider;

const providerWithoutDeclaredUser = (
  <ZerospinApp.Provider
    generateSignature={{
      main: () => Effect.succeed({ userId: 'usr_1' }),
      products: () => Effect.succeed({ userId: 'usr_1' }),
    }}
  >
    {null}
  </ZerospinApp.Provider>
);
void providerWithoutDeclaredUser;

const missingSignature = (
  <ZerospinApp.Provider
    // @ts-expect-error Every frontend requires its own signature generator.
    generateSignature={{ main: () => Effect.succeed({ userId: 'usr_1' }) }}
  >
    {null}
  </ZerospinApp.Provider>
);
void missingSignature;
const wrongAuthenticationSignature = (
  <ZerospinApp.Provider
    generateSignature={{
      // @ts-expect-error Each signer must match its frontend's decoded signature schema.
      main: () => Effect.succeed({ userId: 1 }),
      products: () => Effect.succeed({ userId: 'usr_1' }),
    }}
  >
    {null}
  </ZerospinApp.Provider>
);
void wrongAuthenticationSignature;

const mismatchedFrontendKey = makeZerospinApp({
  systemName: 'system-worker',

  frontends: {
    // @ts-expect-error — configured key must equal the controller name.
    wrong: main,
  },
  layer: sessionRuntimeLayer,
});
void mismatchedFrontendKey;

const mismatchedSystem = makeZerospinApp({
  systemName: 'another-system',

  frontends: {
    // @ts-expect-error — every configured controller must match makeZerospinApp.systemName.
    main,
  },
  layer: sessionRuntimeLayer,
});
void mismatchedSystem;

assert<Equals<typeof ZerospinApp.frontends.main.frontend, typeof main>>();
assert<Equals<typeof ZerospinApp.frontends.main.models, typeof main.models>>();
assert<
  Equals<
    typeof ZerospinApp.frontends.main.frontend.contracts.createList.contract.version,
    '1.0.0'
  >
>();

const emptyFrontends = makeZerospinApp({
  systemName: 'system-worker',

  frontends: {},
  layer: sessionRuntimeLayer,
});
void emptyFrontends;

const VersionedProduct = makeModelVersion(
  makeModel({ name: 'versionedProduct', abbreviation: 'vprd' }),
  {
    attributes: {
      description: primitives.text(),
      name: primitives.text(),
    },
    indexes: [],
    version: '2.0.0',
  },
);
const VersionedProductReplica = makeReplica({
  sourceModel: VersionedProduct,
  modelVersion: VersionedProduct.version,
  serviceName: 'catalog',
});
const historicalServiceProducts = makeFrontendController({
  authentication: main.authentication,
  serviceVersion: '1.0.0',
  systemName: 'historical-app',
  serviceName: 'catalog',
  name: 'service-products',
  models: { versionedProduct: VersionedProduct },
});
const historicalAggregateProducts = makeFrontendController({
  authentication: main.authentication,
  aggregateVersion: '1.0.0',
  systemName: 'historical-app',
  aggregateName: 'account',
  name: 'aggregate-products',
  contracts: {},
  models: { versionedProduct: VersionedProductReplica },
});
const historicalApp = makeZerospinApp({
  systemName: 'historical-app',

  frontends: {
    'aggregate-products': historicalAggregateProducts,
    'service-products': historicalServiceProducts,
  },
  layer: sessionRuntimeLayer,
});
const selectedServiceProduct =
  historicalApp.frontends['service-products'].models.versionedProduct;
const selectedAggregateProduct =
  historicalApp.frontends['aggregate-products'].models.versionedProduct;

assert<Equals<typeof selectedServiceProduct.version, '2.0.0'>>();
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
    true
  >
>();
assert<Equals<typeof selectedAggregateProduct.version, '2.0.0'>>();
assert<Equals<typeof selectedAggregateProduct.serviceName, 'catalog'>>();
assert<Equals<typeof selectedAggregateProduct.sourceModel.version, '2.0.0'>>();
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
    'description' extends keyof typeof selectedAggregateProduct.propertiesShape
      ? true
      : false,
    true
  >
>();

const requiresRequestInit = makeFrontendController({
  authentication: main.authentication,
  systemName: 'system-worker',
  aggregateName: 'user',
  aggregateVersion: '1.0.0',
  name: 'request',
  models: {},
  contracts: {},
  layer: Layer.effect(
    CuidFactory,
    Effect.as(ApiRequestInit, () => Effect.succeed('id')),
  ),
});
makeZerospinApp({
  systemName: 'system-worker',

  // @ts-expect-error The application must supply inputs of a frontend-local layer.
  frontends: { request: requiresRequestInit },
  layer: sessionRuntimeLayer,
});
const withRequestInit = Layer.mergeAll(
  sessionRuntimeLayer,
  Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
);
makeZerospinApp({
  systemName: 'system-worker',

  frontends: { request: requiresRequestInit },
  layer: withRequestInit,
});
makeZerospinApp({
  systemName: 'system-worker',

  frontends: { request: requiresRequestInit },
  layer: Layer.mergeAll(
    sessionRuntimeLayer,
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
  ),
});

const obsoleteAggregateKey = (
  <ZerospinApp.Provider
    generateSignature={{
      // @ts-expect-error aggregate names are not frontend signer keys.
      user: () => Effect.succeed({ userId: 'usr_1' }),
      products: () => Effect.succeed({ userId: 'usr_1' }),
    }}
  >
    {null}
  </ZerospinApp.Provider>
);
void obsoleteAggregateKey;
