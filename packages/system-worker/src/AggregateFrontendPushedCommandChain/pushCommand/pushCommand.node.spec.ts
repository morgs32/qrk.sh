import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { sql } from 'drizzle-orm';
import { Effect, Result, Schema, Semaphore } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  aggregateFrontendPushedCommandChainDbConfig,
  aggregateFrontendPushedCommandChainDrizzleSchemas,
} from '../AggregateFrontendPushedCommandChainDbConfig.js';

import { pushCommand } from './pushCommand.js';

vi.mock('../../AggregateCommandChain/AggregateCommandChain.js', async () => {
  const { Effect } = await import('effect');
  return {
    AggregateCommandChain: {
      fixedDORepoConfig: {
        nameUtils: {
          makeName: Effect.fn('AggregateCommandChain.makeTestName')(
            function* (key: {
              systemId: string;
              aggregateId: string;
              aggregateName: string;
            }) {
              yield* Effect.void;
              return `aggchain_${key.systemId}/${key.aggregateId}/${key.aggregateName}`;
            },
          ),
        },
      },
    },
  };
});

vi.mock(
  '../../MaterializedAggregateFrontendRepo/MaterializedAggregateFrontendRepo.js',
  async () => {
    const { Effect } = await import('effect');
    return {
      MaterializedAggregateFrontendRepo: {
        fixedDORepoConfig: {
          nameUtils: {
            makeName: Effect.fn(
              'MaterializedAggregateFrontendRepo.makeTestName',
            )(function* (key: {
              systemId: string;
              aggregateId: string;
              aggregateName: string;
              userId: string;
              frontendName: string;
            }) {
              yield* Effect.void;
              return `aggfront_${key.systemId}/${key.aggregateId}/${key.aggregateName}/${key.userId}/${key.frontendName}`;
            }),
          },
        },
      },
    };
  },
);

