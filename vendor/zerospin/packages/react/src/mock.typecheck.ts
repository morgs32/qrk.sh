import { List, main, User } from '@zerospin/core/fixtures/system';

import { makeReactFrontend } from './makeReactFrontend';
import { makeMockProvider } from './mock';

const ReactMain = makeReactFrontend({
  frontend: main,
});
const MockMainProvider = makeMockProvider({
  reactFrontend: ReactMain,
});
const fixtureDate = new Date('2026-01-01T00:00:00.000Z');

MockMainProvider({
  children: null,
  userId: 'user_1',
  accountId: 'acct_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker_1',
  resources: {
    user: [
      {
        actorId: 'actr_1',
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
  userId: 'user_1',
  accountId: 'acct_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker_1',
});

MockMainProvider({
  children: null,
  userId: 'user_1',
  accountId: 'acct_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker_1',
  resources: {
    // @ts-expect-error Mock resources only accept the frontend's model keys.
    missing: [],
  },
});

MockMainProvider({
  children: null,
  userId: 'user_1',
  accountId: 'acct_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker_1',
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

// @ts-expect-error accountId is required for initialized mock session state.
MockMainProvider({
  children: null,
  userId: 'user_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
  systemWorkerName: 'worker_1',
});

// @ts-expect-error systemWorkerName is required runtime identity.
MockMainProvider({
  children: null,
  userId: 'user_1',
  accountId: 'acct_1',
  actorId: 'actr_1',
  generationId: 'gen_1',
  systemVersion: '1.0.0',
});
