import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect, Exit, Result } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
import { getActorCommands } from '../getActorCommands/getActorCommands.js';

import { receiveActorCommands } from './receiveActorCommands.js';

const row = () =>
  aggregateActorVersionChainDbConfig.tables.commands.encodeRow({
    rowId: 'row_one',
    id: 'cmd_one',
    commandName: 'example',
    contractVersion: '1.0.0',
    payload: '{}',
    aggregateId: 'agg_one',
    aggregateName: 'example',
    aggregateVersion: '1.0.0',
    systemName: 'example',
    actorName: 'editor',
    actorVersion: '1.0.0',
    nodeId: 'node_one',
    nodeIndex: 1,
    sessionName: 'editor',
    identity: { userId: 'one' },
    serviceName: null,
    serviceVersion: null,
    automationName: null,
    executedIndex: 1,
    aggregateIndex: 1,
    serviceIndex: null,
    dispositionHash: null,
    executedHash: 'a'.repeat(64),
    actorAggregateIndex: 1,
    actorDelta: { upserted: [], deleted: [] },
    admission: null,
    execution: null,
    acknowledgedAt: null,
    lastDeliveryFailure: null,
    completionNodeId: 'node_one',
    completionNodeIndex: 1,
    completionIdentity: { userId: 'one' },
    completionSessionName: 'editor',
  });

