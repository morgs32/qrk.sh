import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeServiceFrontendLock } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { system } from 'system';
import { expect, it } from 'vitest';

import { FrontendServiceChain } from './FrontendServiceChain.js';
it('retains exact service output and replays strictly after a nonzero version-pinned cursor', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'app',
        serviceVersion: '1.0.0',
        userId: 'usr_replay071',
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
              'x-zerospin-user-id': key.userId,
              'x-zerospin-frontend-name': key.frontendName,
              'x-zerospin-service-frontend-lock': JSON.stringify(
                makeServiceFrontendLock({
                  frontend:
                    system.services.app['1.0.0'].frontends.products.controller,
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
