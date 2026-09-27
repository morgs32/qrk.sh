import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { beforeEach, expect, it } from 'vitest';

import type { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import { aggregateChainFixedDORepoConfig } from '../../AggregateChain/aggregateChainFixedDORepoConfig.js';
import type { AggregateActorVersionRepo } from '../AggregateActorVersionRepo.js';
import { aggregateActorVersionRepoFixedDORepoConfig } from '../aggregateActorVersionRepoFixedDORepoConfig.js';

const key = {
  systemId: env.ZEROSPIN_SYSTEM_ID,
  aggregateId: 'acct_automation',
  aggregateName: 'automationGame',
};
const actorKey = {
  ...key,
  aggregateVersion: '1.0.0',
  actorName: 'human',
  actorVersion: '1.0.0',
  actorPath: '/acct_automation/gam_selected',
};
let testIndex = 0;
beforeEach(() => {
  key.aggregateId = `acct_automation${++testIndex}`;
  actorKey.aggregateId = key.aggregateId;
  actorKey.actorPath = `/${key.aggregateId}/gam_selected`;
});
const command = (
  name: string,
  id: `cmd_${string}`,
  value: number,
): IEncodedCommand<IAggregateCommand> => ({
  ...key,
  systemName: 'system-worker',
  aggregateVersion: '1.0.0',
  id,
  commandName: name,
  contractVersion: '1.0.0',
  payload: JSON.stringify({ id: 'gam_selected', value }),
  actorName: 'human',
  actorVersion: '1.0.0',
  identity: { aggregateId: key.aggregateId, instanceId: 'gam_selected' },
  nodeId: null,
  sessionName: null,
  nodeIndex: null,
});
const decode = <A, E>(envelope: Parameters<typeof readRpcEnvelope<A, E>>[0]) =>
  Effect.runPromise(readRpcEnvelope(envelope));

// Keep the declared RPC result at the Worker stub boundary.
const submit = (
  chain: Pick<AggregateChain, 'executeAggregateCommand'>,
  props: Parameters<AggregateChain['executeAggregateCommand']>[0],
): ReturnType<AggregateChain['executeAggregateCommand']> =>
  chain.executeAggregateCommand(props);
const admit = (
  chain: Pick<AggregateChain, 'admitCommands'>,
  props: Parameters<AggregateChain['admitCommands']>[0],
): ReturnType<AggregateChain['admitCommands']> => chain.admitCommands(props);
const inspect = (
  repo: Pick<AggregateActorVersionRepo, 'getRepoTableRows'>,
  props: Parameters<AggregateActorVersionRepo['getRepoTableRows']>[0],
): ReturnType<AggregateActorVersionRepo['getRepoTableRows']> =>
  repo.getRepoTableRows(props);
const submitAutomation = (
  chain: Pick<AggregateChain, 'executeAutomationCommand'>,
  props: Parameters<AggregateChain['executeAutomationCommand']>[0],
): ReturnType<AggregateChain['executeAutomationCommand']> =>
  chain.executeAutomationCommand(props);

it('stages a caller command in AAVR before its outbox admits it', async () => {
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    ),
  );
  const input = command('automationCreate', 'cmd_actor_stage', 4);
  expect(await decode(await repo.stageCommands({ commands: [input] }))).toEqual(
    [{ commandId: input.id, stagingFailure: null }],
  );
  const receipt = await decode(
    await repo.getStagedAdmission({ commandId: input.id }),
  );
  expect(receipt).toMatchObject({
    id: input.id,
    aggregateIndex: 1,
    admission: { status: 'succeeded' },
  });
  const retained = await decode(
    await inspect(repo, { tableName: 'pendingCommands' }),
  );
  expect(retained.rows).toHaveLength(1);
  expect(retained.rows[0]).toMatchObject({
    stageIndex: 1,
    commandRowId: expect.any(String),
    acknowledgedAt: expect.any(Date),
  });
  const saved = await decode(await inspect(repo, { tableName: 'commands' }));
  expect(
    saved.rows.find(row => row.rowId === retained.rows[0]?.commandRowId),
  ).toMatchObject({
    id: input.id,
    aggregateIndex: 1,
  });
  const admitted = await decode(
    await inspect(chain, { tableName: 'commands' }),
  );
  expect(admitted.rows).toHaveLength(1);
});

