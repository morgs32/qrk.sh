import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import {
  EncodedServiceCommandSchema,
  ServiceChainedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { makeProvisionedInMemorySqljsDb } from '@zerospin/core/drizzle/makeProvisionedInMemorySqljsDb';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { serviceCommandChainDbConfig } from '../ServiceCommandChainDbConfig.js';

import { getCommands } from './getCommands.js';

describe('ServiceCommandChain.getCommands', () => {
  it('pages terminal history at 64 without exposing the pending tip', async () => {
    const db = await Effect.runPromise(
      makeProvisionedInMemorySqljsDb({
        dbConfig: serviceCommandChainDbConfig,
      }).pipe(Effect.provide(AsyncLive)),
    );
    for (let serviceIndex = 1; serviceIndex <= 65; serviceIndex += 1) {
      const command = Schema.decodeUnknownSync(EncodedServiceCommandSchema)({
        id: `cmd_page_${serviceIndex}`,
        commandName: 'page',
        payload: '{}',
        contractVersion: '1.0.0',
        serviceName: 'app',
      });
      const terminal = Schema.decodeUnknownSync(ServiceChainedCommandSchema)({
        ...command,
        serviceIndex,
        chainedAt: new Date(serviceIndex * 1_000).toISOString(),
        delta: { inserted: [], updated: [], deleted: [], mutations: [] },
        failedAt: null,
        failure: null,
      });
      db.insert(serviceCommandChainDbConfig.schema.commands)
        .values({
          serviceIndex,
          commandId: command.id,
          canonicalBytes: Schema.encodeSync(
            Schema.fromJsonString(EncodedServiceCommandSchema),
          )(command),
          chainedAt: terminal.chainedAt,
          command: Schema.encodeSync(
            Schema.fromJsonString(EncodedServiceCommandSchema),
          )(command),
          result: Schema.encodeSync(
            Schema.fromJsonString(ServiceChainedCommandSchema),
          )(terminal),
          materializedServiceRepoName: 'svcrepo_sys_test/app',
        })
        .run();
    }
    db.insert(serviceCommandChainDbConfig.schema.commands)
      .values({
        serviceIndex: 66,
        commandId: 'cmd_page_pending',
        canonicalBytes:
          '{"id":"cmd_page_pending","commandName":"page","payload":"{}","contractVersion":"1.0.0","serviceName":"app"}',
        chainedAt: new Date(66_000),
        command:
          '{"id":"cmd_page_pending","commandName":"page","payload":"{}","contractVersion":"1.0.0","serviceName":"app"}',
        result: null,
        materializedServiceRepoName: 'svcrepo_sys_test/app',
      })
      .run();

    const first = await Effect.runPromise(
      getCommands({ db, afterServiceIndex: null }),
    );
    const second = await Effect.runPromise(
      getCommands({ db, afterServiceIndex: 64 }),
    );

    expect(first.commands).toHaveLength(64);
    expect(first.commands[0]?.serviceIndex).toBe(1);
    expect(first.commands[63]?.serviceIndex).toBe(64);
    expect(first.tip).toBe(65);
    expect(second.commands.map(command => command.serviceIndex)).toEqual([65]);
    expect(second.tip).toBe(65);
  });
});
