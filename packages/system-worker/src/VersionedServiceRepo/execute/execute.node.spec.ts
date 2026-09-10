import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedServiceCommandSchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema, Semaphore } from 'effect';
import { system } from 'system';
import { beforeEach, expect, it, vi } from 'vitest';

import { execute as replay } from '../../FrontendVersionedServiceRepo/execute/execute.js';
import {
  frontendVersionedServiceRepoDbConfig,
  frontendVersionedServiceRepoTables,
} from '../../FrontendVersionedServiceRepo/frontendVersionedServiceRepoDbConfig.js';
import { makeAlarmRegistry } from '../../makeAlarmRegistry/makeAlarmRegistry.js';
import { makeFanoutQueue } from '../../makeFanoutQueue/makeFanoutQueue.js';
import { makeFanoutSubscriber } from '../../makeFanoutSubscriber/makeFanoutSubscriber.js';
import { ServiceAdmittedChain } from '../../ServiceAdmittedChain/ServiceAdmittedChain.js';
import { serviceAdmittedChainDbConfig } from '../../ServiceAdmittedChain/serviceAdmittedChainDbConfig.js';
import { receiveResults } from '../../VersionedServiceChain/receiveResults/receiveResults.js';
import { versionedServiceChainDbConfig } from '../../VersionedServiceChain/versionedServiceChainDbConfig.js';
import { executeCommands } from '../executeCommands/executeCommands.js';
import {
  versionedServiceRepoDbConfig,
  versionedServiceRepoTables,
} from '../versionedServiceRepoDbConfig.js';
import { versionedServiceRepoFixedDORepoConfig } from '../versionedServiceRepoFixedDORepoConfig.js';

