import { it } from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { makeFrontendController } from '../frontendController/makeFrontendController.ts';
import { makeModel } from '../models/makeModel.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';

import { makeUnstagedCommand } from './makeUnstagedCommand.ts';

const User = makeModel(
  {
    abbreviation: 'usr',
    modelName: 'user',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Widget = makeModel(
  {
    abbreviation: 'wdg',
    modelName: 'widget',
    attributes: {
      title: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createWidget = makeContract({
  commandName: 'createWidget',
  payload: {
    id: Widget.primaryKey({ autogenerate: true }),
    title: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Widget.createMutation('1.0.0'),
  }),
  program: ({ payload }) => {
    const { id, title } = payload;
    return Effect.all({
      created: Widget.create('1.0.0', {
        resourceId: id,
        attributes: { title },
      }),
    });
  },
  version: '1.0.0',
});

const Account = makeModel(
  {
    abbreviation: 'acct',
    modelName: 'account',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const widgetFrontend = makeFrontendController({
  actorName: 'widget',
  frontendName: 'default',
  version: '1.0.0',
  systemName: 'test',
  models: { account: Account, user: User, widget: Widget },
  contracts: {
    createWidget,
  },
  signature: Schema.Struct({}),
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeUnstagedCommandAutogenerate'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeUnstagedCommand id autogenerate', () => {
  it.layer(TestLayer)(it => {
    it.effect('fills null id from model abbreviation', () => {
      return Effect.gen(function* () {
        const cmd = yield* makeUnstagedCommand({
          accountId: 'acct_1',
          actorId: 'usr_1',
          frontend: widgetFrontend,
          commandName: 'createWidget',
          payload: {
            id: null,
            title: 'Hello',
          },
          sessionId: 'sesn_1',
          systemVersion: '1.0.0',
        });

        expect(cmd.payload.id).toMatch(/^wdg_/);
        expect(cmd.payload.title).toBe('Hello');
      });
    });

    it.effect('fills omitted id from model abbreviation', () => {
      return Effect.gen(function* () {
        const validatedPayload = yield* createWidget.validatePayload({
          payload: {
            title: 'Hello',
          },
        });

        expect(validatedPayload.id).toMatch(/^wdg_/);
        expect(validatedPayload.title).toBe('Hello');
      });
    });

    it.effect('keeps a provided id', () => {
      return Effect.gen(function* () {
        const validatedPayload = yield* createWidget.validatePayload({
          payload: {
            id: 'wdg_provided',
            title: 'Hello',
          },
        });

        expect(validatedPayload.id).toBe('wdg_provided');
      });
    });
  });
});
