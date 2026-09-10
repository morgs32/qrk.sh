import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Result, Schema } from 'effect';
import { expect, it } from 'vitest';

import { serviceAdmittedChainDbConfig } from '../serviceAdmittedChainDbConfig.js';

import { admitServiceCommand } from './admitServiceCommand.js';

it('retains unprepared input, returns an identical retry receipt, and rejects conflicts and wrong services without consuming positions', async () => {
  const db = await Effect.runPromise(
    makeProvisionedInMemorySqljsDb({
      dbConfig: serviceAdmittedChainDbConfig,
    }).pipe(Effect.provide(AsyncLive)),
  );
  const command = Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
    id: 'cmd_admission',
    serviceVersion: '1.0.0',
    serviceName: 'app',
    commandName: 'not-yet-prepared',
    contractVersion: '1.0.0',
    payload: '{}',
  });
  const props = {
    db,
    key: { systemId: 'sys_test', serviceName: 'app' },
    command,
  };
  const receipt = Effect.runSync(admitServiceCommand(props));
  expect(receipt).toEqual({ commandId: command.id, serviceIndex: 1 });
  expect(Effect.runSync(admitServiceCommand(props))).toEqual(receipt);
  for (const rejectedCommand of [
    { ...command, payload: '{"changed":true}' },
    { ...command, id: 'cmd_wrong_service', serviceName: 'other' },
  ]) {
    expect(
      Result.isFailure(
        Effect.runSync(
          admitServiceCommand({ ...props, command: rejectedCommand }).pipe(
            Effect.result,
          ),
        ),
      ),
    ).toBe(true);
  }
  const rows = db
    .select()
    .from(serviceAdmittedChainDbConfig.schema.commands)
    .all();
  expect(rows).toHaveLength(1);
  expect(JSON.parse(rows[0]!.command)).toEqual(command);
  expect(
    Effect.runSync(
      admitServiceCommand({
        ...props,
        command: { ...command, id: 'cmd_next' },
      }),
    ),
  ).toEqual({ commandId: 'cmd_next', serviceIndex: 2 });
});
