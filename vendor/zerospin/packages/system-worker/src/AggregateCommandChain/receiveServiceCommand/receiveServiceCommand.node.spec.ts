import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { Effect, Result, Schema, Semaphore } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  aggregateCommandChainDbConfig,
  aggregateCommandChainDrizzleSchemas,
} from '../AggregateCommandChainDbConfig.js';

import { receiveServiceCommand } from './receiveServiceCommand.js';

describe('AggregateCommandChain.receiveServiceCommand', () => {
  it('fills a gap, advances irrelevant service occurrences, and orders relevant derived occurrences', async () => {
    const aggregateDb = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: aggregateCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const materializedAggregateRepoName = 'aggrepo_sys_test/acct_test/shopping';
    const commands = [
      Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
        id: 'cmd_service_irrelevant',
        commandName: 'createProduct',
        payload: '{"id":"prd_irrelevant"}',
        contractVersion: '1.0.0',
        serviceName: 'app',
        serviceIndex: 1,
        chainedAt: '2026-08-31T16:00:00.000Z',
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        failedAt: null,
        failure: null,
      }),
      Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
        id: 'cmd_service_relevant_2',
        commandName: 'createProduct',
        payload: '{"id":"prd_relevant_2"}',
        contractVersion: '1.0.0',
        serviceName: 'app',
        serviceIndex: 2,
        chainedAt: '2026-08-31T16:00:01.000Z',
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        failedAt: null,
        failure: null,
      }),
      Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
        id: 'cmd_service_relevant_3',
        commandName: 'createProduct',
        payload: '{"id":"prd_relevant_3"}',
        contractVersion: '1.0.0',
        serviceName: 'app',
        serviceIndex: 3,
        chainedAt: '2026-08-31T16:00:02.000Z',
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        failedAt: null,
        failure: null,
      }),
    ];
    aggregateDb
      .insert(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
      .values({
        serviceName: 'app',
        serviceIndex: null,
        materializedAggregateRepoName,
        lastDeliveryFailure: null,
      })
      .run();
    const getCommands = vi.fn(
      ({ afterServiceIndex }: { afterServiceIndex: number | null }) =>
        Effect.runPromise(
          Effect.succeed({
            commands: commands.filter(
              command => command.serviceIndex > (afterServiceIndex ?? 0),
            ),
            tip: 3,
          }).pipe(encodeRpc),
        ),
    );
    const admissionSemaphore = Effect.runSync(Semaphore.make(1));
    let alarmCount = 0;
    const admission = receiveServiceCommand({
      admissionSemaphore,
      command: commands[2],
      db: aggregateDb,
      materializedAggregateRepos: {
        getByName: () => ({
          isServiceCommandRelevant: ({ command }) =>
            Effect.runPromise(
              Effect.succeed(command.serviceIndex > 1).pipe(encodeRpc),
            ),
        }),
      },
      serviceCommandChains: {
        getByName: () => ({ getCommands }),
      },
      storage: {
        setAlarm: () => {
          alarmCount += 1;
          return Promise.resolve();
        },
      },
      systemId: 'sys_test',
    });
    await Effect.runPromise(admission.pipe(Effect.provide(AsyncLive)));
    await Effect.runPromise(admission.pipe(Effect.provide(AsyncLive)));

    expect(getCommands).toHaveBeenCalledTimes(1);
    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
        .get(),
    ).toMatchObject({ serviceIndex: 3 });
    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.serviceReceipts)
        .all(),
    ).toHaveLength(3);
    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.commands)
        .all()
        .map(command => ({
          aggregateIndex: command.aggregateIndex,
          serviceIndex: command.serviceIndex,
          commandId: command.commandId,
        })),
    ).toEqual([
      {
        aggregateIndex: 1,
        serviceIndex: 2,
        commandId: commands[1].id,
      },
      {
        aggregateIndex: 2,
        serviceIndex: 3,
        commandId: commands[2].id,
      },
    ]);
    expect(alarmCount).toBe(2);

    const conflict = await Effect.runPromise(
      receiveServiceCommand({
        admissionSemaphore,
        command: { ...commands[2], payload: '{"id":"prd_changed"}' },
        db: aggregateDb,
        materializedAggregateRepos: {
          getByName: () => ({
            isServiceCommandRelevant: () =>
              Effect.runPromise(Effect.succeed(true).pipe(encodeRpc)),
          }),
        },
        serviceCommandChains: {
          getByName: () => ({ getCommands }),
        },
        storage: { setAlarm: () => Promise.resolve() },
        systemId: 'sys_test',
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(conflict)).toBe(true);
    if (Result.isFailure(conflict)) {
      expect(conflict.failure.code).toBe(
        'aggregate-command-chain-service-receipt-conflict',
      );
    }
  });

  it('rejects a pulled service history gap before admitting anything', async () => {
    const aggregateDb = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: aggregateCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    const command = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
      id: 'cmd_service_gap',
      commandName: 'createProduct',
      payload: '{}',
      contractVersion: '1.0.0',
      serviceName: 'app',
      serviceIndex: 2,
      chainedAt: '2026-08-31T16:01:00.000Z',
      delta: { inserted: [], updated: [], deleted: [], mutations: [] },
      failedAt: null,
      failure: null,
    });
    aggregateDb
      .insert(aggregateCommandChainDrizzleSchemas.serviceSubscriptions)
      .values({
        serviceName: 'app',
        serviceIndex: null,
        materializedAggregateRepoName: 'aggrepo_sys_test/acct_test/shopping',
        lastDeliveryFailure: null,
      })
      .run();
    const result = await Effect.runPromise(
      receiveServiceCommand({
        admissionSemaphore: Effect.runSync(Semaphore.make(1)),
        command,
        db: aggregateDb,
        materializedAggregateRepos: {
          getByName: () => ({
            isServiceCommandRelevant: () =>
              Effect.runPromise(Effect.succeed(true).pipe(encodeRpc)),
          }),
        },
        serviceCommandChains: {
          getByName: () => ({
            getCommands: () =>
              Effect.runPromise(
                Effect.succeed({ commands: [command], tip: 2 }).pipe(encodeRpc),
              ),
          }),
        },
        storage: { setAlarm: () => Promise.resolve() },
        systemId: 'sys_test',
      }).pipe(Effect.provide(AsyncLive), Effect.result),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure.code).toBe(
        'aggregate-command-chain-service-index-gap',
      );
    }
    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.serviceReceipts)
        .all(),
    ).toHaveLength(0);
    expect(
      aggregateDb
        .select()
        .from(aggregateCommandChainDrizzleSchemas.commands)
        .all(),
    ).toHaveLength(0);
  });
});
