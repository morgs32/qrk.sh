import { abortAllDurableObjects, reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { Effect } from 'effect';
import { ServiceChain, ServiceVersionChain, ServiceVersionRepo } from '../index.js';
import { serviceMachineNameUtils } from '../machineRepoNames.js';
import { afterEach, expect, it } from 'vitest';

import { preparationAttempts, preparationBarriers, system } from '../../tests/workerd/machines/MachineSystem.js';

const machine = () => env.SERVICE_MACHINE_REPO.getByName(
  Effect.runSync(serviceMachineNameUtils.makeName({
    systemId: 'sys_machine_test', serviceName: 'machineSource', machineName: 'observer',
  })),
);
const state = () => runInDurableObject(machine(), (_instance, storage) =>
  storage.storage.sql.exec<{
    revision: number;
    stateName: string;
    sourceIndex: number;
  }>('SELECT revision, stateName, sourceIndex FROM machineState WHERE id = 1').one(),
);
const serviceVersionRepo = () => env.SERVICE_VERSION_REPO.getByName(Effect.runSync(
  ServiceVersionRepo.fixedDORepoConfig.nameUtils.makeName({
    systemId: 'sys_machine_test', serviceName: 'machineSource', serviceVersion: '1.0.0',
  }),
));
const serviceVersionChain = () => env.SERVICE_VERSION_CHAIN.getByName(Effect.runSync(
  ServiceVersionChain.fixedDORepoConfig.nameUtils.makeName({
    systemId: 'sys_machine_test', serviceName: 'machineSource', serviceVersion: '1.0.0',
  }),
));

afterEach(async () => {
  preparationBarriers.clear();
  preparationAttempts.clear();
  await reset();
});

it('restarts an interrupted activation under the same State revision', async () => {
  let release!: () => void;
  preparationBarriers.set(6, new Promise<void>(resolve => { release = resolve; }));
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const serviceChain = env.SERVICE_CHAIN.getByName(Effect.runSync(
    ServiceChain.fixedDORepoConfig.nameUtils.makeName({
      systemId: 'sys_machine_test', serviceName: 'machineSource',
    }),
  ));
  const admitted = await serviceChain.admitServiceCommand({ command: {
    id: 'cmd_machine_restart_activation',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_restart_activation', value: 6 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await runInDurableObject(serviceVersionRepo(), instance => {
    if (!(instance instanceof ServiceVersionRepo)) throw new Error('Expected service version Repo');
    return system.runtime.runPromise(instance.executionResultsOutbox.drain().pipe(Effect.provide(AsyncLive)));
  });
  await runInDurableObject(serviceVersionChain(), instance => {
    if (!(instance instanceof ServiceVersionChain)) throw new Error('Expected service version chain');
    return instance.machineResultsFanout.drain();
  });
  await expect.poll(() => preparationAttempts.get(6)).toBe(1);
  expect(await state()).toMatchObject({ revision: 1, stateName: 'preparing', sourceIndex: 1 });
  await abortAllDurableObjects();
  expect((await machine().ready()).result._tag).toBe('Success');
  await expect.poll(() => preparationAttempts.get(6)).toBe(2);
  expect(await state()).toMatchObject({ revision: 1, stateName: 'preparing', sourceIndex: 1 });
  release();
  await expect.poll(state).toMatchObject({ revision: 2, stateName: 'done', sourceIndex: 1 });
});