it('rejects automation provenance at the caller staging boundary', async () => {
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const result = await repo.stageCommands({
    commands: [
      {
        ...command('automationPlayO', 'cmd_forged_stage', 1),
        automationName: 'computerTurn',
      },
    ],
  });
  expect(result.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'automation-authority-required' },
  });
});

it('records AC admission refusal without advancing the confirmed actor cursor', async () => {
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const input = {
    ...command('automationCreate', 'cmd_rejected_admission', 4),
    nodeId: 'node_missing_first',
    sessionName: 'test',
    nodeIndex: 2,
  };
  expect(await decode(await repo.stageCommands({ commands: [input] }))).toEqual(
    [{ commandId: input.id, stagingFailure: null }],
  );
  const admission = await repo.getStagedAdmission({ commandId: input.id });
  expect(admission.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'node-admission-index-mismatch' },
  });
  const pending = await decode(
    await inspect(repo, { tableName: 'pendingCommands' }),
  );
  expect(pending.rows[0]).toMatchObject({
    commandRowId: expect.any(String),
    resolvedAt: expect.any(Date),
    acknowledgedAt: expect.any(Date),
  });
  const saved = await decode(await inspect(repo, { tableName: 'commands' }));
  expect(
    saved.rows.find(row => row.rowId === pending.rows[0]?.commandRowId),
  ).toMatchObject({
    id: input.id,
    aggregateIndex: null,
    admission: expect.stringContaining('failed'),
  });
  const repeated = await repo.getStagedAdmission({ commandId: input.id });
  expect(repeated.result).toEqual(admission.result);
  const state = await decode(await inspect(repo, { tableName: 'actorState' }));
  expect(state.rows).toHaveLength(0);
});

it('delivers X admission through live fanout, automation O, and actor publication', async () => {
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    ),
  );
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const created = await decode(
    await admit(chain, {
      aggregateVersion: '1.0.0',
      commands: [command('automationCreate', 'cmd_admit_create', 0)],
    }),
  );
  expect(created).toMatchObject([
    { id: 'cmd_admit_create', aggregateIndex: 1 },
  ]);
  const moved = await decode(
    await admit(chain, {
      aggregateVersion: '1.0.0',
      commands: [command('automationPlayX', 'cmd_admit_x', 1)],
    }),
  );
  expect(moved).toMatchObject([{ id: 'cmd_admit_x', aggregateIndex: 2 }]);
  await expect
    .poll(
      async () => {
        const data = await decode(
          await inspect(chain, { tableName: 'commands' }),
        );
        return data.rows.find(row => row.commandName === 'automationPlayO');
      },
      { timeout: 15000 },
    )
    .toBeDefined();
  await expect
    .poll(
      async () => {
        const data = await decode(
          await inspect(repo, { tableName: 'actorState' }),
        );
        return data.rows[0]?.executedIndex;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(3);
});

