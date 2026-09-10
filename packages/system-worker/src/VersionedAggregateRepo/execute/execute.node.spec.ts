import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { Effect, Semaphore } from 'effect';
import initSqlJs from 'sql.js';
import { system } from 'system';
import { expect, expectTypeOf, it, vi } from 'vitest';

import { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import type { IFanoutRepo } from '../../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { executeCommands } from '../executeCommands/executeCommands.js';
import type { VersionedAggregateRepo } from '../VersionedAggregateRepo.js';
import {
  versionedAggregateRepoDbConfig,
  versionedAggregateRepoTables,
} from '../versionedAggregateRepoDbConfig.js';

import { execute } from './execute.js';
const inputs = vi.hoisted(
  (): {
    rows: {
      aggregateIndex: number;
      command: string;
      chainedAt: Date;
      commandId: string;
      canonicalBytes: string;
    }[];
    history: { outboxIndex: number; entry: string; executionVersion: string }[];
  } => ({ rows: [], history: [] }),
);
vi.mock('../../AggregateChain/AggregateChain.js', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('../../AggregateChain/AggregateChain.js')
    >();

  Object.assign(actual.AggregateChain, {
    getRepo: () =>
      Effect.succeed({
        versionedAggregateFanoutQueue: Promise.resolve({
          getPage: async ({
            afterIndex,
            maxIndex,
          }: {
            afterIndex: number;
            maxIndex?: number;
          }) => ({
            _tag: 'Success',
            success: {
              rows: inputs.rows
                .filter(
                  row =>
                    row.aggregateIndex > afterIndex &&
                    (maxIndex === undefined || row.aggregateIndex <= maxIndex),
                )
                .slice(0, 64),
              lastIndex: inputs.rows.at(-1)?.aggregateIndex ?? 0,
            },
          }),
          subscribe: async () => ({ _tag: 'Success', success: undefined }),
        }),
      }),
  });
  return actual;
});
vi.mock(
  '../../VersionedAggregateChain/VersionedAggregateChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../VersionedAggregateChain/VersionedAggregateChain.js')
      >();

    Object.assign(actual.VersionedAggregateChain, {
      getRepo: () =>
        Effect.succeed({
          replicaFanoutQueue: Promise.resolve({
            getPage: async ({ afterIndex }: { afterIndex: number }) => ({
              _tag: 'Success',
              success: {
                lastIndex: inputs.history.at(-1)?.outboxIndex ?? 0,
                rows: inputs.history
                  .filter(row => row.outboxIndex > afterIndex)
                  .slice(0, 1),
              },
            }),
          }),
        }),
    });
    return actual;
  },
);
vi.mock('../ReplicatedResources.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../ReplicatedResources.js')>();

  Object.assign(actual.ReplicatedResources, {
    getRepo: () => Effect.succeed([]),
  });
  return actual;
});
it('fetches bounded pages, commits all terminal occurrences, and never reruns already committed mutations', async () => {
  const sql = await initSqlJs();
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedAggregateRepoTables,
        models: system.aggregates.user['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  db.insert(versionedAggregateRepoDbConfig.schema.head)
    .values({
      singletonId: 1,
      aggregateIndex: 0,
      dispositionHash: genesisDispositionHash(),
    })
    .run();
  inputs.rows = Array.from({ length: 130 }, (_, i) => ({
    aggregateIndex: i + 1,
    chainedAt: new Date(1),
    command: JSON.stringify({
      id: `cmd_page_${i}`,
      commandName: 'createUser',
      payload: JSON.stringify({ id: `usr_page_${i}`, name: `User ${i}` }),
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
  })).map(row => ({
    ...row,
    commandId: `cmd_${row.aggregateIndex}`,
    canonicalBytes: row.command,
  }));
  const props = {
    aggregateIndex: 130,
    db,
    sql,
    execution: Semaphore.makeUnsafe(1),
    alarms: { hold: () => Effect.void, release: () => Effect.void },
    key: {
      systemId: 'sys_test',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      aggregateVersion: '1.0.0',
    },
  };
  const subscriber = makeFanoutSubscriber({
    name: 'versionedAggregateFanoutQueue',
    sourceKey: {
      systemId: props.key.systemId,
      aggregateId: props.key.aggregateId,
      aggregateName: props.key.aggregateName,
    },
    key: props.key,
    getRepo: AggregateChain.getRepo,
    getCurrentIndex: () =>
      db.select().from(versionedAggregateRepoDbConfig.schema.head).get()
        ?.aggregateIndex ?? 0,
    receive: ({ rows: commands }) => executeCommands({ ...props, commands }),
  });
  const result = await Effect.runPromise(
    execute({ ...props, subscriber }).pipe(
      Effect.provide(AsyncLive),
      Effect.provide(NanoIdFactory),
    ),
  );
  expect(result.failedAt).toBeNull();
  expect(
    db.select().from(versionedAggregateRepoDbConfig.schema.head).get(),
  ).toMatchObject({
    aggregateIndex: 130,
  });
  expect(
    db
      .select()
      .from(system.aggregates.user['1.0.0'].models.user.drizzleSchema)
      .all(),
  ).toHaveLength(130);
  inputs.history = db
    .select()
    .from(versionedAggregateRepoDbConfig.schema.executedCommands)
    .all();
  expect(inputs.history.map(row => row.outboxIndex)).toEqual(
    Array.from({ length: 130 }, (_, i) => i + 1),
  );
  db.delete(versionedAggregateRepoDbConfig.schema.executedCommands).run();
  const retried = await Effect.runPromise(
    execute({ ...props, subscriber, aggregateIndex: 1 }).pipe(
      Effect.provide(AsyncLive),
      Effect.provide(NanoIdFactory),
    ),
  );
  expect(JSON.stringify(retried)).toBe(
    JSON.stringify(JSON.parse(inputs.history[0]!.entry).command),
  );
  expect(
    db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.executedCommands)
      .all(),
  ).toEqual([]);
  expect(
    db
      .select()
      .from(system.aggregates.user['1.0.0'].models.user.drizzleSchema)
      .all(),
  ).toHaveLength(130);
});

it.each(['direct', 'subscriber'])(
  'rolls back the entire execution page on an infrastructure gap via %s',
  async delivery => {
    const sql = await initSqlJs();
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedAggregateRepoTables,
          models: system.aggregates.user['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.insert(versionedAggregateRepoDbConfig.schema.head)
      .values({
        singletonId: 1,
        aggregateIndex: 0,
        dispositionHash: genesisDispositionHash(),
      })
      .run();
    inputs.rows = [1, 3]
      .map(index => ({
        aggregateIndex: index,
        chainedAt: new Date(1),
        command: JSON.stringify({
          id: `cmd_gap_${index}`,
          commandName: 'createUser',
          payload: JSON.stringify({ id: `usr_gap_${index}`, name: 'Gap' }),
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
      }))
      .map(row => ({
        ...row,
        commandId: `cmd_${row.aggregateIndex}`,
        canonicalBytes: row.command,
      }));
    const props = {
      aggregateIndex: 3,
      db,
      sql,
      execution: Semaphore.makeUnsafe(1),
      alarms: { hold: () => Effect.void, release: () => Effect.void },
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
      },
    };
    const subscriber = makeFanoutSubscriber({
      name: 'versionedAggregateFanoutQueue',
      sourceKey: {
        systemId: props.key.systemId,
        aggregateId: props.key.aggregateId,
        aggregateName: props.key.aggregateName,
      },
      key: props.key,
      getRepo: AggregateChain.getRepo,
      getCurrentIndex: () =>
        db.select().from(versionedAggregateRepoDbConfig.schema.head).get()
          ?.aggregateIndex ?? 0,
      receive: ({ rows: commands }) => executeCommands({ ...props, commands }),
    });
    const result =
      delivery === 'direct'
        ? await Effect.runPromise(
            execute({ ...props, subscriber }).pipe(
              Effect.result,
              Effect.provide(AsyncLive),
              Effect.provide(NanoIdFactory),
            ),
          )
        : await subscriber.receive({ rows: inputs.rows, lastIndex: 3 });
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'aggregate-execution-gap' },
    });
    expect(
      db
        .select()
        .from(system.aggregates.user['1.0.0'].models.user.drizzleSchema)
        .all(),
    ).toEqual([]);
    expect(
      db.select().from(versionedAggregateRepoDbConfig.schema.head).all(),
    ).toEqual([
      {
        singletonId: 1,
        aggregateIndex: 0,
        dispositionHash: genesisDispositionHash(),
      },
    ]);
    expect(
      db
        .select()
        .from(versionedAggregateRepoDbConfig.schema.executedCommands)
        .all(),
    ).toEqual([]);
  },
);

it.each(['direct', 'subscriber'])(
  'records preparation rejection and continues via %s',
  async delivery => {
    const sql = await initSqlJs();
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedAggregateRepoTables,
          models: system.aggregates.user['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.insert(versionedAggregateRepoDbConfig.schema.head)
      .values({
        singletonId: 1,
        aggregateIndex: 0,
        dispositionHash: genesisDispositionHash(),
      })
      .run();
    inputs.rows = [1, 2]
      .map(index => ({
        aggregateIndex: index,
        chainedAt: new Date(1),
        command: JSON.stringify({
          id: `cmd_prepare_${index}`,
          commandName: 'createUser',
          payload:
            index === 1
              ? '{}'
              : JSON.stringify({ id: 'usr_after_rejection', name: 'Accepted' }),
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
      }))
      .map(row => ({
        ...row,
        commandId: `cmd_${row.aggregateIndex}`,
        canonicalBytes: row.command,
      }));
    const props = {
      aggregateIndex: 2,
      db,
      sql,
      execution: Semaphore.makeUnsafe(1),
      alarms: { hold: () => Effect.void, release: () => Effect.void },
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
      },
    };
    const subscriber = makeFanoutSubscriber({
      name: 'versionedAggregateFanoutQueue',
      sourceKey: {
        systemId: props.key.systemId,
        aggregateId: props.key.aggregateId,
        aggregateName: props.key.aggregateName,
      },
      key: props.key,
      getRepo: AggregateChain.getRepo,
      getCurrentIndex: () =>
        db.select().from(versionedAggregateRepoDbConfig.schema.head).get()
          ?.aggregateIndex ?? 0,
      receive: ({ rows: commands }) => executeCommands({ ...props, commands }),
    });
    const rows = inputs.rows;
    if (delivery === 'direct') {
      const result = await Effect.runPromise(
        execute({ ...props, subscriber }).pipe(
          Effect.provide(AsyncLive),
          Effect.provide(NanoIdFactory),
        ),
      );
      expect(result.failure).toBeNull();
    } else {
      inputs.rows = [];
      expect(
        await subscriber.receive({ rows: [], lastIndex: 2 }),
      ).toMatchObject({ _tag: 'Success' });
      expect(await subscriber.receive({ rows, lastIndex: 2 })).toMatchObject({
        _tag: 'Success',
      });
      expect(await subscriber.receive({ rows, lastIndex: 2 })).toMatchObject({
        _tag: 'Success',
      });
      expect(
        await subscriber.receive({ rows: [], lastIndex: 2 }),
      ).toMatchObject({ _tag: 'Success' });
    }
    const executedCommands = db
      .select()
      .from(versionedAggregateRepoDbConfig.schema.executedCommands)
      .all()
      .map(row => JSON.parse(row.entry));
    expect(executedCommands[0].command.failedAt).not.toBeNull();
    expect(executedCommands[0].sourceCommand).toBe(rows[0]!.command);
    expect(executedCommands[0].mutations).toEqual([]);
    expect(executedCommands[1].command.aggregateIndex).toBe(2);
    expect(
      db
        .select()
        .from(system.aggregates.user['1.0.0'].models.user.drizzleSchema)
        .all(),
    ).toHaveLength(1);
  },
);

it('requires the queue-named subscriber capability', () => {
  expectTypeOf<AggregateChain>().toExtend<
    IFanoutRepo<'versionedAggregateFanoutQueue', VersionedAggregateRepo>
  >();
  // @ts-expect-error A repo without the named subscriber cannot satisfy the constraint.
  expectTypeOf<IFanoutRepo<'versionedAggregateFanoutQueue', {}>>();
});
