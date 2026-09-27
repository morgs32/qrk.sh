import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { expect, it } from 'vitest';

import { serviceChainFixedDORepoConfig } from '../../ServiceChain/serviceChainFixedDORepoConfig.js';
import { serviceVersionRepoFixedDORepoConfig } from '../../ServiceVersionRepo/serviceVersionRepoFixedDORepoConfig.js';
import { serviceActorVersionRepoFixedDORepoConfig } from '../serviceActorVersionRepoFixedDORepoConfig.js';

const decode = <A, E>(envelope: Parameters<typeof readRpcEnvelope<A, E>>[0]) =>
  Effect.runPromise(readRpcEnvelope(envelope));

it('registers before the first service admission and saves its automation output', async () => {
  const chain = env.SERVICE_CHAIN.getByName(
    await Effect.runPromise(
      serviceChainFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'serviceAutomation',
      }),
    ),
  );
  const actor = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'serviceAutomation',
        serviceVersion: '1.0.0',
        actorName: '__service',
        actorVersion: '1.0.0',
        actorPath: '/',
      }),
    ),
  );
  const version = env.SERVICE_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'serviceAutomation',
        serviceVersion: '1.0.0',
      }),
    ),
  );
  await decode(
    await chain.admitServiceCommand({
      command: {
        id: 'cmd_service_automation_start',
        commandName: 'startJob',
        contractVersion: '1.0.0',
        payload: JSON.stringify({ id: 'job_service_automation' }),
        serviceName: 'serviceAutomation',
        serviceVersion: '1.0.0',
      },
    }),
  );
  await decode(await version.flush(1));
  await decode(await actor.catchup());
  const registration = await decode(
    await actor.getRepoTableRows({ tableName: 'automationState' }),
  );
  expect(registration).toMatchObject({ rows: [{ startIndex: 0 }] });
  const runs = await decode(
    await actor.getRepoTableRows({ tableName: 'automationRuns' }),
  );
  expect(runs).toMatchObject({
    rows: [
      {
        serviceIndex: 1,
        automationName: 'finishStartedJob',
        programStatus: 'succeeded',
      },
    ],
  });
  const pending = await decode(
    await actor.getRepoTableRows({ tableName: 'pendingCommands' }),
  );
  expect(pending).toMatchObject({
    rows: [{ stageIndex: 1, mutations: expect.any(String) }],
  });
  const forged = await chain.admitServiceCommand({
    command: {
      id: 'cmd_forged_finish',
      commandName: 'finishJob',
      contractVersion: '1.0.0',
      payload: JSON.stringify({ id: 'job_service_automation' }),
      serviceName: 'serviceAutomation',
      serviceVersion: '1.0.0',
    },
  });
  expect(forged.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'automation-authority-required' },
  });
  await decode(await actor.flushAutomationOutputs({ throughStageIndex: 1 }));
  await decode(await version.flush(2));
  await decode(await actor.catchup());
  const confirmed = await decode(
    await actor.getRepoTableRows({ tableName: 'commands' }),
  );
  expect(confirmed).toMatchObject({
    rows: [
      { id: 'cmd_service_automation_start', serviceIndex: 1 },
      { commandName: 'finishJob', serviceIndex: 2 },
    ],
  });
  expect(
    await decode(
      await actor.getAutomationOutput({
        serviceIndex: 1,
        automationName: 'finishStartedJob',
      }),
    ),
  ).toMatchObject({ commandName: 'finishJob' });
  expect(
    await decode(
      await chain.executeAutomationCommand({
        serviceVersion: '1.0.0',
        serviceIndex: 1,
        automationName: 'finishStartedJob',
      }),
    ),
  ).toMatchObject({ serviceIndex: 2 });

  const nextVersion = env.SERVICE_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'serviceAutomation',
        serviceVersion: '1.1.0',
      }),
    ),
  );
  const nextActor = env.SERVICE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      serviceActorVersionRepoFixedDORepoConfig.nameUtils.makeName({
        systemId: env.ZEROSPIN_SYSTEM_ID,
        serviceName: 'serviceAutomation',
        serviceVersion: '1.1.0',
        actorName: '__service',
        actorVersion: '1.1.0',
        actorPath: '/',
      }),
    ),
  );
  await decode(
    await chain.admitServiceCommand({
      command: {
        id: 'cmd_service_automation_next_version',
        commandName: 'startJob',
        contractVersion: '1.0.0',
        payload: JSON.stringify({ id: 'job_service_automation_next' }),
        serviceName: 'serviceAutomation',
        serviceVersion: '1.1.0',
      },
    }),
  );
  await decode(await nextVersion.flush(3));
  await decode(await nextActor.catchup());
  await decode(await actor.catchup());
  expect(
    await decode(
      await nextActor.getRepoTableRows({ tableName: 'automationRuns' }),
    ),
  ).toMatchObject({
    rows: [{ serviceIndex: 3, automationName: 'finishStartedJob' }],
  });
  expect(
    await decode(await actor.getRepoTableRows({ tableName: 'automationRuns' })),
  ).toMatchObject({
    rows: [{ serviceIndex: 1, automationName: 'finishStartedJob' }],
  });
  const nextOutput = await decode(
    await nextActor.getAutomationOutput({
      serviceIndex: 3,
      automationName: 'finishStartedJob',
    }),
  );
  expect(nextOutput).toMatchObject({ serviceVersion: '1.1.0' });
});