it('registers before the first move and executes a guarded automation-only command without a browser', async () => {
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    ),
  );
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const created = await decode(
    await submit(chain, {
      aggregateVersion: '1.0.0',
      command: command('automationCreate', 'cmd_create', 0),
    }),
  );
  expect(created.execution.status).toBe('succeeded');
  const moved = await decode(
    await submit(chain, {
      aggregateVersion: '1.0.0',
      command: command('automationPlayX', 'cmd_move', 1),
    }),
  );
  expect(moved.execution.status).toBe('succeeded');
  await expect
    .poll(
      async () => {
        const data = await decode(
          await inspect(chain, { tableName: 'commands' }),
        );
        return data.rows.find(row => row.commandName === 'automationPlayO');
      },
      { timeout: 15000 },
    )
    .toMatchObject({
      automationName: 'computerTurn',
      identity: expect.any(String),
    });
  await expect
    .poll(
      async () => {
        const data = await decode(
          await inspect(repo, { tableName: 'pendingCommands' }),
        );
        const outputs = await decode(
          await inspect(repo, { tableName: 'commands' }),
        );
        const output = outputs.rows.find(
          row => row.automationName === 'computerTurn',
        );
        return data.rows.find(row => row.commandRowId === output?.rowId)
          ?.acknowledgedAt;
      },
      { timeout: 15000 },
    )
    .toBeTruthy();
  const repeated = await decode(
    await submit(chain, {
      aggregateVersion: '1.0.0',
      command: command('automationPlayX', 'cmd_move', 999),
    }),
  );
  expect(repeated.payload).toBe(moved.payload);
  const data = await decode(await inspect(chain, { tableName: 'commands' }));
  expect(
    data.rows.filter(row => row.commandName === 'automationPlayO'),
  ).toHaveLength(1);
  const output = data.rows.find(row => row.commandName === 'automationPlayO');
  const retriedOutput = await decode(
    await submitAutomation(chain, {
      ...actorKey,
      automationName: 'computerTurn',
      executedIndex: moved.executedIndex,
    }),
  );
  expect(retriedOutput).toMatchObject({
    id: output?.id,
    executedIndex: output?.aggregateIndex,
  });
  expect(
    (await decode(await inspect(chain, { tableName: 'commands' }))).rows.filter(
      row => row.commandName === 'automationPlayO',
    ),
  ).toHaveLength(1);
});

it('rejects forged automation provenance and direct calls to automation-only contracts', async () => {
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    ),
  );
  const forged = await submit(chain, {
    aggregateVersion: '1.0.0',
    command: {
      ...command('automationPlayO', 'cmd_forged', 0),
      automationName: 'computerTurn',
    },
  });
  expect(forged.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'automation-authority-required' },
  });
  const direct = await submit(chain, {
    aggregateVersion: '1.0.0',
    command: command('automationPlayO', 'cmd_direct', 0),
  });
  expect(direct.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'admission-contract-not-found' },
  });
  const missing = await submitAutomation(chain, {
    ...actorKey,
    automationName: 'computerTurn',
    executedIndex: 1,
  });
  expect(missing.result).toMatchObject({
    _tag: 'Failure',
    failure: { code: 'automation-output-not-found' },
  });
});

it('retains a rejected automation command as terminal and does not rerun it', async () => {
  const chain = env.AGGREGATE_CHAIN.getByName(
    await Effect.runPromise(
      aggregateChainFixedDORepoConfig.nameUtils.makeName(key),
    ),
  );
  const repo = env.AGGREGATE_ACTOR_VERSION_REPO.getByName(
    await Effect.runPromise(
      aggregateActorVersionRepoFixedDORepoConfig.nameUtils.makeName(actorKey),
    ),
  );
  const created = await decode(
    await submit(chain, {
      aggregateVersion: '1.0.0',
      command: command('automationCreate', 'cmd_create', 0),
    }),
  );
  expect(created.execution.status).toBe('succeeded');
  const moved = await decode(
    await submit(chain, {
      aggregateVersion: '1.0.0',
      command: command('automationPlayX', 'cmd_stale', 13),
    }),
  );
  expect(moved.execution.status).toBe('succeeded');
  await expect
    .poll(
      async () => {
        const data = await decode(
          await inspect(repo, { tableName: 'automationRuns' }),
        );
        return data.rows.find(row => row.automationName === 'computerTurn');
      },
      { timeout: 15000 },
    )
    .toMatchObject({
      programStatus: 'succeeded',
      stagingFailure: expect.stringContaining('stale'),
    });
  const commands = await decode(
    await inspect(chain, { tableName: 'commands' }),
  );
  expect(
    commands.rows.filter(row => row.commandName === 'automationPlayO'),
  ).toHaveLength(0);
});
