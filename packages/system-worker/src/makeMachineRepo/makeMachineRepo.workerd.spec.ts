import { abortAllDurableObjects, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { Effect } from 'effect';
import { AggregateChain, AggregateVersionChain, ServiceChain, ServiceVersionChain, ServiceVersionRepo } from '../index.js';
import { aggregateMachineNameUtils, serviceMachineNameUtils } from '../machineRepoNames.js';
import { afterEach, expect, it } from 'vitest';

import { preparationBarriers, system, versionChanges } from '../../tests/workerd/machines/MachineSystem.js';

const machine = () => env.SERVICE_MACHINE_REPO.getByName(
  Effect.runSync(serviceMachineNameUtils.makeName({
    systemId: 'sys_machine_test',
    serviceName: 'machineSource',
    machineName: 'observer',
  })),
);
const state = () => runInDurableObject(machine(), (_instance, storage) =>
  storage.storage.sql.exec<{
    revision: number;
    stateName: string;
    stateJson: string;
    sourceIndex: number;
  }>('SELECT revision, stateName, stateJson, sourceIndex FROM machineState WHERE id = 1').one(),
);
const serviceChain = () => env.SERVICE_CHAIN.getByName(Effect.runSync(
  ServiceChain.fixedDORepoConfig.nameUtils.makeName({
    systemId: 'sys_machine_test', serviceName: 'machineSource',
  }),
));
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
const drainServiceMachineResults = async () => {
  await runInDurableObject(serviceVersionRepo(), instance => {
    if (!(instance instanceof ServiceVersionRepo)) throw new Error('Expected service version Repo');
    return system.runtime.runPromise(instance.executionResultsOutbox.drain().pipe(Effect.provide(AsyncLive)));
  });
  await runInDurableObject(serviceVersionChain(), instance => {
    if (!(instance instanceof ServiceVersionChain)) throw new Error('Expected service version chain');
    return instance.machineResultsFanout.drain();
  });
};

afterEach(async () => {
  preparationBarriers.clear();
  versionChanges.length = 0;
  await reset();
});

it('bootstraps one durable State', async () => {
  expect((await env.SYSTEM_REPO.getByName('sys_machine_test').checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  const repo = machine();
  expect((await repo.ready()).result._tag).toBe('Success');
  expect(await state()).toMatchObject({
    revision: 0,
    stateName: 'idle',
    sourceIndex: 0,
  });
});

it('builds historical projection through a captured frontier without reactions', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_history',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_history', value: 1 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  expect((await machine().ready()).result._tag).toBe('Success');
  expect(await state()).toMatchObject({ revision: 0, stateName: 'idle', sourceIndex: 1 });
  expect(JSON.parse((await state()).stateJson)).toMatchObject({ count: 1 });
  const rows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machineRecord').toArray(),
  );
  expect(rows).toHaveLength(1);
  const selectedRows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machine_selected_machineRecord').toArray(),
  );
  expect(selectedRows).toHaveLength(1);
});

