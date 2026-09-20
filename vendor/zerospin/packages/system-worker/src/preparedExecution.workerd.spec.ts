import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateSelectedCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { AggregateChain } from './AggregateChain/AggregateChain.js';
import { main } from './fixtures/system.js';
import { GatewayApi } from './GatewayApi/GatewayApi.js';
import { makeSystemRuntime } from './makeSystemRuntime.js';
import { SelectionVersionedAggregateChain } from './SelectionVersionedAggregateChain/SelectionVersionedAggregateChain.js';
import { SelectionVersionedAggregateRepo } from './SelectionVersionedAggregateRepo/SelectionVersionedAggregateRepo.js';
import { VersionedAggregateChain } from './VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';

it('prepares in VAR, publishes per-command output, and recovers terminal results after outbox deletion and cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_prepared',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
  };
  const view = { ...key, selectionPath: '/usr_prepared', frontendName: 'main' };
  const commands = [
    Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: 'cmd_prepared_user',
      commandName: 'createUser',
      payload: JSON.stringify({ id: 'usr_prepared', name: 'Prepared' }),
      contractVersion: '1.0.0',
      aggregateId: key.aggregateId,
      aggregateVersion: '1.0.0',
      aggregateName: 'user',
      systemName: 'system-worker',
      authentication: null,
      sessionId: null,
      frontendName: null,
      pushIndex: null,
    }),
    ...['accepted', 'invalid-name', 'invalid-aggregate-name'].map(
      (name, index) =>
        Schema.decodeUnknownSync(Schema.toType(SessionCommandSchema))({
          sessionIndex: index + 1,
          chainedAt: new Date(1),
          delta: { inserted: [], updated: [], deleted: [], mutations: [] },
          failedAt: null,
          failure: null,
          id: `cmd_prepared_list_${index}`,
          commandName: 'createList',
          payload: JSON.stringify({
            id: `lst_prepared_${index}`,
            userId: 'usr_prepared',
            name,
          }),
          contractVersion: '1.0.0',
          aggregateId: key.aggregateId,
          aggregateName: 'user',
          systemName: 'system-worker',
          authentication: {
            userId: 'usr_prepared',
            aggregateId: key.aggregateId,
          },
          sessionId: 'sesn_prepared',
          frontendName: 'main',
          pushIndex: null,
        }),
    ),
  ];
  const before = await Effect.runPromise(
    Effect.gen(function* () {
      const chain = yield* AggregateChain.getRepo({ key });
      const receipts = yield* makeAsync(() =>
        chain.admitCommands({ commands: [commands[0]!] }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(receipts).toEqual([
        { aggregateIndex: 1, commandId: commands[0]!.id },
      ]);
      const runtime = makeSystemRuntime();
      const initialRepo = yield* VersionedAggregateRepo.getRepo({ key });
      yield* makeAsync(() => initialRepo.flush(1)).pipe(
        Effect.flatMap(decodeRpc),
      );
      const gateway = new GatewayApi({ runtime });
      const admission = {
        publishableKey: 'pk_test',
        systemName: main.systemName,

        signature: { userId: 'usr_prepared', aggregateId: key.aggregateId },
        aggregateName: key.aggregateName,
        aggregateVersion: key.aggregateVersion,
        frontendName: view.frontendName,
        aggregateFrontendLock: makeAggregateFrontendLock({ frontend: main }),
      };
      const api = yield* makeAsync(() => admitAggregate(gateway, admission));
      const denied = yield* makeAsync(() =>
        admitAggregate(gateway, {
          ...admission,
          signature: { userId: 'usr_missing', aggregateId: key.aggregateId },
        }),
      );
      expect(
        (yield* makeAsync(() =>
          denied.getSnapshot({
            args: [{ pendingCommandIds: [] }],
            traceContext: null,
          }),
        )).result._tag,
      ).toBe('Failure');
      const readOnly = yield* makeAsync(() =>
        admitAggregate(gateway, {
          ...admission,
          aggregateFrontendLock: {
            ...admission.aggregateFrontendLock,
            contracts: {},
          },
        }),
      );
      for (const [index, attempt] of [
        {
          api: readOnly,
          command: commands[1]!,
          failure: 'aggregate-frontend-command-contract-unavailable',
        },
        {
          api,
          command: {
            ...commands[1]!,
            authentication: { ...admission.signature, role: 'stale' },
          },
          failure: 'aggregate-frontend-command-target-mismatch',
        },
        ...commands.slice(1).map(command => ({ api, command, failure: null })),
      ].entries()) {
        yield* makeAsync(() =>
          attempt.api.getSnapshot({
            args: [{ pendingCommandIds: [] }],
            traceContext: null,
          }),
        ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
        const ticket = yield* makeAsync(() =>
          attempt.api.createWebSocketTicket({
            args: [{ aggregateVersion: key.aggregateVersion }],
            traceContext: null,
          }),
        ).pipe(Effect.flatMap(envelope => decodeRpc(envelope.result)));
        const response = yield* makeAsync(() =>
          env.SYSTEM_REPO.getByName(key.systemId).fetch(
            new Request(
              `https://test/ws-aggregate-frontend-commands?ticket=${ticket.ticket}`,
              { headers: { Upgrade: 'websocket' } },
            ),
          ),
        );
        const socket = response.webSocket;
        if (socket === null) throw new Error('Expected admitted WebSocket');
        socket.accept();
        const live = Promise.withResolvers<void>();
        const receipt = Promise.withResolvers<unknown>();
        socket.addEventListener('message', event => {
          const message = JSON.parse(String(event.data));
          if (message.type === 'replay-complete') live.resolve();
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
        yield* makeAsync(() => live.promise);
        socket.send(
          JSON.stringify({
            type: 'pushAggregateCommand',
            command: attempt.command,
            traceContext: null,
          }),
        );
        const envelope = yield* makeAsync(() => receipt.promise);
        if (attempt.failure !== null) {
          expect(envelope).toMatchObject({
            type: 'aggregateCommandAdmission',
            commandId: attempt.command.id,
            result: { _tag: 'Failure', failure: { code: attempt.failure } },
          });
        } else {
          expect(envelope).toMatchObject({
            type: 'aggregateCommandAdmission',
            commandId: attempt.command.id,
            result: {
              _tag: 'Success',
              success: { aggregateIndex: index, commandId: attempt.command.id },
            },
          });
        }
        socket.close(1000);
      }
      const aggregateRepo = yield* VersionedAggregateRepo.getRepo({ key });
      const admitted = yield* makeAsync(async () =>
        (await chain.versionedAggregateFanoutQueue).getPage({
          afterIndex: 0,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const subscriber = yield* makeAsync(() =>
        aggregateRepo.versionedAggregateFanoutQueueSubscriber(key),
      );
      yield* makeAsync(() =>
        subscriber.receive({
          rows: admitted.rows,
          lastIndex: admitted.lastIndex,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const checkpoint = yield* makeAsync(() => aggregateRepo.flush(4)).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(checkpoint.aggregateIndex).toBe(4);
      const finalized = yield* VersionedAggregateChain.getRepo({
        key,
      });
      const history = yield* makeAsync(async () =>
        (await finalized.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(history.rows).toHaveLength(4);
      const results = history.rows.map(row => JSON.parse(row.entry));
      expect(results.map(entry => entry.command.failure?.code ?? null)).toEqual(
        [null, null, 'list-name-rejected', 'aggregate-list-name-rejected'],
      );
      expect(results[1].mutations).toHaveLength(1);
      const replica = yield* SelectionVersionedAggregateRepo.getRepo({
        key: view,
      });
      const state = yield* makeAsync(() =>
        replica.getSnapshot({
          ...view,
          authentication: admission.signature,
          pendingCommandIds: [
            'cmd_prepared_list_0',
            'cmd_prepared_list_1',
            'cmd_prepared_list_2',
            'cmd_missing',
          ],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const narrowLock = {
        ...admission.aggregateFrontendLock,
        frontendName: 'other',
        models: { user: admission.aggregateFrontendLock.models.user! },
        contracts: {},
      };
      const narrowApi = yield* makeAsync(() =>
        admitAggregate(gateway, {
          ...admission,
          frontendName: 'other',
          aggregateFrontendLock: narrowLock,
        }),
      );
      const narrowEnvelope = yield* makeAsync(() =>
        narrowApi.getSnapshot({
          args: [{ pendingCommandIds: ['cmd_prepared_list_0'] }],
          traceContext: null,
        }),
      );
      const narrowState = yield* decodeRpc(narrowEnvelope.result);
      expect(narrowState.resources.map(resource => resource.modelName)).toEqual(
        ['user'],
      );
      expect(narrowState.selectedCommands).toEqual([]);
      expect(narrowState.selectionIndex).toBe(state.selectionIndex);
      expect(state.aggregateIndex).toBe(4);
      expect(state.selectedCommands.map(entry => entry.id)).toEqual([
        'cmd_prepared_list_0',
        'cmd_prepared_list_1',
        'cmd_prepared_list_2',
      ]);
      expect(
        state.selectedCommands.map(entry => entry.failure?.code ?? null),
      ).toEqual([null, 'list-name-rejected', 'aggregate-list-name-rejected']);
      const throughTwo = yield* SelectionVersionedAggregateChain.getRepo({
        key: view,
      });
      const earlier = yield* makeAsync(() =>
        throughTwo.getSelectedCommands({
          afterSelectionIndex: 0,
          reconcile: {
            commandIds: ['cmd_prepared_list_0', 'cmd_prepared_list_1'],
            frontendName: 'main',
            authentication: admission.signature,
            throughSelectionIndex: 2,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(earlier.commands.map(entry => entry.id)).toEqual([
        'cmd_prepared_list_0',
      ]);
      const otherFrontend = yield* makeAsync(() =>
        throughTwo.getSelectedCommands({
          afterSelectionIndex: 0,
          reconcile: {
            commandIds: ['cmd_prepared_list_0'],
            frontendName: 'other',
            authentication: admission.signature,
            throughSelectionIndex: 4,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(otherFrontend.commands).toEqual([]);
      expect(
        state.resources.filter(row => row.modelName === 'list'),
      ).toHaveLength(1);
      const frontend = yield* SelectionVersionedAggregateChain.getRepo({
        key: view,
      });
      const outputs = yield* makeAsync(() =>
        frontend.getSelectedCommands({ afterSelectionIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(outputs.commands.map(command => command.aggregateIndex)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(
        new Set(outputs.commands.map(command => command.selectionHash)).size,
      ).toBe(4);
      expect(outputs.commands[0]?.failure).toBeNull();
      expect(outputs.commands[2]?.failure).toBeNull();
      expect(outputs.commands[2]?.delta).toEqual({
        upserted: [],
        deleted: [],
      });
      expect(outputs.tip).toBeGreaterThanOrEqual(state.aggregateIndex);
      expect(
        (yield* makeAsync(() =>
          frontend.getSelectedCommands({
            afterSelectionIndex: state.selectionIndex,
          }),
        ).pipe(Effect.flatMap(decodeRpc))).commands,
      ).toEqual([]);
      const retried = yield* makeAsync(() =>
        chain.executeAggregateCommand({
          aggregateVersion: key.aggregateVersion,
          command: commands[1]!,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(JSON.stringify(retried)).toBe(JSON.stringify(results[1].command));
      yield* makeAsync(() => runtime.dispose());
      return JSON.stringify(retried);
    }).pipe(Effect.provide(AsyncLive)),
  );
  await abortAllDurableObjects();
  await Effect.runPromise(
    Effect.gen(function* () {
      const chain = yield* AggregateChain.getRepo({ key });
      const retried = yield* makeAsync(() =>
        chain.executeAggregateCommand({
          aggregateVersion: key.aggregateVersion,
          command: commands[1]!,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(JSON.stringify(retried)).toBe(before);
      const finalized = yield* VersionedAggregateChain.getRepo({
        key,
      });
      expect(
        (yield* makeAsync(async () =>
          (await finalized.replicaFanoutQueue).getPage({ afterIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc))).rows,
      ).toHaveLength(4);
    }).pipe(Effect.provide(AsyncLive)),
  );
});

it('publishes subscriber-committed results from its retained alarm after cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_subscriber_resume',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
  };
  await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* VersionedAggregateRepo.getRepo({ key });
      // Hold publication in this activation so the committed outbox must resume cold.
      yield* makeAsync(() =>
        runInDurableObject(repo, instance => {
          Reflect.set(instance.executedCommands, 'drain', () => Effect.void);
        }),
      );
      const subscriber = yield* makeAsync(() =>
        repo.versionedAggregateFanoutQueueSubscriber(key),
      );
      yield* makeAsync(() =>
        subscriber.receive({
          lastIndex: 1,
          rows: [
            {
              aggregateIndex: 1,
              chainedAt: new Date(1),
              command: JSON.stringify({
                id: 'cmd_subscriber_resume',
                commandName: 'createUser',
                payload: JSON.stringify({
                  id: 'usr_subscriber_resume',
                  name: 'Resume',
                }),
                contractVersion: '1.0.0',
                aggregateId: key.aggregateId,
                aggregateVersion: '1.0.0',
                aggregateName: key.aggregateName,
                systemName: 'system-worker',
                authentication: null,
                sessionId: null,
                frontendName: null,
                pushIndex: null,
              }),
            },
          ],
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        yield* makeAsync(() =>
          runInDurableObject(repo, (_instance, state) =>
            state.storage.getAlarm(),
          ),
        ),
      ).not.toBeNull();
    }).pipe(Effect.provide(AsyncLive)),
  );
  await abortAllDurableObjects();
  await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* VersionedAggregateRepo.getRepo({ key });
      yield* makeAsync(() => runDurableObjectAlarm(repo));
      const finalized = yield* VersionedAggregateChain.getRepo({
        key,
      });
      const history = yield* makeAsync(async () =>
        (await finalized.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(history.rows).toHaveLength(1);
      expect(JSON.parse(history.rows[0]!.entry).command.id).toBe(
        'cmd_subscriber_resume',
      );
      const terminal = yield* makeAsync(() =>
        repo.execute({ aggregateIndex: 1 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(terminal.id).toBe('cmd_subscriber_resume');
    }).pipe(Effect.provide(AsyncLive)),
  );
});

async function admitAggregate(
  gateway: GatewayApi,
  request: {
    publishableKey: string;
    systemName: string;
    aggregateName: string;
    aggregateVersion: string;
    signature: unknown;
    frontendName: string;
    aggregateFrontendLock: Parameters<
      Awaited<
        ReturnType<Awaited<ReturnType<GatewayApi['aggregate']>>['authenticate']>
      >['authorize']
    >[0]['aggregateFrontendLock'];
  },
) {
  const aggregate = await gateway.aggregate({
    publishableKey: request.publishableKey,
    systemName: request.systemName,
    name: request.aggregateName,
    version: request.aggregateVersion,
  });
  const access = await aggregate.authenticate({ signature: request.signature });
  return access.authorize({
    frontendName: request.frontendName,
    aggregateFrontendLock: request.aggregateFrontendLock,
  });
}
