import { RoutePattern } from '@remix-run/route-pattern';
import { createHref } from '@remix-run/route-pattern/href';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { products } from '../fixtures/system.js';

import { FrontendServiceChain } from './FrontendServiceChain.js';

it('retains exact service output and replays strictly after a nonzero version-pinned cursor', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'app',
        serviceVersion: '1.0.0',
        selectionPath: createHref(RoutePattern.parse('/:userId'), {
          userId: 'usr_replay071',
        }),
        frontendName: 'products',
      };
      const repo = yield* FrontendServiceChain.getRepo({
        key,
      });
      const receiver = yield* makeAsync(() => repo.deltasSubscriber);
      const rows = [1, 2].map(index => ({
        outboxIndex: index,
        output: JSON.stringify({
          id: `cmd_replay071_${index}`,
          serviceName: 'app',
          serviceVersion: '1.0.0',
          commandName: 'createProduct',
          contractVersion: '1.0.0',
          payload: '{}',
          chainedAt: new Date(index),
          serviceIndex: index,
          dispositionHash: 'a'.repeat(64),
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          failedAt: null,
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
      const conflict = yield* makeAsync(() =>
        receiver.receive([
          {
            ...rows[0]!,
            output: rows[0]!.output.replace('createProduct', 'deleteProduct'),
          },
        ]),
      ).pipe(Effect.flatMap(decodeRpc), Effect.result);
      expect(conflict._tag).toBe('Failure');
      const gap = yield* makeAsync(() =>
        receiver.receive([
          {
            ...rows[1]!,
            outboxIndex: 4,
            output: rows[1]!.output.replace(
              '"serviceIndex":2',
              '"serviceIndex":4',
            ),
          },
        ]),
      ).pipe(Effect.flatMap(decodeRpc), Effect.result);
      expect(gap._tag).toBe('Failure');
      const response = yield* makeAsync(() =>
        repo.fetch(
          new Request('https://service-replay.test/', {
            headers: {
              Upgrade: 'websocket',
              'x-zerospin-service-name': key.serviceName,
              'x-zerospin-service-version': key.serviceVersion,
              'x-zerospin-selection-path': key.selectionPath,
              'x-zerospin-authentication': JSON.stringify({
                userId: decodeURIComponent(key.selectionPath.slice(1)),
              }),
              'x-zerospin-frontend-name': key.frontendName,
              'x-zerospin-service-frontend-lock': JSON.stringify(
                makeServiceFrontendLock({
                  frontend: products,
                }),
              ),
            },
          }),
        ),
      );
      const socket = response.webSocket;
      if (!socket) throw new Error('Expected a WebSocket');
      socket.accept();
      const completed = Promise.withResolvers<void>();
      const indices: number[] = [];
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (message.type === 'serviceFrontendCommand') {
          indices.push(message.sync.serviceIndex);
        }
        if (message.type === 'replay-complete') completed.resolve();
      });
      socket.addEventListener('close', () =>
        completed.reject(new Error('Socket closed before replay completed')),
      );
      socket.send(JSON.stringify({ serviceIndex: 1 }));
      yield* makeAsync(() => completed.promise);
      expect(indices).toEqual([2]);
      socket.close(1000);
    }).pipe(Effect.provide(AsyncLive)),
  );
});

