import { Effect } from 'effect';

import { primitives } from '../models/primitives.ts';

import { makeContract } from './makeContract.ts';

makeContract(
  {
    commandName: 'renameItem',
    version: '2.0.0',
    payload: { title: primitives.text() },
    mutations: null,
  },
  [
    {
      commandName: 'renameItem',
      version: '1.0.0',
      payload: { name: primitives.text() },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ title: payload.name }),
    },
  ],
);

makeContract(
  {
    commandName: 'renameItem',
    version: '2.0.0',
    payload: { title: primitives.text() },
    mutations: null,
  },
  [
    {
      // @ts-expect-error historical commandName must equal the current commandName
      commandName: 'renameSomethingElse',
      version: '1.0.0',
      payload: { name: primitives.text() },
      adaptPayload: ({ payload }) =>
        Effect.succeed({ title: payload.name }),
    },
  ],
);

makeContract(
  {
    commandName: 'renameItem',
    version: '2.0.0',
    payload: { title: primitives.text() },
    mutations: null,
  },
  [
    {
      commandName: 'renameItem',
      version: '1.0.0',
      payload: { name: primitives.text() },
      // @ts-expect-error adapter output must be valid input for the current payload
      adaptPayload: ({ payload }) =>
        Effect.succeed({ nextTitle: payload.name }),
    },
  ],
);
