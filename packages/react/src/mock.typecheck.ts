import {
  authenticationSignature,
  List,
  main,
  User,
} from '@zerospin/core/fixtures/system';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAnyError } from '@zerospin/error';
import { Effect, type Layer } from 'effect';

import { makeZerospinApp } from './makeZerospinApp';
import { makeMockProvider } from './mock';

declare const sessionRuntimeLayer: Layer.Layer<
  PublishableKey | ZerospinApiUrl,
  IAnyError
>;

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',
  authentication: {
    version: authenticationSignature.version,
    signature: authenticationSignature.signature,
  },
  frontends: {
    main,
  },
  layer: sessionRuntimeLayer,
});
const MockMainProvider = makeMockProvider({
  frontend: ZerospinApp.frontends.main,
  layer: sessionRuntimeLayer,
});
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  aggregateIds: { user: 'acct_1' },
  userId: 'user_1',
  resources: {
    user: [
      {
        userId: 'user_1',
        createdAt: fixtureDate,
        id: 'usr_1',
        modelName: User.modelName,
        name: 'User 1',
        updatedAt: fixtureDate,
        version: User.version,
      },
    ],
    list: [
      {
        createdAt: fixtureDate,
        id: 'lst_1',
        modelName: List.modelName,
        name: 'List 1',
        updatedAt: fixtureDate,
        userId: 'usr_1',
        version: List.version,
      },
    ],
  },
});

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  aggregateIds: { user: 'acct_1' },
  userId: 'user_1',
});

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  aggregateIds: { user: 'acct_1' },
  userId: 'user_1',
  resources: {
    // @ts-expect-error Mock resources only accept the frontend's model keys.
    missing: [],
  },
});

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  aggregateIds: { user: 'acct_1' },
  userId: 'user_1',
  resources: {
    user: [
      {
        createdAt: fixtureDate,
        id: 'lst_wrong_model',
        // @ts-expect-error A list row cannot be supplied under the user model key.
        modelName: List.modelName,
        name: 'Wrong model',
        updatedAt: fixtureDate,
        userId: 'usr_1',
        version: List.version,
      },
    ],
  },
});

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  // @ts-expect-error aggregateIds must contain the configured aggregate name.
  aggregateIds: {},
  userId: 'user_1',
});

MockMainProvider({
  children: null,
  generateSignature: () => Effect.succeed({ userId: 'user_1' }),
  aggregateIds: { user: 'acct_1' },
  userId: 'user_1',
});
