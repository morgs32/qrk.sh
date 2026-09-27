import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { serviceChainFixedDORepoConfig } from '../../ServiceChain/serviceChainFixedDORepoConfig.js';
import { serviceVersionRepoFixedDORepoConfig } from '../../ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.js';
import { serviceActorVersionRepoFixedDORepoConfig } from '../serviceActorVersionRepoFixedDORepoConfig.js';

const decode = <A, E>(envelope: Parameters<typeof readRpcEnvelope<A, E>>[0]) =>
  Effect.runPromise(readRpcEnvelope(envelope));

it('materializes older fulfillment commands in both versions and runs the warehouse carrier', async () => {
  const serviceName = 'fulfillment';
  const latestVersion = '1.0.1';
  const chain = env.SERVICE_CHAIN.getByName(
    await Effect.runPromise(
      serviceChainFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName,
      }),
    ),
  );
  const latest = env.SERVICE_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName,
        serviceVersion: latestVersion,
      }),
    ),
  );
  const older = env.SERVICE_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName,
        serviceVersion: '1.0.0',
      }),
    ),
  );
  const actor = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName,
        serviceVersion: latestVersion,
        actorName: '__service',
        actorVersion: latestVersion,
        actorPath: '/',
      }),
    ),
  );
  await decode(
    await chain.admitServiceCommand({
      command: {
        id: 'cmd_fulfillment_request_old',
        commandName: 'requestFulfillment',
        contractVersion: '1.0.0',
        payload: JSON.stringify({
          fulfillmentId: 'ful_warehouse_test',
          requestId: 'req_warehouse_test',
          aggregateId: 'acct_warehouse_test',
          userId: 'usr_warehouse_test',
          purchaseId: 'pur_warehouse_test',
        }),
        serviceName,
        serviceVersion: latestVersion,
      },
    }),
  );
  await decode(await latest.flush(1));
  await decode(await older.flush(1));
  const resource = {
    modelName: 'fulfillment',
    resourceId: 'ful_warehouse_test',
  };
  expect(
    await decode(
      await latest.getReplicatedResources({ resources: [resource] }),
    ),
  ).toMatchObject({
    resources: [
      {
        status: 'found',
        resource: { warehouseCode: 'aus-01', status: 'requested' },
      },
    ],
  });
  expect(
    await decode(await older.getReplicatedResources({ resources: [resource] })),
  ).toMatchObject({
    resources: [{ status: 'found', resource: { status: 'requested' } }],
  });

  await decode(
    await chain.admitServiceCommand({
      command: {
        id: 'cmd_fulfillment_pack_old',
        commandName: 'markPacked',
        contractVersion: '1.0.0',
        payload: JSON.stringify({ fulfillmentId: 'ful_warehouse_test' }),
        serviceName,
        serviceVersion: latestVersion,
      },
    }),
  );
  await decode(await latest.flush(2));
  await decode(await older.flush(2));
  await decode(await actor.catchup());
  expect(
    await decode(await actor.getRepoTableRows({ tableName: 'automationRuns' })),
  ).toMatchObject({
    rows: [
      { serviceIndex: 2, automationName: 'ship', programStatus: 'succeeded' },
    ],
  });
  await decode(await actor.flushAutomationOutputs({ throughStageIndex: 1 }));
  await decode(await latest.flush(3));
  expect(
    await decode(
      await latest.getReplicatedResources({ resources: [resource] }),
    ),
  ).toMatchObject({
    resources: [
      {
        status: 'found',
        resource: {
          warehouseCode: 'aus-01',
          status: 'shipped',
          trackingId: 'tracking-ful_warehouse_test',
        },
      },
    ],
  });
});
