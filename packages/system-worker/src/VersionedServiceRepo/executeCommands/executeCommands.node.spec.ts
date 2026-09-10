import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedServiceCommandSchema,
  ServiceExecutionEntrySchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { sql } from 'drizzle-orm';
import { Effect, Schema } from 'effect';
import { system } from 'system';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  versionedServiceRepoDbConfig,
  versionedServiceRepoTables,
} from '../versionedServiceRepoDbConfig.js';

import { executeCommands } from './executeCommands.js';

const wire = vi.hoisted(() => ({ admitted: vi.fn(), finalized: vi.fn() }));
vi.mock(
  '../../ServiceAdmittedChain/ServiceAdmittedChain.js',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../ServiceAdmittedChain/ServiceAdmittedChain.js')
      >();

    Object.assign(actual.ServiceAdmittedChain, { getRepo: wire.admitted });
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

    Object.assign(actual.VersionedServiceChain, {
      getRepo: wire.finalized,
    });
    return actual;
  },
);
const key = {
  systemId: 'sys_test',
  serviceName: 'app',
  serviceVersion: '1.0.0',
};
const rows = [1, 2, 3].map(fanoutIndex => {
  const commandId = `cmd_delivery_${fanoutIndex}`;
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
        id: `prd_delivery_${fanoutIndex}`,
        name: `Product ${fanoutIndex}`,
      }),
    }),
  );
  return {
    fanoutIndex,
    commandId,
    canonicalBytes: command,
    chainedAt: new Date(fanoutIndex),
    command,
  };
});
beforeEach(() => vi.resetAllMocks());

it('executes supplied rows once across duplicate and overlapping pages without fetching history', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  for (const page of [[], rows.slice(0, 2), rows.slice(0, 2), rows.slice(1)]) {
    await Effect.runPromise(
      executeCommands({ db, key, rows: page }).pipe(Effect.provide(AsyncLive)),
    );
  }
  const results = db
    .select()
    .from(versionedServiceRepoDbConfig.schema.results)
    .all();
  expect(results).toHaveLength(3);
  expect(
    results.map(
      row =>
        Schema.decodeUnknownSync(
          Schema.fromJsonString(ServiceExecutionEntrySchema),
        )(row.entry).sourceCommand,
    ),
  ).toEqual(rows.map(row => row.command));
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(3);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.head).get()
      ?.serviceIndex,
  ).toBe(3);
  db.delete(versionedServiceRepoDbConfig.schema.results).run();
  await Effect.runPromise(
    executeCommands({ db, key, rows }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.results).all(),
  ).toHaveLength(0);
  expect(wire.admitted).not.toHaveBeenCalled();
  expect(wire.finalized).not.toHaveBeenCalled();
});

it.each([
  { label: 'initial gap', page: rows.slice(1), code: 'service-execution-gap' },
  {
    label: 'gap inside a page',
    page: [rows[0]!, rows[2]!],
    code: 'service-execution-gap',
  },
  {
    label: 'invalid index',
    page: [{ ...rows[0]!, fanoutIndex: 0 }],
    code: 'service-execution-gap',
  },
  {
    label: 'malformed input',
    page: [rows[0]!, { ...rows[1]!, command: '{', canonicalBytes: '{' }],
    code: 'service-input-invalid',
  },
  {
    label: 'wrong command identity',
    page: [{ ...rows[0]!, commandId: 'cmd_other' }],
    code: 'service-input-target-mismatch',
  },
  {
    label: 'different canonical bytes',
    page: [{ ...rows[0]!, canonicalBytes: '{}' }],
    code: 'service-input-target-mismatch',
  },
])(
  'rejects $label without committing any part of the page',
  async ({ page, code }) => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: makeResourceDbConfig({
          otherTables: versionedServiceRepoTables,
          models: system.services.app['1.0.0'].models,
        }),
      }).pipe(Effect.provide(AsyncLive)),
    );
    const result = await Effect.runPromise(
      executeCommands({ db, key, rows: page }).pipe(
        Effect.provide(AsyncLive),
        Effect.result,
      ),
    );
    expect(result).toMatchObject({ _tag: 'Failure', failure: { code } });
    expect(
      db
        .select()
        .from(system.services.app['1.0.0'].models.product.drizzleSchema)
        .all(),
    ).toHaveLength(0);
    expect(
      db.select().from(versionedServiceRepoDbConfig.schema.results).all(),
    ).toHaveLength(0);
    expect(
      db.select().from(versionedServiceRepoDbConfig.schema.head).all(),
    ).toHaveLength(0);
  },
);

it('settles a domain rejection and continues the delivered page', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  const command = rows[1]!.command.replace('createProduct', 'missingContract');
  await Effect.runPromise(
    executeCommands({
      db,
      key,
      rows: [
        rows[0]!,
        { ...rows[1]!, command, canonicalBytes: command },
        rows[2]!,
      ],
    }).pipe(Effect.provide(AsyncLive)),
  );
  const results = db
    .select()
    .from(versionedServiceRepoDbConfig.schema.results)
    .all();
  expect(results).toHaveLength(3);
  const rejected = Schema.decodeUnknownSync(
    Schema.fromJsonString(ServiceExecutionEntrySchema),
  )(results[1]!.entry);
  expect(rejected.sourceCommand).toBe(command);
  expect(rejected.command.failure?.code).toBe('service-contract-not-found');
  expect(rejected.command.delta?.mutations).toEqual([]);
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(2);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.head).get()
      ?.serviceIndex,
  ).toBe(3);
});

it('rolls back infrastructure failure and resumes the full delivered page on retry', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: makeResourceDbConfig({
        otherTables: versionedServiceRepoTables,
        models: system.services.app['1.0.0'].models,
      }),
    }).pipe(Effect.provide(AsyncLive)),
  );
  db.run(
    sql.raw(
      "CREATE TRIGGER fail_second BEFORE INSERT ON product WHEN NEW.id = 'prd_delivery_2' BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END;",
    ),
  );
  const result = await Effect.runPromise(
    executeCommands({ db, key, rows }).pipe(
      Effect.provide(AsyncLive),
      Effect.result,
    ),
  );
  expect(result._tag).toBe('Failure');
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(0);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.results).all(),
  ).toHaveLength(0);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.head).all(),
  ).toHaveLength(0);
  db.run(sql.raw('DROP TRIGGER fail_second'));
  await Effect.runPromise(
    executeCommands({ db, key, rows }).pipe(Effect.provide(AsyncLive)),
  );
  expect(
    db
      .select()
      .from(system.services.app['1.0.0'].models.product.drizzleSchema)
      .all(),
  ).toHaveLength(3);
  expect(
    db.select().from(versionedServiceRepoDbConfig.schema.results).all(),
  ).toHaveLength(3);
});
