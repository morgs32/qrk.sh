import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Result, Schema, Semaphore } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  aggregateCommandChainDbConfig,
  aggregateCommandChainDrizzleSchemas,
} from '../AggregateCommandChainDbConfig.js';

import { receivePushedCommand } from './receivePushedCommand.js';

vi.mock(
  '../../MaterializedAggregateRepo/MaterializedAggregateRepo.js',
  async () => {
    const { Effect } = await import('effect');
    return {
      MaterializedAggregateRepo: {
        fixedDORepoConfig: {
          nameUtils: {
            makeName: Effect.fn('MaterializedAggregateRepo.makeTestName')(
              function* (key: {
                systemId: string;
                aggregateId: string;
                aggregateName: string;
              }) {
                yield* Effect.void;
                return `aggrepo_${key.systemId}/${key.aggregateId}/${key.aggregateName}`;
              },
            ),
          },
        },
      },
    };
  },
);

describe('AggregateCommandChain.receivePushedCommand', () => {
  it('idempotently acknowledges exact duplicate admission', async () => {
    const aggregateDb = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: aggregateCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const command = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: 'cmd_pushed_transfer',
      commandName: 'addItem',
      payload: '{"productId":"prd_test"}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_test',
      aggregateName: 'shopping',
      systemName: 'test',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'web',
      pushIndex: 1,
    });
    const admissionSemaphore = Effect.runSync(Semaphore.make(1));
    let alarmCount = 0;

    const admission = receivePushedCommand({
      admissionSemaphore,
      command,
      db: aggregateDb,
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'shopping',
      },
      storage: {
        setAlarm: () => {
          alarmCount += 1;
          return Promise.resolve();
        },
      },
    });
    await Effect.runPromise(admission.pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(admission.pipe(Effect.provide(AsyncLive)));

    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.commands)
        .all(),
    ).toHaveLength(1);
    expect(alarmCount).toBe(2);

    const conflict = await Effect.runPromise(
      receivePushedCommand({
        admissionSemaphore,
        command: { ...command, payload: '{"productId":"prd_other"}' },
        db: aggregateDb,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_test',
          aggregateName: 'shopping',
        },
        storage: { setAlarm: () => Promise.resolve() },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(conflict)).toBe(true);
    if (Result.isFailure(conflict)) {
      expect(conflict.failure.code).toBe(
        'aggregate-command-chain-pushed-command-conflict',
      );
    }
  });
});