it('isolates two subsets sharing a frontend name across replay, live deltas, deletion and restart', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    serviceName: 'app',
    serviceVersion: '1.0.0',
    selectionPath: '/usr_subsets082',
    frontendName: 'products',
  };
  const repo = await Effect.runPromise(FrontendServiceChain.getRepo({ key }));
  const receiver = await repo.deltasSubscriber;
  const lock = makeServiceFrontendLock({ frontend: products });
  const product = {
    modelName: 'product',
    version: '1.0.0',
    id: 'prd_subset082',
    name: 'Selected',
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(1).toISOString(),
  };
  const rows = [1, 2, 3].map(index => ({
    outboxIndex: index,
    output: JSON.stringify({
      id: `cmd_subset082_${index}`,
      serviceName: 'app',
      serviceVersion: '1.0.0',
      commandName: 'createProduct',
      contractVersion: '1.0.0',
      payload: '{}',
      chainedAt: new Date(index),
      serviceIndex: index,
      dispositionHash: 'b'.repeat(64),
      failedAt: null,
      failure: null,
      delta: {
        inserted: index === 1 ? [product] : [],
        updated: index === 2 ? [{ ...product, name: 'Updated' }] : [],
        deleted: index === 3 ? [{ modelName: 'product', id: product.id }] : [],
        mutations: [],
      },
    }),
    deliveredAt: null,
    lastDeliveryFailure: null,
  }));
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(0, 1))));
  const connect = async (models: typeof lock.models, cursor: number) => {
    const activeRepo = await Effect.runPromise(
      FrontendServiceChain.getRepo({ key }),
    );
    const response = await activeRepo.fetch(
      new Request('https://service-subsets.test/', {
        headers: {
          Upgrade: 'websocket',
          'x-zerospin-service-name': key.serviceName,
          'x-zerospin-service-version': key.serviceVersion,
          'x-zerospin-selection-path': key.selectionPath,
          'x-zerospin-authentication': JSON.stringify({
            userId: 'usr_subsets082',
          }),
          'x-zerospin-frontend-name': key.frontendName,
          'x-zerospin-service-frontend-lock': JSON.stringify({
            ...lock,
            models,
          }),
        },
      }),
    );
    const socket = response.webSocket;
    if (socket === null) throw new Error('Expected WebSocket');
    socket.accept();
    const commands: Array<{
      serviceIndex: number;
      delta: {
        inserted: unknown[];
        updated: unknown[];
        deleted: unknown[];
        mutations: unknown[];
      };
    }> = [];
    const replayed = Promise.withResolvers<void>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.type === 'serviceFrontendCommand') {
        commands.push(message.sync);
      }
      if (message.type === 'replay-complete') replayed.resolve();
      if (message.type === 'state-required') {
        replayed.reject(new Error('Unexpected state-required'));
      }
    });
    socket.send(JSON.stringify({ serviceIndex: cursor }));
    await replayed.promise;
    return { socket, commands };
  };
  const productModel = lock.models.product;
  if (productModel === undefined) throw new Error('Missing product lock');
  const selected = await connect({ product: productModel }, 0);
  const empty = await connect({}, 0);
  expect(selected.commands[0]?.delta.inserted).toEqual([product]);
  expect(empty.commands[0]?.delta.inserted).toEqual([]);
  await Effect.runPromise(decodeRpc(await receiver.receive(rows.slice(1))));
  await expect
    .poll(() => [selected.commands.length, empty.commands.length])
    .toEqual([3, 3]);
  expect(selected.commands.map(command => command.serviceIndex)).toEqual([
    1, 2, 3,
  ]);
  expect(selected.commands[1]?.delta.updated).toEqual([
    { ...product, name: 'Updated' },
  ]);
  expect(selected.commands[2]?.delta.deleted).toEqual([
    { modelName: 'product', id: product.id },
  ]);
  expect(empty.commands.map(command => command.delta)).toEqual(
    Array.from({ length: 3 }, () => ({
      inserted: [],
      updated: [],
      deleted: [],
      mutations: [],
    })),
  );
  await Effect.runPromise(decodeRpc(await receiver.receive(rows)));
  selected.socket.close(1000);
  empty.socket.close(1000);
  const { abortAllDurableObjects } = await import('cloudflare:test');
  await abortAllDurableObjects();
  const reopened = await connect({ product: productModel }, 1);
  expect(reopened.commands.map(command => command.serviceIndex)).toEqual([
    2, 3,
  ]);
  reopened.socket.close(1000);
});
