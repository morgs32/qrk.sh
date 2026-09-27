import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { eq } from 'drizzle-orm';
import { Effect, Result } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { genesisExecutedHash } from '../../executedDispositionHash/executedDispositionHash.js';
import { aggregateActorVersionChainDbConfig } from '../aggregateActorVersionChainDbConfig.js';
import { getActorCommands } from '../getActorCommands/getActorCommands.js';

import { onMessage } from './onMessage.js';

const lock = {
  sessionName: 'editor',
  actorName: 'editor',
  actorVersion: '1.0.0',
  claims: { claimsJsonSchema: {} },
  models: {},
  contracts: {},
};
const claims = { userId: 'one', nested: { a: 1, b: 2 } };
const definition = { name: 'editor', claims, lock };
const hash = (index: number) =>
  index === 0 ? genesisExecutedHash() : index.toString(16).padStart(64, '0');
const key = {
  aggregateId: 'agg_one',
  aggregateName: 'example',
  aggregateVersion: '1.0.0',
  actorName: 'editor',
  actorVersion: '1.0.0',
  actorPath: '/one',
  systemId: 'sys_one',
};

const fixture = Effect.fn(function* (count: number, interleaved = false) {
  const { db } = yield* makeActorSnapshotDb(aggregateActorVersionChainDbConfig);
  for (let index = 1; index <= count; index++) {
    const other = interleaved && index > 70 && index % 2 === 0;
    const nodeId = other ? 'node_other' : 'node_one';
    const nodeIndex = interleaved
      ? index > 70
        ? Math.floor((index - 71) / 2) + 1
        : index + 1000
      : index;
    db.insert(aggregateActorVersionChainDbConfig.schema.commands)
      .values(
        yield* aggregateActorVersionChainDbConfig.tables.commands.encodeRow({
          rowId: `row_${index}`,
          id: `cmd_${index}`,
          commandName: 'example',
          contractVersion: '1.0.0',
          payload: '{}',
          ...key,
          systemName: 'example',
          nodeId,
          nodeIndex,
          sessionName: 'editor',
          claims,
          serviceName: null,
          serviceVersion: null,
          automationName: null,
          executedIndex: index,
          aggregateIndex: index,
          serviceIndex: null,
          dispositionHash: null,
          executedHash: hash(index),
          actorAggregateIndex: index,
          actorDelta: {
            upserted: [],
            deleted: [{ id: 'itm_private', modelName: 'private' }],
          },
          admission: {
            status: 'succeeded',
            startedAt: new Date(0),
            completedAt: new Date(0),
          },
          execution: {
            status: 'succeeded',
            startedAt: new Date(0),
            completedAt: new Date(0),
            executionDelta: { inserted: [], updated: [], deleted: [] },
          },
          acknowledgedAt: null,
          lastDeliveryFailure: null,
          completionNodeId: nodeId,
          completionNodeIndex: nodeIndex,
          completionClaims:
            interleaved && index <= 70
              ? { userId: 'wrong' }
              : { nested: { b: 2, a: 1 }, userId: 'one' },
          completionSessionName: 'editor',
        }),
      )
      .run();
  }
  const sent: unknown[] = [];
  const connection: Parameters<typeof onMessage>[0]['connection'] = {
    id: 'connection',
    uri: null,
    url: '',
    protocol: '',
    extensions: '',
    binaryType: 'arraybuffer',
    readyState: 1,
    bufferedAmount: 0,
    onclose: null,
    onerror: null,
    onmessage: null,
    onopen: null,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    tags: [],
    server: 'test',
    state: {
      ...key,
      phase: 'awaiting-resume',
      claims,
      sessionName: 'editor',
      aggregateSessionLock: lock,
    },
    setState(next) {
      const resolved = typeof next === 'function' ? next(this.state) : next;
      this.state =
        resolved === null
          ? null
          : { ...resolved, claims, aggregateSessionLock: lock };
      return this.state;
    },
    send(message) {
      if (typeof message === 'string') sent.push(JSON.parse(message));
    },
    close: vi.fn(),
    accept: vi.fn(),
    serializeAttachment: vi.fn(),
    deserializeAttachment: () => null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  };
  const resume = (
    executedIndex: number,
    nodeIndex = 0,
    executedHash = hash(executedIndex),
  ) =>
    onMessage({
      db,
      key,
      connection,
      message: JSON.stringify({
        nodeId: 'node_one',
        nodeIndex,
        executedIndex,
        executedHash,
      }),
    });
  return { db, sent, connection, resume };
});

