import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { addItem, cart } from '../../fixtures/shopping.js';
import { defineModel } from '../../models/defineModel.js';
import {
  captureActorSelections,
  makeActorDbVersion,
} from '../../models/make/makeActorDbVersion.js';
import { makeModelVersion } from '../../models/make/makeModelVersion.js';
import { makeState } from '../makeState/makeState.js';

import { execute, makeMachine, push } from './makeMachine.js';

const source = cart;
const Idle = makeState({ stateName: 'idle', input: { count: Schema.Int } });
const Waiting = makeState({ stateName: 'waiting', input: { at: Schema.Int } });
const Sending = makeState({
  stateName: 'sending',
  input: { listId: makeAbbreviationIdSchema('cit') },
});
const Pushing = makeState({
  stateName: 'pushing',
  input: { listId: makeAbbreviationIdSchema('cit') },
});

const machine = makeMachine({
  source,
  selections: {},
  contracts: { addItem: { contract: addItem, target: source } },
  states: { idle: Idle, waiting: Waiting, sending: Sending, pushing: Pushing },
  onBootstrap: () => Idle.make({ count: 0 }),
  routes: {
    idle: {
      onCommand: ({ origin }) => Idle.make({ count: origin.count + 1 }),
      onActivation: ({ origin }) =>
        Effect.succeed(Waiting.make({ at: origin.count + 1 })),
    },
    waiting: {
      wakeAt: ({ origin }) => origin.at,
      onWake: ({ origin }) => {
        void origin.at;
        // @ts-expect-error The waiting route sees only waiting State fields.
        void origin.count;
        return Sending.make({ listId: 'cit_1' });
      },
    },
    sending: {
      command: ({ origin }) =>
        execute({
          binding: 'addItem',
          aggregateId: 'agg_1',
          payload: { id: origin.listId, productId: 'product', quantity: 1 },
        }),
      onResult: ({ result }) => {
        if ('execution' in result) void result.execution;
        else void result.accepted;
        return Idle.make({ count: 1 });
      },
    },
    pushing: {
      command: ({ origin }) =>
        push({
          binding: 'addItem',
          aggregateId: 'agg_1',
          payload: { id: origin.listId, productId: 'product', quantity: 1 },
        }),
      onResult: ({ result }) => {
        if ('accepted' in result) void result.accepted;
        else void result.execution;
        return Idle.make({ count: 1 });
      },
    },
  },
});

void machine;

const foreign = makeModelVersion(
  defineModel({ name: 'foreign', abbreviation: 'for' }),
  { version: '1.0.0', attributes: {}, indexes: [] },
);
const foreignDb = makeActorDbVersion({ models: { foreign } });
const foreignSelections = captureActorSelections(
  foreignDb,
  { foreign: foreignDb.query.foreign.findMany() },
  Schema.Struct({}),
);
makeMachine({
  source,
  // @ts-expect-error Selection models must belong to the source version.
  selections: foreignSelections,
  contracts: { addItem: { contract: addItem, target: source } },
  states: { idle: Idle },
  onBootstrap: () => Idle.make({ count: 0 }),
  routes: {},
});

makeMachine({
  source,
  selections: {},
  contracts: { addItem: { contract: addItem, target: source } },
  states: { idle: Idle, waiting: Waiting },
  onBootstrap: () => Idle.make({ count: 0 }),
  routes: {
    waiting: {
      wakeAt: ({ origin }) => origin.at,
      onWake: () => Idle.make({ count: 0 }),
      // @ts-expect-error Automatic work forms are mutually exclusive.
      onActivation: () => Effect.succeed(Idle.make({ count: 0 })),
    },
  },
});

makeMachine({
  source,
  selections: {},
  contracts: { addItem: { contract: addItem, target: source } },
  states: { idle: Idle, sending: Sending },
  onBootstrap: () => Idle.make({ count: 0 }),
  routes: {
    sending: {
      command: () =>
        // @ts-expect-error Commands may use only declared contract bindings.
        execute({ binding: 'other', aggregateId: 'agg_1', payload: {} }),
      onResult: () => Idle.make({ count: 0 }),
    },
  },
});

makeMachine({
  source,
  selections: {},
  contracts: { addItem: { contract: addItem, target: source } },
  states: { idle: Idle, sending: Sending },
  onBootstrap: () => Idle.make({ count: 0 }),
  routes: {
    sending: {
      command: () =>
        // @ts-expect-error Bound contract payloads retain their field types.
        execute({
          binding: 'addItem',
          aggregateId: 'agg_1',
          payload: { id: 'cit_1', productId: 42, quantity: 1 },
        }),
      onResult: () => Idle.make({ count: 0 }),
    },
  },
});
