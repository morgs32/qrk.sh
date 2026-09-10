import { it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { describe, expect } from 'vitest';

import { contracts } from '../contracts/index.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';
import { TraceLoggerLayer } from '../test-utils/TraceLoggerLayer.ts';
import { ErrorLayer } from '../utils/ErrorLayer.ts';
import { makeAggregateId } from '../utils/makeAggregateId.ts';

import { makeAggregateCommand } from './makeAggregateCommand.ts';

const renameUser = contracts.makeVersion(contracts.makeCommand('renameUser'), {
  version: '1.0.0',
  payload: { name: primitives.text() },
});

const TestLayer = Layer.mergeAll(
  makePrefixedIncrementalIdFactory('makeAggregateCommand'),
  ErrorLayer,
  TraceLoggerLayer,
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
            aggregateVersion: '2.0.0',
            systemName: 'shopping',
            payload: { name: 'Ada' },
          });

          expect(command).toMatchObject({
            commandName: 'renameUser',
            aggregateId,
            aggregateName: 'user',
            aggregateVersion: '2.0.0',
            systemName: 'shopping',
            payload: { name: 'Ada' },
            userId: null,
            sessionId: null,
            frontendName: null,
            pushIndex: null,
          });
          expect(command).not.toHaveProperty('commandType');
        }),
    );
  });
});
