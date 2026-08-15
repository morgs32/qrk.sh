import { it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { TestContext } from 'effect/TestContext';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { primitives } from '../models/primitives.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';
import { makeAggregateId } from '../utils/makeAggregateId.ts';

import { makeAggregateCommand } from './makeAggregateCommand.ts';

const renameUser = makeContract({
  commandName: 'renameUser',
  version: '1.0.0',
  payload: { name: primitives.text() },
  mutations: null,
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeAggregateCommand'),
  ErrorLayer,
  TraceLoggerLayer,
  TestContext,
);

describe('makeAggregateCommand', () => {
  it.layer(TestLayer)(it => {
    it.effect(
      'builds an aggregate command with nullable provenance defaults',
      () =>
        Effect.gen(function* () {
          const aggregateId = makeAggregateId({ id: 'user-1' });
          const command = yield* makeAggregateCommand({
            contract: renameUser,
            aggregateId,
            aggregateName: 'user',
            systemName: 'shopping',
            payload: { name: 'Ada' },
          });

          expect(command).toMatchObject({
            commandType: 'aggregate',
            commandName: 'renameUser',
            aggregateId,
            aggregateName: 'user',
            systemName: 'shopping',
            payload: { name: 'Ada' },
            userId: null,
            sessionId: null,
            frontendName: null,
            pushedCursor: null,
          });
        }),
    );

    it.effect('preserves explicit frontend provenance', () =>
      Effect.gen(function* () {
        const command = yield* makeAggregateCommand({
          contract: renameUser,
          aggregateId: makeAggregateId({ id: 'user-2' }),
          aggregateName: 'user',
          systemName: 'shopping',
          userId: 'shopper',
          sessionId: 'sesn_browser',
          frontendName: 'web',
          pushedCursor: 'pcur_4',
          payload: { name: 'Grace' },
        });

        expect(command).toMatchObject({
          userId: 'shopper',
          sessionId: 'sesn_browser',
          frontendName: 'web',
          pushedCursor: 'pcur_4',
        });
      }),
    );
  });
});
