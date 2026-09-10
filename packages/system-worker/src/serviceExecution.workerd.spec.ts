import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import {
  EncodedServiceCommandSchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { abortAllDurableObjects, env } from 'cloudflare:test';
import { Effect, Schema } from 'effect';
import { expect, it } from 'vitest';

import { FrontendServiceChain } from './FrontendServiceChain/FrontendServiceChain.js';
import { FrontendVersionedServiceRepo } from './FrontendVersionedServiceRepo/FrontendVersionedServiceRepo.js';
import { ServiceAdmittedChain } from './ServiceAdmittedChain/ServiceAdmittedChain.js';
import { VersionedServiceChain } from './VersionedServiceChain/VersionedServiceChain.js';
import { VersionedServiceRepo } from './VersionedServiceRepo/VersionedServiceRepo.js';
it('executes, publishes, projects, and recovers an exact admission receipt after cold activation', async () => {
  const key = {
    systemId: env.ZEROSPIN_SYSTEM_ID,
    serviceName: 'app',
    serviceVersion: '1.0.0',
  };
  const view = { ...key, userId: 'usr_pipeline071', frontendName: 'products' };
  const command = Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
    id: 'cmd_pipeline071',
    serviceVersion: '1.0.0',
    serviceName: 'app',
    commandName: 'createProduct',
    contractVersion: '1.0.0',
    payload: JSON.stringify({
      id: 'prd_pipeline071',
      name: 'Versioned service',
    }),
  });
  const before = await Effect.runPromise(
    Effect.gen(function* () {
      const admitted = yield* ServiceAdmittedChain.getRepo({ key });
      const result = yield* makeAsync(() =>
        admitted.admitServiceCommand({ command }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(result).toEqual({ commandId: command.id, serviceIndex: 1 });
      const history = yield* VersionedServiceChain.getRepo({ key });
      // Observe durable fanout completion without directly executing or flushing the materializer.
      yield* makeAsync(() =>
        expect
          .poll(
            async () => {
              const page = await Effect.runPromise(
                makeAsync(async () =>
                  (await history.replicaFanoutQueue).getPage({
                    afterIndex: result.serviceIndex - 1,
                    maxIndex: result.serviceIndex,
                  }),
                ).pipe(Effect.flatMap(decodeRpc), Effect.provide(AsyncLive)),
              );
              return page.rows.length;
            },
            { timeout: 10_000 },
          )
          .toBe(1),
      );
      const page = yield* makeAsync(async () =>
        (await history.replicaFanoutQueue).getPage({
          afterIndex: result.serviceIndex - 1,
          maxIndex: result.serviceIndex,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const entry = Schema.decodeUnknownSync(
        Schema.fromJsonString(ServiceExecutionEntrySchema),
      )(page.rows[0]!.entry);
      expect(entry.mutations).toHaveLength(1);
      expect(JSON.parse(entry.sourceCommand)).toEqual(command);
      const replica = yield* FrontendVersionedServiceRepo.getRepo({
        key: view,
      });
      const state = yield* makeAsync(() => replica.getState(view)).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(state.serviceVersion).toBe(key.serviceVersion);
      expect(state.serviceIndex).toBe(result.serviceIndex);
      expect(state.resources.some(row => row.id === 'prd_pipeline071')).toBe(
        true,
      );
      const frontend = yield* FrontendServiceChain.getRepo({
        key: view,
      });
      const output = yield* makeAsync(() =>
        frontend.getCommands({ afterServiceIndex: result.serviceIndex - 1 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(output.commands[0]?.id).toBe(command.id);
      return result;
    }).pipe(Effect.provide(AsyncLive)),
  );
  await abortAllDurableObjects();
  const after = await Effect.runPromise(
    Effect.gen(function* () {
      const admitted = yield* ServiceAdmittedChain.getRepo({ key });
      return yield* makeAsync(() =>
        admitted.admitServiceCommand({ command }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(Effect.provide(AsyncLive)),
  );
  expect(after).toEqual(before);
});

it('retains finalized bytes across duplicate delivery and cold activation', async () => {
  const { genesisDispositionHash, advanceDispositionHash } =
    await import('./serviceDispositionHash/serviceDispositionHash.js');
  await Effect.runPromise(
    Effect.gen(function* () {
      const key = {
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'inventory',
        serviceVersion: '1.0.0',
      };
      const command = {
        id: 'cmd_wakeup071',
        serviceVersion: '1.0.0',
        serviceName: 'inventory',
        commandName: 'empty',
        contractVersion: '1.0.0',
        payload: '{}',
        serviceIndex: 1,
        chainedAt: new Date(1),
        dispositionHash: advanceDispositionHash({
          previousDispositionHash: genesisDispositionHash(),
          serviceIndex: 1,
          commandId: 'cmd_wakeup071',
          disposition: 'success',
        }),
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        failedAt: null,
        failure: null,
      };
      const entry = Schema.encodeSync(
        Schema.fromJsonString(ServiceExecutionEntrySchema),
      )({
        sourceCommand: JSON.stringify({
          id: command.id,
          serviceVersion: '1.0.0',
          serviceName: command.serviceName,
          commandName: command.commandName,
          contractVersion: command.contractVersion,
          payload: command.payload,
        }),
        command,
        mutations: [],
        preparationVersion: '1.0.0',
        executionTimestamp: new Date(1),
      });
      const history = yield* VersionedServiceChain.getRepo({ key });
      const receiver = yield* makeAsync(() => history.resultsSubscriber);
      const rows = [{ outboxIndex: 1, executionVersion: '1.0.0', entry }];
      yield* makeAsync(() => receiver.receive(rows)).pipe(
        Effect.flatMap(decodeRpc),
      );
      yield* makeAsync(() => receiver.receive(rows)).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(
        (yield* makeAsync(async () =>
          (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc))).rows,
      ).toEqual(rows);
      yield* makeAsync(() => abortAllDurableObjects());
      const reopened = yield* VersionedServiceChain.getRepo({ key });
      const recovered = yield* makeAsync(() => reopened.resultsSubscriber);
      yield* makeAsync(() => recovered.receive(rows)).pipe(
        Effect.flatMap(decodeRpc),
      );
      expect(
        (yield* makeAsync(async () =>
          (await reopened.replicaFanoutQueue).getPage({ afterIndex: 0 }),
        ).pipe(Effect.flatMap(decodeRpc))).rows,
      ).toEqual(rows);
    }).pipe(Effect.provide(AsyncLive)),
  );
});

it('receives overlapping admitted pages directly, publishes, and retries after cold activation', async () => {
  const key = {
    systemId: `${env.ZEROSPIN_SYSTEM_ID}_direct_delivery`,
    serviceName: 'app',
    serviceVersion: '1.0.0',
  };
  const rows = [1, 2].map(fanoutIndex => {
    const commandId = `cmd_direct_delivery_${fanoutIndex}`;
    const command = Schema.encodeSync(
      Schema.fromJsonString(EncodedServiceCommandSchema),
    )(
      Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
        id: commandId,
        serviceVersion: '1.0.0',
        serviceName: key.serviceName,
        commandName: 'createProduct',
        contractVersion: '1.0.0',
        payload: JSON.stringify({
          id: `prd_direct_delivery_${fanoutIndex}`,
          name: `Direct delivery ${fanoutIndex}`,
        }),
      }),
    );
    return {
      fanoutIndex,
      commandId,
      command,
      canonicalBytes: command,
      chainedAt: new Date(fanoutIndex),
    };
  });
  const published = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* VersionedServiceRepo.getRepo({ key });
      const receiver = yield* makeAsync(() =>
        repo.serviceFanoutQueueSubscriber(key),
      );
      const outcomes = yield* makeAsync(() =>
        Promise.all([
          receiver.receive({ rows: rows.slice(0, 1), lastIndex: 2 }),
          receiver.receive({ rows, lastIndex: rows.at(-1)?.fanoutIndex ?? 0 }),
        ]),
      );
      for (const outcome of outcomes) yield* decodeRpc(outcome);
      const history = yield* VersionedServiceChain.getRepo({ key });
      yield* makeAsync(() =>
        expect
          .poll(
            async () => {
              const page = await Effect.runPromise(
                makeAsync(async () =>
                  (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
                ).pipe(Effect.flatMap(decodeRpc), Effect.provide(AsyncLive)),
              );
              return page.rows.length;
            },
            { timeout: 10_000 },
          )
          .toBe(2),
      );
      const page = yield* makeAsync(async () =>
        (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(
        page.rows.map(
          row =>
            Schema.decodeUnknownSync(
              Schema.fromJsonString(ServiceExecutionEntrySchema),
            )(row.entry).sourceCommand,
        ),
      ).toEqual(rows.map(row => row.command));
      const admitted = yield* ServiceAdmittedChain.getRepo({ key });
      const retainedInputs = yield* makeAsync(async () =>
        (await admitted.serviceFanoutQueue).getPage({
          afterIndex: 0,
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(retainedInputs.rows).toEqual([]);
      return page.rows;
    }).pipe(Effect.provide(AsyncLive)),
  );
  await abortAllDurableObjects();
  await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* VersionedServiceRepo.getRepo({ key });
      const receiver = yield* makeAsync(() =>
        repo.serviceFanoutQueueSubscriber(key),
      );
      yield* makeAsync(() =>
        receiver.receive({ rows, lastIndex: rows.at(-1)?.fanoutIndex ?? 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      const history = yield* VersionedServiceChain.getRepo({ key });
      const page = yield* makeAsync(async () =>
        (await history.replicaFanoutQueue).getPage({ afterIndex: 0 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(page.rows).toEqual(published);
    }).pipe(Effect.provide(AsyncLive)),
  );
});