it('rebuilds a changed source projection without reentering private State', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_rebuild',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_rebuild', value: 4 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  expect((await machine().ready()).result._tag).toBe('Success');
  const before = await state();
  await runInDurableObject(machine(), (_instance, storage) => {
    storage.storage.sql.exec('ALTER TABLE machineRecord ADD COLUMN obsolete TEXT');
    storage.storage.sql.exec("UPDATE machineState SET sourceVersion = '0.9.0' WHERE id = 1");
  });
  const activate = () => runInDurableObject(machine(), async instance => {
    if (!('onDOActivation' in instance) || typeof instance.onDOActivation !== 'function') {
      throw new Error('Machine activation method is unavailable');
    }
    const activation = instance.onDOActivation();
    if (!Effect.isEffect(activation)) throw new Error('Machine activation did not return an Effect');
    await system.runtime.runPromise(activation.pipe(Effect.provide(AsyncLive)));
  });
  await activate();
  expect(versionChanges).toEqual([{
    previousVersion: '0.9.0', version: '1.0.0', selectedCount: 0,
  }]);
  await activate();
  expect(versionChanges).toHaveLength(1);
  const obsoletePinRejected = await runInDurableObject(machine(), instance => {
    if (!('machineResultsFanoutSubscriber' in instance) ||
      typeof instance.machineResultsFanoutSubscriber !== 'function') {
      throw new Error('Machine subscriber method is unavailable');
    }
    try {
      instance.machineResultsFanoutSubscriber({
        systemId: 'sys_machine_test', serviceName: 'machineSource', serviceVersion: '0.9.0',
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(obsoletePinRejected).toBe(true);
  expect(await state()).toMatchObject({
    revision: before.revision,
    stateName: before.stateName,
    sourceIndex: 1,
  });
  const projection = await runInDurableObject(machine(), (_instance, storage) => ({
    columns: storage.storage.sql.exec<{ name: string }>('PRAGMA table_info(machineRecord)').toArray(),
    rows: storage.storage.sql.exec<{ id: string }>('SELECT id FROM machineRecord').toArray(),
  }));
  expect(projection.columns.map(column => column.name)).not.toContain('obsolete');
  expect(projection.rows).toHaveLength(1);
});

it('executes a bound service command from one State entry', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_trigger',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_trigger', value: 2 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await drainServiceMachineResults();
  await expect.poll(state).toMatchObject({ revision: 2, stateName: 'done' });
  const commands = await runInDurableObject(serviceVersionChain(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM commands ORDER BY serviceIndex').toArray(),
  );
  expect(commands).toHaveLength(2);
});

it('hands off a frozen service command and transitions on the push receipt', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_push_trigger',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_push_trigger', value: 8 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await drainServiceMachineResults();
  await expect.poll(state).toMatchObject({ revision: 2, stateName: 'done' });
  const operation = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ status: string; resultJson: string | null }>(
      'SELECT status, resultJson FROM machineOperations WHERE revision = 1',
    ).one(),
  );
  expect(operation.status).toBe('succeeded');
  if (operation.resultJson === null) throw new Error('Machine push result was not retained');
  expect(JSON.parse(operation.resultJson)).toMatchObject({ accepted: true });
  const commands = await runInDurableObject(serviceChain(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM commands ORDER BY serviceIndex').toArray(),
  );
  expect(commands).toHaveLength(2);
});

it('delivers a saved command after its binding is absent from the current declaration', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  const repoName = Effect.runSync(serviceMachineNameUtils.makeName({
    systemId: 'sys_machine_test', serviceName: 'machineSource', machineName: 'observer',
  }));
  expect((await machine().ready()).result._tag).toBe('Success');
  const revision = 50;
  const id = `cmd_${Array.from(new TextEncoder().encode(JSON.stringify([repoName, revision])),
    byte => byte.toString(16).padStart(2, '0')).join('')}`;
  await runInDurableObject(machine(), (_instance, storage) => {
    storage.storage.sql.exec(
      'INSERT INTO machineOperations (id, revision, kind, status, failure, commandJson, resultJson, retryAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      'mop_50', revision, 'command', 'pending', null,
      JSON.stringify({
        id, mode: 'execute', binding: 'retiredPutRecord', targetKind: 'service',
        targetName: 'machineSource', targetVersion: '1.0.0', aggregateId: null,
        commandName: 'putRecord', contractVersion: '1.0.0',
        payload: JSON.stringify({ id: 'mrec_old_frozen', value: 10 }), claims: {},
      }),
      null, null,
    );
  });
  await abortAllDurableObjects();
  expect((await machine().ready()).result._tag).toBe('Success');
  await expect.poll(async () => runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ status: string }>(
      'SELECT status FROM machineOperations WHERE revision = 50',
    ).one().status,
  )).toBe('succeeded');
  const commands = await runInDurableObject(serviceChain(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM commands').toArray(),
  );
  expect(commands).toMatchObject([{ id }]);
});