describe('aggregate actor publication', () => {
  it('replays private completion only to the matching identity, session, and node', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        db.insert(aggregateActorVersionChainDbConfig.schema.commands)
          .values(yield* row())
          .run();
        const replay = (owner: {
          nodeId: string;
          afterNodeIndex: number;
          sessionName: string;
          identity: { userId: string };
        }) =>
          getActorCommands({
            db,
            afterExecutedIndex: 1,
            nodeId: owner.nodeId,
            afterNodeIndex: owner.afterNodeIndex,
            definition: {
              name: owner.sessionName,
              identity: owner.identity,
              lock: {
                sessionName: 'editor',
                actorName: 'editor',
                actorVersion: '1.0.0',
                identity: { identityJsonSchema: {} },
                models: {},
                contracts: {},
              },
            },
          });
        const owner = {
          nodeId: 'node_one',
          afterNodeIndex: 0,
          sessionName: 'editor',
          identity: { userId: 'one' },
        };
        expect((yield* replay(owner)).commands).toMatchObject([
          { id: 'cmd_one', nodeId: 'node_one', nodeIndex: 1 },
        ]);
        expect(
          (yield* replay({ ...owner, identity: { userId: 'two' } })).commands,
        ).toEqual([]);
        expect(
          (yield* replay({ ...owner, sessionName: 'other' })).commands,
        ).toEqual([]);
        expect(
          (yield* replay({ ...owner, nodeId: 'node_other' })).commands,
        ).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('stores ownerless commands as SQL null in the chain', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db: producer } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        const { db } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        const decoded =
          yield* aggregateActorVersionChainDbConfig.tables.commands.decodeRow(
            yield* row(),
          );
        const source =
          yield* aggregateActorVersionChainDbConfig.tables.commands.encodeRow({
            ...decoded,
            completionIdentity: null,
            completionSessionName: null,
            completionNodeId: null,
            completionNodeIndex: null,
          });
        expect(source.completionIdentity).toBeNull();
        producer
          .insert(aggregateActorVersionChainDbConfig.schema.commands)
          .values(source)
          .run();
        const rows = producer
          .select()
          .from(aggregateActorVersionChainDbConfig.schema.commands)
          .all();
        expect(rows[0]?.completionIdentity).toBeNull();
        const broadcasts: unknown[] = [];
        yield* receiveActorCommands({
          db,
          rows,
          broadcast: value => broadcasts.push(value),
        });
        const retained = db
          .select()
          .from(aggregateActorVersionChainDbConfig.schema.commands)
          .all();
        expect(retained).toHaveLength(1);
        expect(retained[0]?.completionIdentity).toBeNull();
        expect(retained[0]?.identity).toBe(JSON.stringify({ userId: 'one' }));
        expect(broadcasts).toMatchObject([
          { identity: null, sessionName: null },
        ]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('retains encoded values and rebroadcasts a committed duplicate', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        const source = yield* row();
        const broadcasts: unknown[] = [];
        const failedBroadcast = yield* Effect.exit(
          receiveActorCommands({
            db,
            rows: [source],
            broadcast: () => {
              throw new Error('socket closed');
            },
          }),
        );
        expect(Exit.isFailure(failedBroadcast)).toBe(true);
        const publish = () =>
          receiveActorCommands({
            db,
            rows: [source],
            broadcast: value => broadcasts.push(value),
          });
        yield* publish();
        yield* publish();
        const retained = db
          .select()
          .from(aggregateActorVersionChainDbConfig.schema.commands)
          .all();
        expect(retained).toHaveLength(1);
        expect(retained[0]?.actorDelta).toBe(source.actorDelta);
        expect(source.completionIdentity).toBe(
          JSON.stringify({ userId: 'one' }),
        );
        expect(retained[0]?.completionIdentity).toBe(source.completionIdentity);
        expect(broadcasts).toHaveLength(2);
        const conflicting = yield* receiveActorCommands({
          db,
          rows: [{ ...source, payload: '{"changed":true}' }],
          broadcast: () => {
            throw new Error('unexpected broadcast');
          },
        }).pipe(Effect.result);
        expect(Result.isFailure(conflicting) && conflicting.failure.code).toBe(
          'session-output-identity-mismatch',
        );
        expect(broadcasts[0]).toMatchObject({
          command: { actorDelta: { upserted: [], deleted: [] } },
          identity: { userId: 'one' },
        });
        const replay = yield* getActorCommands({ db, afterExecutedIndex: 0 });
        expect(replay.commands[0]).toMatchObject({
          actorDelta: { upserted: [], deleted: [] },
        });
        expect(replay.commands[0]).not.toHaveProperty('identity');
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('rejects malformed commands and invalid completion ownership before insertion', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* makeActorSnapshotDb(
          aggregateActorVersionChainDbConfig,
        );
        const source = yield* row();
        const broadcast = () => {
          throw new Error('unexpected broadcast');
        };
        const invalid = yield* receiveActorCommands({
          db,
          rows: [{ ...source, id: 'bad' }],
          broadcast,
        }).pipe(Effect.result);
        expect(Result.isFailure(invalid) && invalid.failure.code).toBe(
          'session-output-invalid',
        );
        const malformedOwner = yield* receiveActorCommands({
          db,
          rows: [{ ...source, completionIdentity: '{' }],
          broadcast,
        }).pipe(Effect.result);
        expect(
          Result.isFailure(malformedOwner) && malformedOwner.failure.code,
        ).toBe('session-output-completion-owner-invalid');
        const ownership = yield* receiveActorCommands({
          db,
          rows: [{ ...source, completionSessionName: null }],
          broadcast,
        }).pipe(Effect.result);
        expect(Result.isFailure(ownership) && ownership.failure.code).toBe(
          'session-output-completion-owner-invalid',
        );
        const missingIdentity = yield* receiveActorCommands({
          db,
          rows: [{ ...source, completionIdentity: null }],
          broadcast,
        }).pipe(Effect.result);
        expect(
          Result.isFailure(missingIdentity) && missingIdentity.failure.code,
        ).toBe('session-output-completion-owner-invalid');
        const decoded =
          yield* aggregateActorVersionChainDbConfig.tables.commands.decodeRow(
            source,
          );
        const failedWithoutOwner =
          yield* aggregateActorVersionChainDbConfig.tables.commands.encodeRow({
            ...decoded,
            completionIdentity: null,
            completionSessionName: null,
            completionNodeId: null,
            completionNodeIndex: null,
            admission: {
              startedAt: new Date('2026-09-25T12:00:00.000Z'),
              completedAt: new Date('2026-09-25T12:00:01.000Z'),
              status: 'failed',
              failure: {
                _tag: 'ZerospinError',
                code: 'denied',
                message: 'Denied',
                status: 403,
                extra: null,
              },
            },
            execution: { status: 'skipped', reason: 'admission-failed' },
          });
        const ownerlessBroadcasts: unknown[] = [];
        yield* receiveActorCommands({
          db,
          rows: [failedWithoutOwner],
          broadcast: value => ownerlessBroadcasts.push(value),
        });
        expect(ownerlessBroadcasts).toMatchObject([
          {
            command: {
              admission: null,
              execution: null,
            },
          },
        ]);
        expect(
          db
            .select()
            .from(aggregateActorVersionChainDbConfig.schema.commands)
            .all(),
        ).toMatchObject([
          { admission: expect.any(String), execution: expect.any(String) },
        ]);
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
