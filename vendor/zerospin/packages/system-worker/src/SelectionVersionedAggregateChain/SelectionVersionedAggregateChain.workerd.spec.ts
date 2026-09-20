import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateSelectedCommand } from '@zerospin/core/session/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env, runInDurableObject } from 'cloudflare:test';
import { Effect, Result } from 'effect';
import { expect, it } from 'vitest';

import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import { main } from '../fixtures/system.js';
import { SystemLogRepo } from '../SystemLogRepo/SystemLogRepo.js';

import { SelectionVersionedAggregateChain } from './SelectionVersionedAggregateChain.js';

it('shares one history across concurrent frontend locks and filters replay and live delivery without cursor gaps', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_shared_locks',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    selectionPath: createHref(RoutePattern.parse('/:userId'), {
      userId: 'usr_shared',
    }),
  };
  const repo = await Effect.runPromise(
    SelectionVersionedAggregateChain.getRepo({ key }),
  );
  const receiver = await repo.selectedCommandsSubscriber;
  const time = '2026-09-09T12:00:00.000Z';
  const resources = [
    {
      id: 'usr_shared',
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
      userId: 'usr_shared',
    },
  ];
  const rows = [1, 2, 3].map(selectionIndex => ({
    outboxIndex: selectionIndex,
    deliveredAt: null,
    lastDeliveryFailure: null,
    authentication: JSON.stringify({
      userId: 'usr_shared',
      aggregateId: key.aggregateId,
    }),
    frontendName: 'main',
    output: JSON.stringify({
      id: `cmd_shared_${selectionIndex}`,
      selectionIndex,
      selectionHash:
        'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      aggregateIndex: selectionIndex,
      delta: { upserted: resources, deleted: [] },
      failure:
        selectionIndex === 2
          ? {
              code: 'rejected',
              message: 'Rejected',
              cause: null,
              extra: null,
              status: null,
            }
          : null,
    }),
  }));
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(0, 2))));
  const baseline = makeAggregateFrontendLock({ frontend: main });
  const connections = [];
  for (const recipient of [
    {
      name: 'main',
      authentication: { userId: 'usr_shared', aggregateId: key.aggregateId },
    },
    {
      name: 'other',
      authentication: { userId: 'usr_shared', aggregateId: key.aggregateId },
    },
    {
      name: 'main',
      authentication: {
        userId: 'usr_shared',
        aggregateId: key.aggregateId,
        role: 'different',
      },
    },
  ]) {
    const { name, authentication } = recipient;
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
          'x-zerospin-selection-path': key.selectionPath,
          'x-zerospin-authentication': JSON.stringify(authentication),
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
    const messages: IAggregateSelectedCommand[] = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'aggregateSelectedCommand') {
        messages.push(message.command);
        if (message.command.selectionIndex === 3) live.resolve();
      }
      if (message.type === 'replay-complete') replay.resolve();
    });
    socket.send(
      JSON.stringify({
        selectionIndex: 0,
        selectionHash:
          'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      }),
    );
    await replay.promise;
    connections.push({ name, authentication, lock, socket, messages, live });
  }
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(2))));
  for (const connection of connections) {
    await connection.live.promise;
    expect(connection.messages.map(entry => entry.selectionIndex)).toEqual([
      1, 2, 3,
    ]);
    for (const entry of connection.messages) {
      expect(entry.delta.upserted).toHaveLength(
        connection.name === 'main' ? 2 : 0,
      );
      expect(entry.failure?.code ?? null).toBe(
        connection.name === 'main' && !('role' in connection.authentication)
          ? entry.selectionIndex === 2
            ? 'rejected'
            : null
          : null,
      );
    }
    const paged = await Effect.runPromise(
      decodeRpc(
        await repo.getSelectedCommands({
          afterSelectionIndex: 0,
          frontend: {
            name: connection.name,
            authentication: connection.authentication,
            lock: connection.lock,
          },
        }),
      ),
    );
    expect(paged.commands.map(entry => entry.delta.upserted.length)).toEqual(
      connection.messages.map(entry => entry.delta.upserted.length),
    );
    expect(
      JSON.parse(JSON.stringify(paged.commands.map(entry => entry.failure))),
    ).toEqual(connection.messages.map(entry => entry.failure));
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
        selectionPath: createHref(RoutePattern.parse('/:userId'), {
          userId: 'usr_replay069',
        }),
        frontendName: 'main',
      };
      const repo = yield* SelectionVersionedAggregateChain.getRepo({ key });
      const receiver = yield* makeAsync(() => repo.selectedCommandsSubscriber);
      const rows = [1, 2].map(index => ({
        outboxIndex: index,
        authentication: 'null',
        frontendName: null,
        output: JSON.stringify({
          id: `cmd_replay069_${index}`,
          selectionIndex: index,
          selectionHash:
            'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
          aggregateIndex: 0,
          delta: { upserted: [], deleted: [] },
          failure: null,
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
        (yield* makeAsync(() =>
          repo.getSelectedCommands({ afterSelectionIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc))).commands,
      ).toHaveLength(2);
      const gap = yield* makeAsync(() =>
        receiver.receive([
          {
            ...rows[0]!,
            outboxIndex: 4,
            output: rows[0]!.output.replace(
              '"selectionIndex":1',
              '"selectionIndex":4',
            ),
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
              'x-zerospin-selection-path': key.selectionPath,
              'x-zerospin-authentication': JSON.stringify({
                userId: decodeURIComponent(key.selectionPath.slice(1)),
                aggregateId: key.aggregateId,
              }),
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
        if (message.type === 'aggregateSelectedCommand') {
          indexes.push(message.command.selectionIndex);
          expect(message.command.aggregateIndex).toBe(0);
        }
        if (message.type === 'replay-complete') completed.resolve();
      });
      socket.send(
        JSON.stringify({
          selectionIndex: 1,
          selectionHash:
            'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        }),
      );
      yield* makeAsync(() => completed.promise);
      expect(indexes).toEqual([2]);
      socket.close(1000);

      const mismatchResponse = yield* makeAsync(() =>
        repo.fetch(
          new Request('https://replay.test/', {
            headers: {
              Upgrade: 'websocket',
              'x-zerospin-aggregate-id': key.aggregateId,
              'x-zerospin-aggregate-name': key.aggregateName,
              'x-zerospin-aggregate-version': key.aggregateVersion,
              'x-zerospin-selection-path': key.selectionPath,
              'x-zerospin-authentication': JSON.stringify({
                userId: decodeURIComponent(key.selectionPath.slice(1)),
                aggregateId: key.aggregateId,
              }),
              'x-zerospin-frontend-name': key.frontendName,
              'x-zerospin-aggregate-frontend-lock': JSON.stringify(
                makeAggregateFrontendLock({ frontend: main }),
              ),
            },
          }),
        ),
      );
      const mismatchSocket = mismatchResponse.webSocket;
      if (mismatchSocket === null) {
        throw new Error('Expected WebSocket upgrade');
      }
      mismatchSocket.accept();
      const stateRequired = Promise.withResolvers<void>();
      mismatchSocket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'state-required') stateRequired.resolve();
      });
      mismatchSocket.send(
        JSON.stringify({ selectionIndex: 1, selectionHash: '0'.repeat(64) }),
      );
      yield* makeAsync(() => stateRequired.promise);
      mismatchSocket.close(1000);
    }).pipe(Effect.provide(AsyncLive)),
  );
});

it('admits unchanged occurrences on a live socket, recovers identical retries, and rejects protocol violations', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_socket085',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    selectionPath: '/usr_socket085',
  };
  const repo = await Effect.runPromise(
    SelectionVersionedAggregateChain.getRepo({ key }),
  );
  const authentication = {
    userId: 'usr_socket085',
    aggregateId: key.aggregateId,
  };
  const command = {
    id: 'cmd_socket085',
    commandName: 'createList',
    payload: '{"id":"lst_socket085","userId":"usr_socket085","name":"socket"}',
    contractVersion: '1.0.0',
    aggregateId: key.aggregateId,
    aggregateName: key.aggregateName,
    systemName: 'system-worker',
    authentication,
    frontendName: 'main',
    sessionId: 'sesn_socket085',
    sessionIndex: 1,
    pushIndex: null,
    chainedAt: '2026-09-20T01:02:03.000Z',
    delta: { inserted: [], updated: [], deleted: [], mutations: [] },
    failedAt: null,
    failure: null,
  };
  for (const scenario of [
    'before-resume',
    'success',
    'retry',
    'conflict',
    'telemetry-failure',
    'target',
    'contract',
    'malformed',
    'overlap',
  ]) {
    const response = await repo.fetch(
      new Request('https://socket.test', {
        headers: {
          Upgrade: 'websocket',
          'x-zerospin-aggregate-id': key.aggregateId,
          'x-zerospin-aggregate-name': key.aggregateName,
          'x-zerospin-aggregate-version': key.aggregateVersion,
          'x-zerospin-selection-path': key.selectionPath,
          'x-zerospin-authentication': JSON.stringify(authentication),
          'x-zerospin-frontend-name': 'main',
          'x-zerospin-aggregate-frontend-lock': JSON.stringify(
            makeAggregateFrontendLock({ frontend: main }),
          ),
        },
      }),
    );
    const socket = response.webSocket;
    if (socket === null) throw new Error('Expected WebSocket');
    socket.accept();
    const live = Promise.withResolvers<void>();
    const receipt = Promise.withResolvers<unknown>();
    const closed = Promise.withResolvers<void>();
    socket.addEventListener('close', () => closed.resolve());
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'replay-complete') live.resolve();
      if (message.type === 'aggregateCommandAdmission') {
        receipt.resolve(message);
      }
    });
    if (scenario !== 'before-resume') {
      socket.send(
        JSON.stringify({
          selectionIndex: 0,
          selectionHash:
            'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
        }),
      );
      await live.promise;
    }
    if (scenario === 'telemetry-failure') {
      const log = await Effect.runPromise(
        SystemLogRepo.getRepo({ key: { systemId: key.systemId } }),
      );
      await runInDurableObject(log, instance => {
        const prototype = Object.getPrototypeOf(instance);
        const descriptor = Object.getOwnPropertyDescriptor(
          prototype,
          'appendTelemetryBatch',
        );
        if (descriptor === undefined) {
          throw new Error('Missing telemetry method');
        }
        Object.defineProperty(prototype, 'appendTelemetryBatch', {
          ...descriptor,
          value: async () => {
            Object.defineProperty(
              prototype,
              'appendTelemetryBatch',
              descriptor,
            );
            return {
              _tag: 'Failure',
              failure: {
                code: 'telemetry-unavailable',
                message: 'unavailable',
                cause: null,
                extra: null,
                status: null,
              },
            };
          },
        });
      });
    }
    socket.send(
      JSON.stringify({
        type: 'pushAggregateCommand',
        command:
          scenario === 'target'
            ? {
                ...command,
                authentication: { ...authentication, role: 'stale' },
              }
            : scenario === 'contract'
              ? { ...command, contractVersion: '0.0.1' }
              : scenario === 'conflict'
                ? { ...command, payload: '{}' }
                : command,
        traceContext: null,
        ...(scenario === 'malformed' ? { excess: true } : {}),
      }),
    );
    if (scenario === 'overlap') {
      socket.send(
        JSON.stringify({
          type: 'pushAggregateCommand',
          command,
          traceContext: null,
        }),
      );
    }
    if (['before-resume', 'malformed', 'overlap'].includes(scenario)) {
      await closed.promise;
    } else {
      expect(await receipt.promise).toMatchObject({
        type: 'aggregateCommandAdmission',
        commandId: command.id,
        ...(scenario === 'telemetry-failure' ? { link: null } : {}),
        result:
          scenario === 'target' ||
          scenario === 'contract' ||
          scenario === 'conflict'
            ? {
                _tag: 'Failure',
                failure: {
                  code:
                    scenario === 'target'
                      ? 'aggregate-frontend-command-target-mismatch'
                      : scenario === 'conflict'
                        ? 'aggregate-chain-command-conflict'
                        : 'aggregate-frontend-command-contract-unavailable',
                },
              }
            : {
                _tag: 'Success',
                success: { commandId: command.id, aggregateIndex: 1 },
              },
      });
      socket.close(1000);
    }
  }
  const chain = await Effect.runPromise(AggregateChain.getRepo({ key }));
  const page = await Effect.runPromise(
    decodeRpc(
      await (await chain.versionedAggregateFanoutQueue).getPage({
        afterIndex: 0,
      }),
    ),
  );
  expect(page.rows).toHaveLength(1);
  expect(JSON.parse(page.rows[0]!.command)).toEqual(command);
});

