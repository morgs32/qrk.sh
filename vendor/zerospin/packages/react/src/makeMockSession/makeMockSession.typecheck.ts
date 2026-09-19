import { aggregateFrontendProps } from '@zerospin/core/fixtures/frontendProps';
import { List, main, User } from '@zerospin/core/fixtures/system';
import type { PublishableKey } from '@zerospin/core/services/PublishableKey';
import type { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAnyError } from '@zerospin/error';
import { type Layer } from 'effect';

import { makeAggregateFrontend } from '../makeAggregateFrontend/makeAggregateFrontend';
import { makeRuntime } from '../makeRuntime/makeRuntime';
import { makeMockSession } from './makeMockSession';

declare const sessionRuntimeLayer: Layer.Layer<
  PublishableKey | ZerospinApiUrl,
  IAnyError
>;

const runtime = makeRuntime({ layer: sessionRuntimeLayer });
const Main = makeAggregateFrontend(aggregateFrontendProps(main));
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');

makeMockSession({
  frontend: Main,
  runtime,
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

makeMockSession({
  frontend: Main,
  runtime,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
});

makeMockSession({
  // @ts-expect-error Mock resources only accept the frontend's model keys.
  frontend: Main,
  runtime,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
  resources: {
    missing: [],
  },
});

makeMockSession({
  // @ts-expect-error A list ID cannot be supplied under the user model key.
  frontend: Main,
  runtime,
  authentication: { userId: 'user_1', aggregateId: 'acct_1' },
  resources: {
    user: [
      {
        createdAt: fixtureDate,
        id: 'lst_wrong_model',
        modelName: List.modelName,
        name: 'Wrong model',
        updatedAt: fixtureDate,
        version: List.version,
      },
    ],
  },
});

makeMockSession({
  // @ts-expect-error Full authentication requires an aggregateId.
  frontend: Main,
  runtime,
  authentication: { userId: 'user_1' },
});

makeMockSession({
  // @ts-expect-error Authentication fields retain their declared types.
  frontend: Main,
  runtime,
  authentication: { userId: 123, aggregateId: 'acct_1' },
});
