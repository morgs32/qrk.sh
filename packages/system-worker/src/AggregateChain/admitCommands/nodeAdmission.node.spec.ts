import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { Effect, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { aggregateActorVersionChainDbConfig } from '../../AggregateActorVersionChain/aggregateActorVersionChainDbConfig.js';
import { getActorCommands } from '../../AggregateActorVersionChain/getActorCommands/getActorCommands.js';
import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { aggregateChainDbConfig } from '../aggregateChainDbConfig.js';

import { admitCommandsTx } from './admitCommandsTx.js';

const command = (
  id: string,
  nodeIndex: number,
): IEncodedCommand<IAggregateCommand> => ({
  id: `cmd_${id}`,
  nodeId: 'node_one',
  nodeIndex,
  sessionName: 'editor',
  commandName: 'change',
  payload: '{}',
  contractVersion: 'v1',
  aggregateId: 'acct_one',
  aggregateName: 'account',
  systemName: 'test',
  actorName: 'owner',
  actorVersion: 'v1',
  claims: { aggregateId: 'acct_one' },
});

describe('node admission and retained outcome replay', () => {
  it('deduplicates committed ids and rejects gaps atomically without renumbering', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(aggregateChainDbConfig);
        const admit = (commands: IEncodedCommand<IAggregateCommand>[]) =>
          admitCommandsTx(
            db,
            commands.map(command => ({
              command,
              admission: {
                status: 'succeeded',
                startedAt: new Date('2026-09-25T12:00:00.000Z'),
                completedAt: new Date('2026-09-25T12:00:01.000Z'),
              } as const,
            })),
          );
        expect(
          (yield* admit([command('one', 1), command('one', 1)])).map(
            row => row.aggregateIndex,
          ),
        ).toEqual([1, 1]);
        const gap = yield* admit([command('two', 2), command('four', 4)]).pipe(
          Effect.result,
        );
        expect(gap).toMatchObject({
          _tag: 'Failure',
          failure: {
            code: 'node-admission-index-mismatch',
            extra: { expectedNodeIndex: 3 },
          },
        });
        expect(
          db.select().from(aggregateChainDbConfig.schema.commands).all(),
        ).toHaveLength(1);
        expect(yield* admit([command('two', 2)])).toMatchObject([
          { nodeIndex: 2, aggregateIndex: 2 },
        ]);
        const conflict = yield* admit([command('other', 2)]).pipe(
          Effect.result,
        );
        expect(conflict).toMatchObject({
          _tag: 'Failure',
          failure: { extra: { expectedNodeIndex: 3 } },
        });
        expect(yield* admit([command('one', 100)])).toMatchObject([
          { nodeIndex: 1, aggregateIndex: 1 },
        ]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('binds a node to its original authenticated session', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(aggregateChainDbConfig);
        const admit = (value: IEncodedCommand<IAggregateCommand>) =>
          admitCommandsTx(db, [
            {
              command: value,
              admission: {
                status: 'succeeded',
                startedAt: new Date('2026-09-25T12:00:00.000Z'),
                completedAt: new Date('2026-09-25T12:00:01.000Z'),
              } as const,
            },
          ]);
        yield* admit(command('one', 1));
        const rejected = yield* admit({
          ...command('two', 2),
          claims: { aggregateId: 'acct_other' },
        }).pipe(Effect.result);
        expect(Result.isFailure(rejected) && rejected.failure.code).toBe(
          'node-admission-identity-mismatch',
        );
        expect(
          db.select().from(aggregateChainDbConfig.schema.commands).all(),
        ).toHaveLength(1);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('replays a bounded own-outcome prefix including failures without unrelated identities', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        for (let index = 1; index <= 70; index++) {
          db.insert(aggregateActorVersionChainDbConfig.schema.commands)
            .values(
              Effect.runSync(
                aggregateActorVersionChainDbConfig.tables.commands.encodeRow({
                  rowId: `row_${index}`,
                  id: `cmd_${index}`,
                  commandName: 'example',
                  contractVersion: '1.0.0',
                  payload: '{}',
                  aggregateId: 'agg_one',
                  aggregateName: 'example',
                  aggregateVersion: '1.0.0',
                  systemName: 'example',
                  actorName: 'editor',
                  actorVersion: '1.0.0',
                  claims: { aggregateId: 'acct_one' },
                  nodeId: 'node_one',
                  nodeIndex: index,
                  sessionName: 'editor',
                  serviceName: null,
                  serviceVersion: null,
                  automationName: null,
                  aggregateIndex: index,
                  serviceIndex: null,
                  dispositionHash: null,
                  executedIndex: index,
                  executedHash: index.toString(16).padStart(64, '0'),
                  actorAggregateIndex: index,
                  actorDelta: { upserted: [], deleted: [] },
                  admission: {
                    status: 'succeeded',
                    startedAt: new Date('2026-09-25T12:00:00.000Z'),
                    completedAt: new Date('2026-09-25T12:00:01.000Z'),
                  },
                  execution:
                    index === 2
                      ? {
                          startedAt: new Date('2026-09-25T12:00:00.000Z'),
                          completedAt: new Date('2026-09-25T12:00:01.000Z'),
                          status: 'failed',
                          failure: {
                            _tag: 'ZerospinError',
                            code: 'denied',
                            scope: 'actor',
                            message: 'Denied',
                            status: 403,
                            extra: null,
                          },
                        }
                      : {
                          status: 'succeeded',
                          startedAt: new Date('2026-09-25T12:00:00.000Z'),
                          completedAt: new Date('2026-09-25T12:00:01.000Z'),
                          executionDelta: {
                            inserted: [],
                            updated: [],
                            deleted: [],
                          },
                        },
                  acknowledgedAt: null,
                  lastDeliveryFailure: null,
                  completionNodeId: 'node_one',
                  completionNodeIndex: index,
                  completionClaims: { aggregateId: 'acct_one' },
                  completionSessionName: 'editor',
                }),
              ),
            )
            .run();
        }
        const own = {
          nodeId: 'node_one',
          afterNodeIndex: 0,
          definition: {
            name: 'editor',
            claims: { aggregateId: 'acct_one' },
            lock: {
              sessionName: 'editor',
              actorName: 'editor',
              actorVersion: '1.0.0',
              claims: { claimsJsonSchema: {} },
              models: {},
              contracts: {},
            },
          },
        };
        const first = yield* getActorCommands({
          db,
          afterExecutedIndex: 68,
          ...own,
        });
        expect(first.commands).toHaveLength(64);
        expect(first.commands[1]?.execution).toMatchObject({
          status: 'failed',
        });
        const second = yield* getActorCommands({
          db,
          afterExecutedIndex: 68,
          ...own,
          afterNodeIndex: 64,
        });
        expect(second.commands.map(command => command.nodeIndex)).toEqual([
          65, 66, 67, 68, 69, 70,
        ]);
        const other = yield* getActorCommands({
          db,
          afterExecutedIndex: 70,
          ...own,
          definition: {
            ...own.definition,
            claims: { aggregateId: 'acct_other' },
          },
        });
        expect(other.commands).toEqual([]);
        const live = yield* getActorCommands({ db, afterExecutedIndex: 68 });
        expect(live.commands.map(command => command.executedIndex)).toEqual([
          69, 70,
        ]);
        expect(
          live.commands.every(
            command =>
              command.nodeId === null &&
              command.admission === null &&
              command.execution === null,
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
