import { authenticationSignature, main } from '@zerospin/core/fixtures/system';
import { makeFrontendController } from '@zerospin/core/frontendController/makeFrontendController';
import { Effect } from 'effect';

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
    // @ts-expect-error — production Provider identity is returned by the SharedWorker.
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
