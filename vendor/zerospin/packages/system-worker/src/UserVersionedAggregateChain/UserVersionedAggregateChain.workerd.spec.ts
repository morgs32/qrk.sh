import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateFrontendFinalizedCommand } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env } from 'cloudflare:test';
import { Effect, Result } from 'effect';
import { expect, it } from 'vitest';

import { main } from '../fixtures/system.js';

import { UserVersionedAggregateChain } from './UserVersionedAggregateChain.js';

it('shares one history across concurrent frontend locks and filters replay and live delivery without cursor gaps', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_shared_locks',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    userId: 'usr_shared',
  };
  const repo = await Effect.runPromise(
    UserVersionedAggregateChain.getRepo({ key }),
  );
  const receiver = await repo.deltasSubscriber;
  const time = '2026-09-09T12:00:00.000Z';
  const resources = [
    {
      id: key.userId,
      modelName: 'user',
      version: '1.0.0',
      createdAt: time,
      updatedAt: time,
      name: 'Shared',
    },
    {
      id: 'lst_shared',
      modelName: 'list',
      version: '1.0.0',
      createdAt: time,
      updatedAt: time,
      name: 'Shared list',
      userId: key.userId,
    },
  ];
  const rows = [1, 2, 3].map(userIndex => ({
    outboxIndex: userIndex,
    deliveredAt: null,
    lastDeliveryFailure: null,
    output: JSON.stringify({
      userIndex,
      aggregateIndex: userIndex,
      delta: { inserted: resources, updated: [], deleted: [], mutations: [] },
      resolution: {
        sourceCommand: '{}',
        preparationVersion: '1.0.0',
        executionTimestamp: time,
        mutations: [],
        command: {
          id: `cmd_shared_${userIndex}`,
          commandName: 'createList',
          payload: '{}',
          contractVersion: '1.0.0',
          aggregateId: key.aggregateId,
          aggregateName: key.aggregateName,
          systemName: 'system-worker',
          userId: key.userId,
          frontendName: 'main',
          sessionId: 'sesn_shared',
          pushIndex: userIndex,
          aggregateIndex: userIndex,
          chainedAt: time,
          delta: null,
          failedAt: null,
          failure: null,
          dispositionHash: 'a'.repeat(64),
        },
      },
    }),
  }));
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(0, 2))));
  const baseline = makeAggregateFrontendLock({ frontend: main });
  const connections = [];
  for (const name of ['main', 'other']) {
    const lock =
      name === 'main'
        ? baseline
        : { ...baseline, frontendName: name, models: {}, contracts: {} };
    const response = await repo.fetch(
      new Request('https://shared.test', {
        headers: {
          Upgrade: 'websocket',
          'x-zerospin-aggregate-id': key.aggregateId,
          'x-zerospin-aggregate-name': key.aggregateName,
          'x-zerospin-aggregate-version': key.aggregateVersion,
          'x-zerospin-user-id': key.userId,
          'x-zerospin-frontend-name': name,
          'x-zerospin-aggregate-frontend-lock': JSON.stringify(lock),
        },
      }),
    );
    const socket = response.webSocket;
    if (socket === null) throw new Error('Expected WebSocket');
    socket.accept();
    const replay = Promise.withResolvers<void>();
    const live = Promise.withResolvers<void>();
    const messages: IAggregateFrontendFinalizedCommand[] = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'aggregateFrontendCommand') {
        messages.push(message.sync);
        if (message.sync.userIndex === 3) live.resolve();
      }
      if (message.type === 'replay-complete') replay.resolve();
    });
    socket.send(JSON.stringify({ userIndex: 0 }));
    await replay.promise;
    connections.push({ name, lock, socket, messages, live });
  }
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(2))));
  for (const connection of connections) {
    await connection.live.promise;
    expect(connection.messages.map(entry => entry.userIndex)).toEqual([
      1, 2, 3,
    ]);
    for (const entry of connection.messages) {
      expect(entry.delta.inserted).toHaveLength(
        connection.name === 'main' ? 2 : 0,
      );
      expect(entry.resolution?.command.frontendName ?? null).toBe(
        connection.name === 'main' ? 'main' : null,
      );
    }
    const paged = await Effect.runPromise(
      decodeRpc(
        await repo.getCommands({
          afterUserIndex: 0,
          frontend: { name: connection.name, lock: connection.lock },
        }),
      ),
    );
    expect(paged.commands.map(entry => entry.delta.inserted.length)).toEqual(
      connection.messages.map(entry => entry.delta.inserted.length),
    );
    connection.socket.close(1000);
  }
});

it('persists before acknowledgement and replays strictly after the supplied snapshot cursor over a real WebSocket', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        aggregateId: 'acct_replay069',
        aggregateName: 'user',
        aggregateVersion: '1.0.0',
        userId: 'usr_replay069',
        frontendName: 'main',
      };
      const repo = yield* UserVersionedAggregateChain.getRepo({ key });
      const receiver = yield* makeAsync(() => repo.deltasSubscriber);
      const rows = [1, 2].map(index => ({
        outboxIndex: index,
        output: JSON.stringify({
          userIndex: index,
          aggregateIndex: 0,
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          resolution: null,
        }),
        deliveredAt: null,
        lastDeliveryFailure: null,
      }));
      yield* makeAsync(() => receiver.receive(rows)).pipe(
        Effect.flatMap(decodeRpc),
      );
      yield* makeAsync(() => receiver.receive(rows)).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(
        (yield* makeAsync(() => repo.getCommands({ afterUserIndex: 0 })).pipe(
          Effect.flatMap(decodeRpc),
        )).commands,
      ).toHaveLength(2);
      const gap = yield* makeAsync(() =>
        receiver.receive([
          {
            ...rows[0]!,
            outboxIndex: 4,
            output: rows[0]!.output.replace('"userIndex":1', '"userIndex":4'),
          },
        ]),
      ).pipe(Effect.flatMap(decodeRpc), Effect.result);
      expect(Result.isFailure(gap)).toBe(true);
      const response = yield* makeAsync(() =>
        repo.fetch(
          new Request('https://replay.test/', {
            headers: {
              Upgrade: 'websocket',
              'x-zerospin-aggregate-id': key.aggregateId,
              'x-zerospin-aggregate-name': key.aggregateName,
              'x-zerospin-aggregate-version': key.aggregateVersion,
              'x-zerospin-user-id': key.userId,
              'x-zerospin-frontend-name': key.frontendName,
              'x-zerospin-aggregate-frontend-lock': JSON.stringify(
                makeAggregateFrontendLock({ frontend: main }),
              ),
            },
          }),
        ),
      );
      const socket = response.webSocket;
      if (socket === null) throw new Error('Expected WebSocket upgrade');
      socket.accept();
      const completed = Promise.withResolvers<void>();
      const indexes: number[] = [];
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'aggregateFrontendCommand') {
          indexes.push(message.sync.userIndex);
          expect(message.sync.aggregateIndex).toBe(0);
        }
        if (message.type === 'replay-complete') completed.resolve();
      });
      socket.send(JSON.stringify({ userIndex: 1 }));
      yield* makeAsync(() => completed.promise);
      expect(indexes).toEqual([2]);
      socket.close(1000);
    }).pipe(Effect.provide(AsyncLive)),
  );
});
