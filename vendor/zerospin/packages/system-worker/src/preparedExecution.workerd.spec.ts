import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { makeAuthenticationLock } from '@zerospin/core/authentication/makeAuthenticationLock';
import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeAggregateFrontendLock } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import {
  abortAllDurableObjects,
  env,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { AggregateChain } from './AggregateChain/AggregateChain.js';
import { authenticationSignature, main } from './fixtures/system.js';
import { GatewayApi } from './GatewayApi/GatewayApi.js';
import { makeSystemRuntime } from './makeSystemRuntime.js';
import { UserVersionedAggregateChain } from './UserVersionedAggregateChain/UserVersionedAggregateChain.js';
import { UserVersionedAggregateRepo } from './UserVersionedAggregateRepo/UserVersionedAggregateRepo.js';
import { VersionedAggregateChain } from './VersionedAggregateChain/VersionedAggregateChain.js';
import { VersionedAggregateRepo } from './VersionedAggregateRepo/VersionedAggregateRepo.js';

it('prepares in VAR, publishes per-command output, and recovers terminal results after outbox deletion and cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    aggregateId: 'acct_prepared',
    aggregateName: 'user',
    aggregateVersion: '1.0.0',
  };
  const view = { ...key, userId: 'usr_prepared', frontendName: 'main' };
  const commands = [
    Schema.decodeUnknownSync(EncodedAggregateCommandSchema)({
      id: 'cmd_prepared_user',
      commandName: 'createUser',
      payload: JSON.stringify({ id: view.userId, name: 'Prepared' }),
      contractVersion: '1.0.0',
      aggregateId: key.aggregateId,
      aggregateVersion: '1.0.0',
      aggregateName: 'user',
      systemName: 'system-worker',
      userId: null,
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
            userId: view.userId,
            name,
          }),
          contractVersion: '1.0.0',
          aggregateId: key.aggregateId,
          aggregateName: 'user',
          systemName: 'system-worker',
          userId: view.userId,
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
        authenticationLock: makeAuthenticationLock(authenticationSignature),
        signature: { userId: view.userId },
        aggregateId: Schema.decodeUnknownSync(makeAbbreviationIdSchema('acct'))(
          key.aggregateId,
        ),
        aggregateName: key.aggregateName,
        aggregateVersion: key.aggregateVersion,
        frontendName: view.frontendName,
        aggregateFrontendLock: makeAggregateFrontendLock({ frontend: main }),
      };
      const api = yield* makeAsync(() =>
        gateway.getAggregateFrontendApi(admission),
      );
      const denied = yield* makeAsync(() =>
        gateway.getAggregateFrontendApi({
          ...admission,
          signature: { userId: 'usr_missing' },
        }),
      );
      expect(
        (yield* makeAsync(() =>
          denied.getState({
            args: [{ outstandingCommandIds: [] }],
            traceContext: null,
          }),
        )).result._tag,
      ).toBe('Failure');
      const readOnly = yield* makeAsync(() =>
        gateway.getAggregateFrontendApi({
          ...admission,
          aggregateFrontendLock: {
            ...admission.aggregateFrontendLock,
            contracts: {},
          },
        }),
      );
      const rejectedPush = yield* makeAsync(() =>
        readOnly.pushCommand({
          args: [{ command: commands[1]! }],
          traceContext: null,
        }),
      );
      expect(rejectedPush.result).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'aggregate-frontend-command-contract-unavailable' },
      });
      for (const [index, input] of commands.slice(1).entries()) {
        const command = yield* Schema.decodeUnknownEffect(
          Schema.toType(SessionCommandSchema),
        )(input);
        const envelope = yield* makeAsync(() =>
          api.pushCommand({ args: [{ command }], traceContext: null }),
        );
        const receipt = yield* decodeRpc(envelope.result);
        expect(receipt).toEqual({
          aggregateIndex: index + 2,
          commandId: input.id,
        });
        expect('delta' in receipt).toBe(false);
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
      const replica = yield* UserVersionedAggregateRepo.getRepo({
        key: view,
      });
      const state = yield* makeAsync(() =>
        replica.getState({
          ...view,
          outstandingCommandIds: [
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
        gateway.getAggregateFrontendApi({
          ...admission,
          frontendName: 'other',
          aggregateFrontendLock: narrowLock,
        }),
      );
      const narrowEnvelope = yield* makeAsync(() =>
        narrowApi.getState({
          args: [{ outstandingCommandIds: ['cmd_prepared_list_0'] }],
          traceContext: null,
        }),
      );
      const narrowState = yield* decodeRpc(narrowEnvelope.result);
      expect(narrowState.resources.map(resource => resource.modelName)).toEqual(
        ['user'],
      );
      expect(narrowState.resolutions).toEqual([]);
      expect(narrowState.userIndex).toBe(state.userIndex);
      expect(state.aggregateIndex).toBe(4);
      expect(state.resolutions.map(entry => entry.command.id)).toEqual([
        'cmd_prepared_list_0',
        'cmd_prepared_list_1',
        'cmd_prepared_list_2',
      ]);
      const throughTwo = yield* UserVersionedAggregateChain.getRepo({
        key: view,
      });
      const earlier = yield* makeAsync(() =>
        throughTwo.getCommands({
          afterUserIndex: 0,
          reconcile: {
            commandIds: ['cmd_prepared_list_0', 'cmd_prepared_list_1'],
            frontendName: 'main',
            throughUserIndex: 2,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        earlier.commands.map(entry => entry.resolution?.command.id),
      ).toEqual(['cmd_prepared_list_0']);
      const otherFrontend = yield* makeAsync(() =>
        throughTwo.getCommands({
          afterUserIndex: 0,
          reconcile: {
            commandIds: ['cmd_prepared_list_0'],
            frontendName: 'other',
            throughUserIndex: 4,
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(otherFrontend.commands).toEqual([]);
      expect(
        state.resources.filter(row => row.modelName === 'list'),
      ).toHaveLength(1);
      const frontend = yield* UserVersionedAggregateChain.getRepo({
        key: view,
      });
      const outputs = yield* makeAsync(() =>
        frontend.getCommands({ afterUserIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(outputs.commands.map(command => command.aggregateIndex)).toEqual([
        1, 2, 3, 4,
      ]);
      expect(outputs.commands[0]?.resolution).toBeNull();
      expect(outputs.commands[2]?.resolution?.command.failure?.code).toBe(
        'list-name-rejected',
      );
      expect(outputs.commands[2]?.delta).toEqual({
        inserted: [],
        updated: [],
        deleted: [],
        mutations: [],
      });
      expect(outputs.tip).toBeGreaterThanOrEqual(state.aggregateIndex);
      expect(
        (yield* makeAsync(() =>
          frontend.getCommands({ afterUserIndex: state.userIndex }),
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
                userId: null,
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