it('executes a bound aggregate command with machine authority', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  const owner = env.AGGREGATE_MACHINE_REPO.getByName(Effect.runSync(
    aggregateMachineNameUtils.makeName({
      systemId: 'sys_machine_test',
      aggregateName: 'machineAggregate',
      aggregateId: 'acct_machine',
      machineName: 'aggregateWriter',
    }),
  ));
  expect((await owner.ready()).result._tag).toBe('Success');
  await expect.poll(async () => runInDurableObject(owner, (_instance, storage) =>
    storage.storage.sql.exec<{ stateName: string }>(
      'SELECT stateName FROM machineState WHERE id = 1',
    ).one().stateName,
  )).toBe('done');
  const versionChain = env.AGGREGATE_VERSION_CHAIN.getByName(Effect.runSync(
    AggregateVersionChain.fixedDORepoConfig.nameUtils.makeName({
      systemId: 'sys_machine_test',
      aggregateName: 'machineAggregate',
      aggregateId: 'acct_machine',
      aggregateVersion: '1.0.0',
    }),
  ));
  await runInDurableObject(versionChain, instance => {
    if (!(instance instanceof AggregateVersionChain)) throw new Error('Expected aggregate version chain');
    return instance.machineResultsFanout.drain();
  });
  const rows = await runInDurableObject(owner, (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM aggregateRecord').toArray(),
  );
  expect(rows).toMatchObject([{ id: 'arec_aggregate_output' }]);
  const chain = env.AGGREGATE_CHAIN.getByName(Effect.runSync(
    AggregateChain.fixedDORepoConfig.nameUtils.makeName({
      systemId: 'sys_machine_test',
      aggregateName: 'machineAggregate',
      aggregateId: 'acct_machine',
    }),
  ));
  const commands = await runInDurableObject(chain, (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM commands').toArray(),
  );
  expect(commands).toHaveLength(1);
});

it('advances the source cursor without reentering an unchanged State', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_unchanged',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_unchanged', value: 4 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await drainServiceMachineResults();
  await expect.poll(state).toMatchObject({ revision: 0, stateName: 'idle', sourceIndex: 1 });
  const rows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machineRecord').toArray(),
  );
  expect(rows).toHaveLength(1);
  const selectedRows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machine_selected_machineRecord').toArray(),
  );
  expect(selectedRows).toHaveLength(0);
  const queue = await serviceVersionChain().machineResultsFanout;
  const page = await queue.getPage({ afterIndex: 0, maxIndex: 1 });
  expect(page.result._tag).toBe('Success');
  if (page.result._tag !== 'Success') return;
  const subscriber = await machine().machineResultsFanoutSubscriber({
    systemId: 'sys_machine_test', serviceName: 'machineSource', serviceVersion: '1.0.0',
  });
  expect((await subscriber.receive(page.result.success)).result._tag).toBe('Success');
  expect(await state()).toMatchObject({ revision: 0, stateName: 'idle', sourceIndex: 1 });
});

it('consumes failed and no-op terminal occurrences without changing State', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const send = async (index: number, commandId: `cmd_${string}`, id: string, value: number) => {
    const admitted = await serviceChain().admitServiceCommand({ command: {
      id: commandId,
      commandName: 'putRecord',
      contractVersion: '1.0.0',
      payload: JSON.stringify({ id, value }),
      serviceName: 'machineSource',
      serviceVersion: '1.0.0',
    } });
    expect(admitted.result._tag).toBe('Success');
    if (admitted.result._tag !== 'Success') return;
    expect(admitted.result.success.serviceIndex).toBe(index);
    await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
    await drainServiceMachineResults();
    const failure = await runInDurableObject(serviceVersionChain(), (_instance, storage) =>
      storage.storage.sql.exec<{ failure: string | null }>(
        'SELECT failure FROM machineResultsSubscribers',
      ).one().failure,
    );
    expect(failure).toBeNull();
    const commands = await runInDurableObject(serviceVersionChain(), (_instance, storage) =>
      storage.storage.sql.exec<{ serviceIndex: number }>(
        'SELECT serviceIndex FROM commands ORDER BY serviceIndex',
      ).toArray(),
    );
    expect(commands).toHaveLength(index);
  };
  await send(1, 'cmd_machine_success', 'mrec_machine_terminal', 4);
  await send(2, 'cmd_machine_failed', 'mrec_machine_rejected', -1);
  await send(3, 'cmd_machine_noop', 'mrec_machine_noop', 0);
  expect(await state()).toMatchObject({ revision: 0, stateName: 'idle', sourceIndex: 3 });
  const rows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machineRecord').toArray(),
  );
  expect(rows).toMatchObject([{ id: 'mrec_machine_terminal' }]);
});

