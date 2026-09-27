import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import config from 'config';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { serviceChainDbConfig } from '../../ServiceChain/serviceChainDbConfig.js';
import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

import { executeCommands } from './executeCommands.js';

it('records an unsupported future payload version and advances to later commands', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const service = config.system.services.app?.['1.0.0'];
      if (service === undefined) throw new Error('Missing app service fixture');
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({
          models: service.models,
          otherTables: serviceVersionRepoDbConfig.tables,
        }),
      );
      const startedAt = new Date('2026-09-26T12:00:00.000Z');
      const admission = {
        status: 'succeeded' as const,
        startedAt,
        completedAt: startedAt,
      };
      const rows = yield* Effect.forEach(
        [
          {
            id: 'cmd_future',
            serviceIndex: 1,
            contractVersion: '9.0.0',
            payload: '{"id":"prd_future","name":"Future"}',
          },
          {
            id: 'cmd_supported',
            serviceIndex: 2,
            contractVersion: '1.0.0',
            payload: '{"id":"prd_supported","name":"Supported"}',
          },
        ],
        input =>
          serviceChainDbConfig.tables.commands.encodeRow({
            ...input,
            commandName: 'createProduct',
            serviceName: 'app',
            serviceVersion: '1.0.0',
            admission,
          }),
      );
      yield* executeCommands({
        db,
        key: {
          systemId: 'sys_one',
          serviceName: 'app',
          serviceVersion: '1.0.0',
        },
        rows,
      });
      const commands = yield* Effect.forEach(
        db
          .select()
          .from(serviceVersionRepoDbConfig.schema.commands)
          .orderBy(serviceVersionRepoDbConfig.schema.commands.serviceIndex)
          .all(),
        row => serviceVersionRepoDbConfig.tables.commands.decodeRow(row),
      );
      expect(commands).toHaveLength(2);
      expect(commands[0]?.execution).toMatchObject({
        status: 'failed',
        failure: { code: 'contract-payload-version-unsupported' },
      });
      expect(commands[1]?.execution).toMatchObject({ status: 'succeeded' });
      expect(
        db.select().from(serviceVersionRepoDbConfig.schema.head).get()
          ?.serviceIndex,
      ).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
