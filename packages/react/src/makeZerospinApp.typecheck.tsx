import { authenticationSignature, main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { models } from '@zerospin/core/models/index';
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
  serviceVersion: '1.0.0',
  systemName: 'system-worker',
  serviceName: 'catalog',
  name: 'products',
  models: {},
});

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: {
    version: '1.0.0',
    signature: authenticationSignature.signature,
  },
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
    aggregateIds={{ main: 'acct_1' }}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void exactProvider;

const providerWithoutDeclaredUser = (
  <ZerospinApp.Provider
    aggregateIds={{ main: 'acct_1' }}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void providerWithoutDeclaredUser;

const missingAggregateTarget = (
  <ZerospinApp.Provider
    // @ts-expect-error — aggregateIds must contain each configured aggregate frontend name.
    aggregateIds={{}}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void missingAggregateTarget;

const wrongAuthenticationSignature = (
  <ZerospinApp.Provider
    aggregateIds={{ main: 'acct_1' }}
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
  authentication: {
    version: authenticationSignature.version,
    signature: authenticationSignature.signature,
  },
  frontends: {
    // @ts-expect-error — configured key must equal the controller name.
    wrong: main,
  },
  layer: sessionRuntimeLayer,
});
void mismatchedFrontendKey;

const mismatchedSystem = makeZerospinApp({
  systemName: 'another-system',
  authentication: {
    version: authenticationSignature.version,
    signature: authenticationSignature.signature,
  },
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
  authentication: {
    version: authenticationSignature.version,
    signature: authenticationSignature.signature,
  },
  frontends: {},
  layer: sessionRuntimeLayer,
});
void emptyFrontends;

const VersionedProduct = models.makeVersion(
  models.makeModel({ name: 'versionedProduct', abbreviation: 'vprd' }),
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
  serviceVersion: '1.0.0',
  systemName: 'historical-app',
  serviceName: 'catalog',
  name: 'service-products',
  models: { versionedProduct: VersionedProduct },
});
const historicalAggregateProducts = makeFrontendController({
  aggregateVersion: '1.0.0',
  systemName: 'historical-app',
  aggregateName: 'account',
  name: 'aggregate-products',
  contracts: {},
  models: { versionedProduct: VersionedProductReplica },
});
const historicalApp = makeZerospinApp({
  systemName: 'historical-app',
  authentication: {
    version: authenticationSignature.version,
    signature: authenticationSignature.signature,
  },
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
    true
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
  authentication: authenticationSignature,
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
  authentication: authenticationSignature,
  frontends: { request: requiresRequestInit },
  layer: withRequestInit,
});
makeZerospinApp({
  systemName: 'system-worker',
  authentication: authenticationSignature,
  frontends: { request: requiresRequestInit },
  layer: Layer.mergeAll(
    sessionRuntimeLayer,
    Layer.succeed(ApiRequestInit, { getRequestInit: () => ({}) }),
  ),
});

const obsoleteAggregateKey = (
  <ZerospinApp.Provider
    // @ts-expect-error aggregate names are not frontend-name keys.
    aggregateIds={{ user: 'acct_1' }}
    generateSignature={() => Effect.succeed({ userId: 'usr_1' })}
  >
    {null}
  </ZerospinApp.Provider>
);
void obsoleteAggregateKey;