it('rolls back projection, State, and cursor when receipt handling fails', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_rollback',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_rollback', value: 3 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await drainServiceMachineResults().catch(() => undefined);
  await expect.poll(async () => runInDurableObject(serviceVersionChain(), (_instance, storage) =>
    storage.storage.sql.exec<{ failure: string | null }>(
      'SELECT failure FROM machineResultsSubscribers',
    ).one().failure,
  )).not.toBeNull();
  expect(await state()).toMatchObject({ revision: 0, stateName: 'idle', sourceIndex: 0 });
  const rows = await runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ id: string }>('SELECT id FROM machineRecord').toArray(),
  );
  expect(rows).toHaveLength(0);
});

it('interrupts an obsolete activation and rejects its late State', async () => {
  let release!: () => void;
  preparationBarriers.set(6, new Promise<void>(resolve => { release = resolve; }));
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const send = async (value: number) => {
    const admitted = await serviceChain().admitServiceCommand({ command: {
      id: `cmd_machine_prepare_${value}`,
      commandName: 'putRecord',
      contractVersion: '1.0.0',
      payload: JSON.stringify({ id: `mrec_machine_prepare_${value}`, value }),
      serviceName: 'machineSource',
      serviceVersion: '1.0.0',
    } });
    expect(admitted.result._tag).toBe('Success');
    if (admitted.result._tag !== 'Success') return;
    await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
    await drainServiceMachineResults();
  };
  await send(6);
  await expect.poll(state).toMatchObject({ revision: 1, stateName: 'preparing', sourceIndex: 1 });
  await expect.poll(async () => runInDurableObject(machine(), (_instance, storage) =>
    storage.storage.sql.exec<{ status: string }>(
      'SELECT status FROM machineOperations WHERE revision = 1',
    ).one().status,
  )).toBe('running');
  await send(7);
  await expect.poll(state).toMatchObject({ revision: 3, stateName: 'done', sourceIndex: 2 });
  release();
  expect(await state()).toMatchObject({ revision: 3, stateName: 'done' });
});

it('retains a waiting State and its alarm across restart', async () => {
  const systemRepo = env.SYSTEM_REPO.getByName('sys_machine_test');
  expect((await systemRepo.checkSystemSpec({ spec: makeSystemSpec({ system }) })).result._tag).toBe('Success');
  expect((await systemRepo.initialize()).result._tag).toBe('Success');
  const admitted = await serviceChain().admitServiceCommand({ command: {
    id: 'cmd_machine_test',
    commandName: 'putRecord',
    contractVersion: '1.0.0',
    payload: JSON.stringify({ id: 'mrec_machine_test', value: 1 }),
    serviceName: 'machineSource',
    serviceVersion: '1.0.0',
  } });
  expect(admitted.result._tag).toBe('Success');
  if (admitted.result._tag !== 'Success') return;
  await serviceVersionRepo().execute({ serviceIndex: admitted.result.success.serviceIndex });
  await drainServiceMachineResults();
  const deliveryFailure = await runInDurableObject(serviceVersionChain(), (_instance, storage) =>
    storage.storage.sql.exec<{ failure: string | null }>('SELECT failure FROM machineResultsSubscribers').one().failure,
  );
  expect(deliveryFailure).toBeNull();
  await expect.poll(state, { timeout: 5_000 }).toMatchObject({
    revision: 1,
    stateName: 'waiting',
    sourceIndex: 1,
  });
  const waiting = await state();
  await abortAllDurableObjects();
  expect((await machine().ready()).result._tag).toBe('Success');
  expect(await state()).toMatchObject(waiting);
  await runInDurableObject(machine(), (_instance, storage) => {
    storage.storage.sql.exec('UPDATE machineState SET wakeAt = 0 WHERE id = 1');
  });
  await runDurableObjectAlarm(machine());
  expect(await state()).toMatchObject({
    revision: 2,
    stateName: 'done',
    sourceIndex: 1,
  });
});
