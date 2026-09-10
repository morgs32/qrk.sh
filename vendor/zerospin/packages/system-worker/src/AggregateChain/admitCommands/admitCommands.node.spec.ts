import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { asc, sql } from 'drizzle-orm';
import { Effect, Result, Schema } from 'effect';
import { expect, it, vi } from 'vitest';

import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

import { admitCommands } from './admitCommands.js';

it('admits exact retries once, preserves the complete input, and rejects changed bytes without allocating another index', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const command = {
    ...Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: 'cmd_admit',
      commandName: 'not-yet-prepared',
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
    }),
    extraProvenance: { retained: true },
  };
  const props = {
    db,
    key: {
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
    },
    commands: [command],
  };
  const first = Effect.runSync(admitCommands(props));
  expect(Effect.runSync(admitCommands(props))).toEqual(first);
  expect(first).toEqual([{ aggregateIndex: 1, commandId: command.id }]);
  const rows = db
    .select()
    .from(aggregateChainDbConfig.schema.admittedCommands)
    .all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]!.command)).toEqual(command);
  const conflict = Effect.runSync(
    admitCommands({
      ...props,
      commands: [{ ...command, payload: '{"changed":true}' }],
    }).pipe(Effect.result),
  );
  expect(Result.isFailure(conflict)).toBe(true);
  expect(
    db.select().from(aggregateChainDbConfig.schema.admittedCommands).all(),
  ).toHaveLength(1);
});

it('rolls back the complete batch on insertion failure and retries without gaps or duplicates', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const commands = [1, 2, 3].map(index =>
    Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: `cmd_atomic_${index}`,
      commandName: 'test',
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
    }),
  );
  // FAIL leaves the inserted row in the transaction; the writer must roll it back.
  db.run(sql`CREATE TRIGGER fail_second_admission AFTER INSERT ON admittedCommands
    WHEN NEW.commandId = 'cmd_atomic_2'
    BEGIN SELECT RAISE(FAIL, 'injected admission failure'); END`);
  const admission = admitCommands({
    db,
    commands,
    key: {
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
    },
  });
  const result = Effect.runSync(admission.pipe(Effect.result));
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isFailure(result)) {
    expect(result.failure.code).toBe('aggregate-admission-failed');
  }
  expect(
    db
      .select({
        index: aggregateChainDbConfig.schema.admittedCommands.aggregateIndex,
        id: aggregateChainDbConfig.schema.admittedCommands.commandId,
      })
      .from(aggregateChainDbConfig.schema.admittedCommands)
      .orderBy(
        asc(aggregateChainDbConfig.schema.admittedCommands.aggregateIndex),
      )
      .all(),
  ).toEqual([]);
  db.run(sql`DROP TRIGGER fail_second_admission`);
  Effect.runSync(admission);
  Effect.runSync(admission);
  expect(
    db
      .select({
        index: aggregateChainDbConfig.schema.admittedCommands.aggregateIndex,
        id: aggregateChainDbConfig.schema.admittedCommands.commandId,
      })
      .from(aggregateChainDbConfig.schema.admittedCommands)
      .orderBy(
        asc(aggregateChainDbConfig.schema.admittedCommands.aggregateIndex),
      )
      .all(),
  ).toEqual([
    { index: 1, id: 'cmd_atomic_1' },
    { index: 2, id: 'cmd_atomic_2' },
    { index: 3, id: 'cmd_atomic_3' },
  ]);
});

it('returns an empty batch without opening a transaction', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const transaction = vi.spyOn(db, 'transaction');
  expect(
    Effect.runSync(
      admitCommands({
        db,
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_test',
          aggregateName: 'user',
        },
        commands: [],
      }),
    ),
  ).toEqual([]);
  expect(transaction).not.toHaveBeenCalled();
});

it.each([
  'same-id',
  'conflicting-id',
  'retained-conflict',
  'wrong-target',
  'invalid-command',
])('handles %s across the complete batch', async scenario => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: aggregateChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const key = {
    systemId: 'sys_test',
    aggregateId: 'acct_test',
    aggregateName: 'user',
  };
  const first = Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
    id: 'cmd_first',
    commandName: 'test',
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
  const existing = { ...first, id: 'cmd_existing' };
  Effect.runSync(admitCommands({ db, key, commands: [existing] }));
  const second = { ...first };
  if (scenario === 'conflicting-id') {
    second.payload = '{"changed":true}';
  }
  if (scenario === 'retained-conflict') {
    second.id = existing.id;
    second.payload = '{"changed":true}';
  }
  if (scenario === 'wrong-target') {
    second.aggregateId = 'acct_wrong';
  }
  // Corrupt the runtime input deliberately without weakening the production type.
  if (scenario === 'invalid-command') {
    Object.defineProperty(second, 'id', { value: 'invalid' });
  }
  const props = { db, key, commands: [first, second] };
  const result = Effect.runSync(admitCommands(props).pipe(Effect.result));
  const rows = db
    .select()
    .from(aggregateChainDbConfig.schema.admittedCommands)
    .orderBy(asc(aggregateChainDbConfig.schema.admittedCommands.aggregateIndex))
    .all();
  if (scenario === 'same-id') {
    expect(result).toEqual(
      Result.succeed([
        { aggregateIndex: 2, commandId: first.id },
        { aggregateIndex: 2, commandId: first.id },
      ]),
    );
    expect(Effect.runSync(admitCommands(props).pipe(Effect.result))).toEqual(
      result,
    );
    expect(rows.map(row => row.commandId)).toEqual([existing.id, first.id]);
  } else {
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        scenario === 'wrong-target'
          ? 'aggregate-chain-target-mismatch'
          : scenario === 'invalid-command'
            ? 'aggregate-chain-command-invalid'
            : 'aggregate-chain-command-conflict',
      );
    }
    expect(rows.map(row => row.commandId)).toEqual([existing.id]);
    expect(
      Effect.runSync(admitCommands({ db, key, commands: [existing, first] })),
    ).toEqual([
      { aggregateIndex: 1, commandId: existing.id },
      { aggregateIndex: 2, commandId: first.id },
    ]);
  }
});
