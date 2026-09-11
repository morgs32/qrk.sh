import { List, main, User } from '@zerospin/core/fixtures/system';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAnyError } from '@zerospin/error';
import { type Layer } from 'effect';

import { makeZerospinApp } from './makeZerospinApp';
import { makeMockProvider } from './mock';

declare const sessionRuntimeLayer: Layer.Layer<
  PublishableKey | ZerospinApiUrl,
  IAnyError
>;

const ZerospinApp = makeZerospinApp({
  systemName: 'system-worker',

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
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
  resources: {
    user: [
      {
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
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
});

MockMainProvider({
  children: null,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
  resources: {
    // @ts-expect-error Mock resources only accept the frontend's model keys.
    missing: [],
  },
});

MockMainProvider({
  children: null,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
  resources: {
    user: [
      {
        createdAt: fixtureDate,
        // @ts-expect-error A list ID cannot be supplied under the user model key.
        id: 'lst_wrong_model',
        modelName: List.modelName,
        name: 'Wrong model',
        updatedAt: fixtureDate,
        version: List.version,
      },
    ],
  },
});

MockMainProvider({
  children: null,
  // @ts-expect-error Full authentication requires an aggregateId.
  authentication: { userId: 'user_1' },
});

MockMainProvider({
  children: null,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
});

MockMainProvider({
  children: null,
  // @ts-expect-error Authentication fields retain their declared types.
  authentication: { userId: 123, aggregateId: 'acct_1' },
});
