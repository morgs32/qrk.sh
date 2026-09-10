import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema } from 'effect';
import { expect, it, vi } from 'vitest';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

import { executeAggregateCommand } from './executeAggregateCommand.js';

vi.mock(
  '../../VersionedAggregateRepo/VersionedAggregateRepo.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../VersionedAggregateRepo/VersionedAggregateRepo.js')
      >();

    Object.assign(actual.VersionedAggregateRepo, {
      getRepo: ({ key }: { key: { aggregateVersion: string } }) =>
        Effect.succeed({
          execute: async () => ({
            _tag: 'Success',
            success: {
              id: 'cmd_retry',
              commandName: 'createUser',
              payload: '{}',
              contractVersion: '1.0.0',
              aggregateId: 'acct_test',
              aggregateVersion: key.aggregateVersion,
              aggregateName: 'user',
              systemName: 'system-worker',
              userId: null,
              sessionId: null,
              frontendName: null,
              pushIndex: null,
              aggregateIndex: 1,
              chainedAt: new Date(1),
              delta: null,
              dispositionHash: 'a'.repeat(64),
              failedAt: null,
              failure: null,
            },
          }),
        }),
    });
    return actual;
  },
);
it('reuses admission and the explicitly selected version on direct retries', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const command = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
    id: 'cmd_retry',
    commandName: 'createUser',
    payload: '{}',
    contractVersion: '1.0.0',
    aggregateId: 'acct_test',
    aggregateVersion: '1.0.0',
    aggregateName: 'user',
    systemName: 'system-worker',
    userId: null,
    sessionId: null,
    frontendName: null,
    pushIndex: null,
  });
  const props = {
    aggregateVersion: '1.0.0',
    command,
    db,
    key: {
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
    },
  };
  const before = await Effect.runPromise(
    executeAggregateCommand(props).pipe(Effect.provide(AsyncLive)),
  );
  expect(before.failure).toBeNull();
  expect(before.aggregateVersion).toBe('1.0.0');
  const after = await Effect.runPromise(
    executeAggregateCommand(props).pipe(Effect.provide(AsyncLive)),
  );
  expect(after).toEqual(before);
  expect(
    db.select().from(aggregateChainDbConfig.schema.admittedCommands).all(),
  ).toHaveLength(1);
});