describe('AggregateFrontendPushedCommandChain.pushCommand', () => {
  it('retains exact terminal bytes, forwards flat provenance, and rejects changed duplicates', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: aggregateFrontendPushedCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const command = Schema.decodeUnknownSync(SessionCommandSchema)({
      id: 'cmd_pushed_exact',
      commandName: 'emptySuccess',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'main',
      sessionIndex: 1,
      pushIndex: null,
      chainedAt: '2026-08-31T14:00:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: null,
      failure: null,
    });
    const admissionSemaphore = Effect.runSync(Semaphore.make(1));
    const forwarded: Array<{
      command: {
        sessionId: string | null;
        userId: string | null;
        frontendName: string | null;
        pushIndex: number | null;
      };
    }> = [];
    let alarmCount = 0;
    const deliveryQueue = {
      drain: Effect.fn('testDeliveryQueue.drain')(function* (props: {
        lanes: readonly {
          drain(): Effect.Effect<void, unknown, unknown>;
          hasPending(): Effect.Effect<boolean, unknown, unknown>;
        }[];
      }) {
        for (const lane of props.lanes) yield* lane.drain();
        let pending = false;
        for (const lane of props.lanes) {
          pending = (yield* lane.hasPending()) || pending;
        }
        return { pending };
      }),
      retry: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
    };
    const storage = {
      deleteAlarm: () => Promise.resolve(),
      setAlarm: () => {
        alarmCount += 1;
        return Promise.resolve();
      },
    };
    const request = {
      admissionSemaphore,
      aggregateCommandChains: {
        getByName: (_name: string) => ({
          receivePushedCommand: (props: (typeof forwarded)[number]) => {
            forwarded.push(props);
            return Effect.runPromise(encodeRpc(Effect.void));
          },
        }),
      },
      command,
      db,
      deliveryQueue,
      key: {
        systemId: 'sys_test',
        aggregateId: 'acct_test',
        aggregateName: 'user',
        userId: 'user_test',
        frontendName: 'main',
      },
      materializedAggregateFrontendRepos: {
        getByName: (_name: string) => ({
          executePushedCommand: (props: {
            command: typeof command;
            pushIndex: number;
            chainedAt: Date;
          }) => {
            const {
              sessionIndex: _sessionIndex,
              pushIndex: _localPushIndex,
              ...source
            } = props.command;
            return Effect.runPromise(
              encodeRpc(
                Effect.succeed({
                  ...source,
                  pushIndex: props.pushIndex,
                  chainedAt: props.chainedAt,
                }),
              ),
            );
          },
        }),
      },
      storage,
    };

    const first = await Effect.runPromise(
      pushCommand(request).pipe(Effect.provide(AsyncLive)),
    );
    const duplicate = await Effect.runPromise(
      pushCommand(request).pipe(Effect.provide(AsyncLive)),
    );
    const retained = db
      .select()
      .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
      .get();

    expect(duplicate).toEqual(first);
    expect(retained?.canonicalBytes).toBe(
      Schema.encodeSync(Schema.fromJsonString(SessionCommandSchema))(command),
    );
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]?.command).toMatchObject({
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'main',
      pushIndex: 1,
    });
    expect(alarmCount).toBeGreaterThan(0);

    const second = await Effect.runPromise(
      pushCommand({
        ...request,
        command: {
          ...command,
          id: 'cmd_pushed_exact_2',
          sessionIndex: 2,
          chainedAt: new Date('2026-08-31T14:00:01.000Z'),
        },
      }).pipe(Effect.provide(AsyncLive)),
    );
    expect([first.pushIndex, second.pushIndex]).toEqual([1, 2]);
    expect(
      db
        .select()
        .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
        .all()
        .map(row => row.pushIndex),
    ).toEqual([1, 2]);
    expect(forwarded.map(entry => entry.command.pushIndex)).toEqual([1, 2]);

    const changed = await Effect.runPromise(
      pushCommand({
        ...request,
        command: { ...command, payload: '{"changed":true}' },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(changed)).toBe(true);
    if (Result.isFailure(changed)) {
      expect(changed.failure.code).toBe(
        'aggregate-frontend-pushed-command-chain-command-conflict',
      );
    }
  });

  it('does not retain a command when durable admission fails', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: aggregateFrontendPushedCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    db.run(
      sql.raw(
        "CREATE TRIGGER reject_pushed_admission BEFORE INSERT ON commands BEGIN SELECT RAISE(FAIL, 'reject pushed admission'); END",
      ),
    );
    const command = Schema.decodeUnknownSync(SessionCommandSchema)({
      id: 'cmd_pushed_rollback',
      commandName: 'emptySuccess',
      payload: '{}',
      contractVersion: '1.0.0',
      aggregateId: 'acct_test',
      aggregateName: 'user',
      systemName: 'system-worker',
      sessionId: 'sesn_test',
      userId: 'user_test',
      frontendName: 'main',
      sessionIndex: 1,
      pushIndex: null,
      chainedAt: '2026-08-31T14:00:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: null,
      failure: null,
    });
    const result = await Effect.runPromise(
      pushCommand({
        admissionSemaphore: Effect.runSync(Semaphore.make(1)),
        aggregateCommandChains: {
          getByName: () => ({
            receivePushedCommand: () =>
              Effect.runPromise(encodeRpc(Effect.void)),
          }),
        },
        command,
        db,
        deliveryQueue: {
          drain: () => Effect.succeed({ pending: false }),
          retry: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
        },
        key: {
          systemId: 'sys_test',
          aggregateId: 'acct_test',
          aggregateName: 'user',
          userId: 'user_test',
          frontendName: 'main',
        },
        materializedAggregateFrontendRepos: {
          getByName: () => ({
            executePushedCommand: () =>
              Effect.runPromise(encodeRpc(Effect.fail(new Error('unused')))),
          }),
        },
        storage: {
          deleteAlarm: () => Promise.resolve(),
          setAlarm: () => Promise.resolve(),
        },
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'aggregate-frontend-pushed-command-chain-admission-failed',
      );
    }
    expect(
      db
        .select()
        .from(aggregateFrontendPushedCommandChainDrizzleSchemas.commands)
        .all(),
    ).toEqual([]);
  });
});