it('keeps selected delivery live during admission and recovers a durable receipt lost on close', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_lost085',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
    selectionPath: '/usr_lost085',
  };
  const repo = await Effect.runPromise(
    SelectionVersionedAggregateChain.getRepo({ key }),
  );
  const chain = await Effect.runPromise(AggregateChain.getRepo({ key }));
  let started = false;
  const release = Promise.withResolvers<void>();
  let admitted = false;
  await runInDurableObject(chain, instance => {
    const admit = instance.admitCommands.bind(instance);
    const prototype = Object.getPrototypeOf(instance);
    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      'admitCommands',
    );
    if (descriptor === undefined) throw new Error('Missing admission method');
    Object.defineProperty(prototype, 'admitCommands', {
      ...descriptor,
      value: async (props: Parameters<typeof instance.admitCommands>[0]) => {
        started = true;
        await release.promise;
        Object.defineProperty(prototype, 'admitCommands', descriptor);
        const result = await admit(props);
        admitted = true;
        return result;
      },
    });
  });
  const authentication = {
    userId: 'usr_lost085',
    aggregateId: key.aggregateId,
  };
  const command = {
    id: 'cmd_lost085',
    commandName: 'createList',
    payload: '{"id":"lst_lost085","userId":"usr_lost085","name":"lost"}',
    contractVersion: '1.0.0',
    aggregateId: key.aggregateId,
    aggregateName: key.aggregateName,
    systemName: 'system-worker',
    authentication,
    frontendName: 'main',
    sessionId: 'sesn_lost085',
    sessionIndex: 1,
    pushIndex: null,
    chainedAt: '2026-09-20T01:02:03.000Z',
    delta: { inserted: [], updated: [], deleted: [], mutations: [] },
    failedAt: null,
    failure: null,
  };
  for (const retry of [false, true]) {
    const response = await repo.fetch(
      new Request('https://lost.test', {
        headers: {
          Upgrade: 'websocket',
          'x-zerospin-aggregate-id': key.aggregateId,
          'x-zerospin-aggregate-name': key.aggregateName,
          'x-zerospin-aggregate-version': key.aggregateVersion,
          'x-zerospin-selection-path': key.selectionPath,
          'x-zerospin-authentication': JSON.stringify(authentication),
          'x-zerospin-frontend-name': 'main',
          'x-zerospin-aggregate-frontend-lock': JSON.stringify(
            makeAggregateFrontendLock({ frontend: main }),
          ),
        },
      }),
    );
    const socket = response.webSocket;
    if (socket === null) throw new Error('Expected WebSocket');
    socket.accept();
    const live = Promise.withResolvers<void>();
    const selected = Promise.withResolvers<void>();
    const receipt = Promise.withResolvers<unknown>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'replay-complete') live.resolve();
      if (message.type === 'aggregateSelectedCommand') selected.resolve();
      if (message.type === 'aggregateCommandAdmission') {
        receipt.resolve(message);
      }
    });
    socket.send(
      JSON.stringify({
        selectionIndex: 0,
        selectionHash:
          'd0e2a11643c9bf23800218703ef6f12a058b941fca272a34c57c14ea2a5e62dc',
      }),
    );
    await live.promise;
    socket.send(
      JSON.stringify({
        type: 'pushAggregateCommand',
        command,
        traceContext: { traceId: 'trc_caller', parentSpanId: 'spn_caller' },
      }),
    );
    if (!retry) {
      await expect.poll(() => started).toBe(true);
      await Effect.runPromise(
        decodeRpc(
          await (await repo.selectedCommandsSubscriber).receive([
            {
              outboxIndex: 1,
              deliveredAt: null,
              lastDeliveryFailure: null,
              authentication: JSON.stringify(authentication),
              frontendName: 'main',
              output: JSON.stringify({
                id: 'cmd_other085',
                selectionIndex: 1,
                selectionHash: 'a'.repeat(64),
                aggregateIndex: 0,
                delta: { upserted: [], deleted: [] },
                failure: null,
              }),
            },
          ]),
        ),
      );
      await selected.promise;
      socket.close(1000);
      release.resolve();
      await expect.poll(() => admitted).toBe(true);
    } else {
      expect(await receipt.promise).toMatchObject({
        type: 'aggregateCommandAdmission',
        commandId: command.id,
        result: {
          _tag: 'Success',
          success: { commandId: command.id, aggregateIndex: 1 },
        },
        link: {
          priorTraceId: 'trc_caller',
          priorSpanId: 'spn_caller',
          kind: 'causedBy',
        },
      });
      socket.close(1000);
    }
  }
  const page = await Effect.runPromise(
    decodeRpc(
      await (await chain.versionedAggregateFanoutQueue).getPage({
        afterIndex: 0,
      }),
    ),
  );
  expect(page.rows).toHaveLength(1);
  expect(JSON.parse(page.rows[0]!.command)).toEqual(command);
});