import { execute } from './execute.js';
const wire = vi.hoisted(() => ({ admitted: vi.fn(), finalized: vi.fn() }));
vi.mock(
  '../../ServiceAdmittedChain/ServiceAdmittedChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../ServiceAdmittedChain/ServiceAdmittedChain.js')
      >();
    const { Effect } = await import('effect');
    Object.assign(actual.ServiceAdmittedChain, {
      getRepo: Effect.fn(function* () {
        yield* Effect.void;
        return {
          serviceFanoutQueue: Promise.resolve({
            getPage: wire.admitted,
            subscribe: async () => ({ _tag: 'Success', success: undefined }),
          }),
        };
      }),
    });
    return actual;
  },
);
vi.mock(
  '../../VersionedServiceChain/VersionedServiceChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../VersionedServiceChain/VersionedServiceChain.js')
      >();
    const { Effect } = await import('effect');
    Object.assign(actual.VersionedServiceChain, {
      getRepo: Effect.fn(function* () {
        yield* Effect.void;
        return {
          replicaFanoutQueue: Promise.resolve({ getPage: wire.finalized }),
        };
      }),
    });
    return actual;
  },
);
const key = {
  systemId: 'sys_test',
  serviceName: 'app',
  serviceVersion: '1.0.0',
};
beforeEach(() => vi.resetAllMocks());
it('commits bounded pages, publishes complete entries, recovers after outbox deletion, and projects independently of page sizes', async () => {
  const admitted = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: serviceAdmittedChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  const history = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: versionedServiceChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  for (let index = 1; index <= 130; index++) {
    const input = {
      id: `cmd_service_${index}`,
      serviceVersion: '1.0.0',
      serviceName: 'app',
      commandName: index === 65 ? 'missingContract' : 'createProduct',
      contractVersion: '1.0.0',
      payload: JSON.stringify({
        id: `prd_service_${index}`,
        name: `Product ${index}`,
      }),
    };
    const command = Schema.encodeSync(
      Schema.fromJsonString(EncodedServiceCommandSchema),
    )(Schema.decodeUnknownSync(EncodedServiceCommandSchema)(input));
    admitted
      .insert(serviceAdmittedChainDbConfig.schema.commands)
      .values({
        fanoutIndex: index,
        commandId: input.id,
        command,
        canonicalBytes: command,
        chainedAt: new Date(index),
      })
      .run();
  }
  const admittedQueue = makeFanoutQueue({
    name: 'serviceFanoutQueue',
    db: admitted,
    schema: serviceAdmittedChainDbConfig.schema,
    subscribersTableName: 'serviceSubscribers',
    entriesTableName: 'commands',
    indexColumnName: 'fanoutIndex',
    concurrency: 100,
    key: { systemId: key.systemId, serviceName: key.serviceName },
    subscriberNameUtils: versionedServiceRepoFixedDORepoConfig.nameUtils,
    alarmRegistry: makeAlarmRegistry({
      storage: {
        setAlarm: async () => undefined,
        deleteAlarm: async () => undefined,
      },
    }),
    getRepo: () => Effect.die('This fixture only exposes history pages'),
  });
  wire.admitted.mockImplementation(request => admittedQueue.getPage(request));
  const execution = Semaphore.makeUnsafe(1);
  const subscriber = makeFanoutSubscriber({
    name: 'serviceFanoutQueue',
    sourceKey: { systemId: key.systemId, serviceName: key.serviceName },
    key,
    getRepo: ServiceAdmittedChain.getRepo,
    getCurrentIndex: () =>
      db.select().from(versionedServiceRepoDbConfig.schema.head).get()
        ?.serviceIndex ?? 0,
    receive: ({ rows }) =>
      execution.withPermits(1)(executeCommands({ db, key, rows })),
  });
  const terminal = await Effect.runPromise(
    execute({ db, key, subscriber, serviceIndex: 130 }).pipe(
      Effect.provide(AsyncLive),
    ),
  );
  expect(terminal.serviceIndex).toBe(130);
  const rows = db
    .select()
    .from(versionedServiceRepoDbConfig.schema.results)
    .all();
  expect(rows).toHaveLength(130);
  const rejected = Schema.decodeUnknownSync(
    Schema.fromJsonString(ServiceExecutionEntrySchema),
  )(rows[64]!.entry);
  expect(rejected.command.failure?.code).toBe('service-contract-not-found');
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(129);
  await Effect.runPromise(receiveResults({ db: history, key, rows }));
  await Effect.runPromise(receiveResults({ db: history, key, rows }));
  expect(
    history.select().from(versionedServiceChainDbConfig.schema.commands).all(),
  ).toHaveLength(130);
  db.delete(versionedServiceRepoDbConfig.schema.results).run();
  wire.finalized.mockResolvedValue({
    _tag: 'Success',
    success: { rows: [rows[129]], lastIndex: 130 },
  });
  expect(
    await Effect.runPromise(
      execute({ db, key, subscriber, serviceIndex: 130 }).pipe(
        Effect.provide(AsyncLive),
      ),
    ),
  ).toEqual(terminal);
  expect(wire.admitted).toHaveBeenCalledTimes(3);
  const outputs = [];
  for (const pageSize of [1, 64]) {
    const replica = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: frontendVersionedServiceRepoTables,
          models: system.services.app['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    for (let i = 0; i < rows.length; i += pageSize) {
      await Effect.runPromise(
        replay({
          db: replica,
          key: { ...key, userId: 'usr_service', frontendName: 'products' },
          rows: rows.slice(i, i + pageSize),
        }),
      );
    }
    outputs.push(
      replica
        .select()
        .from(frontendVersionedServiceRepoDbConfig.schema.deltas)
        .all()
        .map(row => row.output),
    );
  }
  expect(outputs[0]).toEqual(outputs[1]);
  expect(outputs[0]).toHaveLength(130);
  expect(JSON.parse(outputs[0]![64]!).failedAt).not.toBeNull();
}, 15_000);
it('rolls back the entire page on an infrastructure mutation failure', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  wire.admitted.mockResolvedValue({
    _tag: 'Success',
    success: {
      lastIndex: 2,
      rows: [1, 2].map(index => {
        const command = JSON.stringify({
          id: `cmd_crash_${index}`,
          serviceVersion: '1.0.0',
          serviceName: 'app',
          commandName: 'createProduct',
          contractVersion: '1.0.0',
          payload: JSON.stringify({
            id: `prd_crash_${index}`,
            name: `Product ${index}`,
          }),
        });
        return {
          fanoutIndex: index,
          commandId: `cmd_crash_${index}`,
          command,
          canonicalBytes: command,
          chainedAt: new Date(index),
        };
      }),
    },
  });
  const { sql } = await import('drizzle-orm');
  db.run(
    sql.raw(
      "CREATE TRIGGER fail_second BEFORE INSERT ON product WHEN NEW.id = 'prd_crash_2' BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END;",
    ),
  );
  const execution = Semaphore.makeUnsafe(1);
  const subscriber = makeFanoutSubscriber({
    name: 'serviceFanoutQueue',
    sourceKey: { systemId: key.systemId, serviceName: key.serviceName },
    key,
    getRepo: ServiceAdmittedChain.getRepo,
    getCurrentIndex: () =>
      db.select().from(versionedServiceRepoDbConfig.schema.head).get()
        ?.serviceIndex ?? 0,
    receive: ({ rows }) =>
      execution.withPermits(1)(executeCommands({ db, key, rows })),
  });
  const outcome = await Effect.runPromise(
    execute({
      db,
      key,
      subscriber,
      serviceIndex: 2,
    }).pipe(Effect.provide(AsyncLive), Effect.result),
  );
  expect(outcome._tag).toBe('Failure');
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(0);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.results).all(),
  ).toHaveLength(0);
});