describe('one actor command subscription with two cursors', () => {
  it('fills ownership-filtered pages and crosses the snapshot once in execution order', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db, sent, connection, resume } = yield* fixture(214, true);
        const first = yield* getActorCommands({
          db,
          definition,
          nodeId: 'node_one',
          afterNodeIndex: 0,
          afterExecutedIndex: 202,
        });
        expect(first.commands).toHaveLength(64);
        expect(first.commands.map(command => command.executedIndex)).toEqual(
          Array.from({ length: 64 }, (_, i) => 71 + i * 2),
        );
        const second = yield* getActorCommands({
          db,
          definition,
          nodeId: 'node_one',
          afterNodeIndex: 64,
          afterExecutedIndex: 202,
        });
        expect(second.commands.map(command => command.executedIndex)).toEqual([
          199,
          201,
          ...Array.from({ length: 12 }, (_, i) => 203 + i),
        ]);
        expect(
          second.commands.find(command => command.executedIndex === 203),
        ).toMatchObject({ nodeIndex: 67, admission: { status: 'succeeded' } });
        expect(
          second.commands.find(command => command.executedIndex === 204),
        ).toMatchObject({
          nodeId: null,
          nodeIndex: null,
          admission: null,
          execution: null,
        });
        expect(
          second.commands.every(
            command => command.actorDelta.deleted.length === 0,
          ),
        ).toBe(true);
        yield* resume(202);
        expect(sent).toEqual([
          ...[...first.commands, ...second.commands].map(command => ({
            type: 'aggregateActorCommand',
            command: JSON.parse(JSON.stringify(command)),
          })),
          { type: 'replay-complete', executedIndex: 214 },
        ]);
        expect(connection.state?.phase).toBe('live');
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it.each(['node', 'session', 'claims'] as const)(
    'redacts newer commands and excludes historical results for another %s',
    async mismatch => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const { db } = yield* fixture(3);
          const page = yield* getActorCommands({
            db,
            afterExecutedIndex: 2,
            afterNodeIndex: 0,
            nodeId: mismatch === 'node' ? 'node_other' : 'node_one',
            definition: {
              ...definition,
              name: mismatch === 'session' ? 'other' : definition.name,
              claims: mismatch === 'claims' ? { userId: 'other' } : claims,
            },
          });
          expect(page.commands).toMatchObject([
            {
              executedIndex: 3,
              nodeId: null,
              nodeIndex: null,
              admission: null,
              execution: null,
            },
          ]);
          expect(page.commands).toHaveLength(1);
          const shared = yield* getActorCommands({ db, afterExecutedIndex: 0 });
          expect(shared.commands).toHaveLength(3);
          expect(
            shared.commands.every(
              command =>
                command.nodeId === null &&
                command.admission === null &&
                command.execution === null,
            ),
          ).toBe(true);
          expect(shared.commands[0]?.actorDelta.deleted).toHaveLength(1);
        }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
      );
    },
  );

  it.each([0, 3, 64, 130])(
    'completes historical-only or empty replay at the supplied execution position %i',
    async count => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const { sent, resume } = yield* fixture(count);
          yield* resume(count);
          expect(sent).toHaveLength(count + 1);
          expect(sent.at(-1)).toEqual({
            type: 'replay-complete',
            executedIndex: count,
          });
        }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
      );
    },
  );

  it.each([
    { executedIndex: 1, nodeIndex: 0, executedHash: 'f'.repeat(64) },
    { executedIndex: 0, nodeIndex: 0, executedHash: 'f'.repeat(64) },
    { executedIndex: 4, nodeIndex: 0, executedHash: hash(4) },
    { executedIndex: -1, nodeIndex: 0, executedHash: hash(1) },
    { executedIndex: 1, nodeIndex: -1, executedHash: hash(1) },
  ])('requests state for an invalid resume: %j', async input => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { sent, connection, resume } = yield* fixture(3);
        yield* resume(input.executedIndex, input.nodeIndex, input.executedHash);
        expect(sent).toEqual([{ type: 'state-required' }]);
        expect(connection.close).toHaveBeenCalledWith(4003, 'state-required');
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('rejects node-result gaps and execution gaps', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db, sent, resume } = yield* fixture(3);
        db.update(aggregateActorVersionChainDbConfig.schema.commands)
          .set({ completionNodeIndex: 4 })
          .where(
            eq(
              aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
              2,
            ),
          )
          .run();
        yield* resume(3);
        expect(sent.at(-1)).toEqual({ type: 'state-required' });
        db.delete(aggregateActorVersionChainDbConfig.schema.commands)
          .where(
            eq(
              aggregateActorVersionChainDbConfig.schema.commands.executedIndex,
              2,
            ),
          )
          .run();
        const gap = yield* getActorCommands({ db, afterExecutedIndex: 1 }).pipe(
          Effect.result,
        );
        expect(Result.isFailure(gap) && gap.failure.code).toBe(
          'session-replay-gap',
        );
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });

  it('requires complete node cursor fields and admitted definition context', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { db } = yield* fixture(0);
        for (const cursor of [
          { nodeId: 'node_one' },
          { afterNodeIndex: 0 },
          { nodeId: 'node_one', afterNodeIndex: 0 },
          { nodeId: 'node_one', afterNodeIndex: -1, definition },
          { nodeId: 'node_one', afterNodeIndex: 1.5, definition },
        ]) {
          const result = yield* getActorCommands({
            db,
            afterExecutedIndex: 0,
            ...cursor,
          }).pipe(Effect.result);
          expect(Result.isFailure(result) && result.failure.code).toBe(
            'session-replay-cursor-invalid',
          );
        }
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  });
});
