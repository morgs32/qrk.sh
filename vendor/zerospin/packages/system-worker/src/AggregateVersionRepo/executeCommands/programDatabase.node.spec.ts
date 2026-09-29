import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { game } from '@zerospin/fixtures/system-worker/workerd/machineFixture';
import config from 'config';
import { Effect, Semaphore } from 'effect';
import { expect, it, vi } from 'vitest';

import { makeActorSnapshotDb } from '../../AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.js';
import { aggregateChainDbConfig } from '../../AggregateChain/aggregateChainDbConfig.js';
import { genesisDispositionHash } from '../../aggregateDispositionHash/aggregateDispositionHash.js';
import { serviceChainDbConfig } from '../../ServiceChain/serviceChainDbConfig.js';
import { executeCommands as executeServiceCommands } from '../../ServiceVersionRepo/executeCommands/executeCommands.js';
import { serviceVersionRepoDbConfig } from '../../ServiceVersionRepo/serviceVersionRepoDbConfig.js';
import { aggregateVersionRepoDbConfig } from '../aggregateVersionRepoDbConfig.js';

import { executeCommands } from './executeCommands.js';
import { extensionCalls, policy } from './extensionFixtureModels.js';

vi.mock('config', async () => {
  const { defineContract } =
    await import('@zerospin/core/contracts/defineContract');
  const { makeContractVersion } =
    await import('@zerospin/core/contracts/make/makeContractVersion');
  const { makeAggregateVersion } =
    await import('@zerospin/core/aggregate/make/makeAggregateVersion');
  const { makeAggregateActorVersion } =
    await import('@zerospin/core/aggregateActor/make/makeAggregateActorVersion/makeAggregateActorVersion');
  const { makeActorDbVersion } =
    await import('@zerospin/core/models/make/makeActorDbVersion');
  const { makeActorIdentity } =
    await import('@zerospin/core/identity/make/makeActorIdentity/makeActorIdentity');
  const { makeService } =
    await import('@zerospin/core/service/make/makeService');
  const { makeSystem } =
    await import('@zerospin/core/system/make/makeSystem/makeSystem');
  const { makeSystemConfig } =
    await import('@zerospin/core/system/make/makeSystemConfig');
  const { game } =
    await import('@zerospin/fixtures/system-worker/workerd/machineFixture');
  const { primitives } = await import('@zerospin/schema');
  const { AggregateError, ContractError } = await import('@zerospin/error');
  const { Effect, Schema } = await import('effect');
  const { RoutePattern } = await import('@remix-run/route-pattern');
  const models = { machineGame: game };
  const makeIncrement = (model: typeof game) =>
    makeContractVersion(defineContract('increment'), {
      version: '1.0.0',
      models: { machineGame: model },
      payload: { reject: primitives.boolean() },
      failures: { rejected: ContractError.schema({ code: 'rejected' }) },
      guard: Effect.fn(function* ({ payload, failures }) {
        if (payload.reject) return yield* failures.rejected.make();
      }),
      program: Effect.fn(function* ({ db, models, payload, failures }) {
        const row = db.query.machineGame.findFirst().sync();
        if (!row) throw new Error('Missing counter');
        const mutation = yield* models.machineGame.update({
          resourceId: row.id,
          attributes: { value: row.value + 1 },
        });
        if (payload.reject) return yield* failures.rejected.make();
        return [mutation];
      }),
    });
  const increment = makeIncrement(game);
  const { defineModel } = await import('@zerospin/core/models/defineModel');
  const { makeModelVersion } =
    await import('@zerospin/core/models/make/makeModelVersion');
  const { assignment, extensionCalls, policy } =
    await import('./extensionFixtureModels.js');
  const extend = makeContractVersion(defineContract('extend'), {
    version: '1.0.0',
    models: { machineGame: game },
    payload: { mode: primitives.text() },
    failures: {
      unavailable: AggregateError.schema({ code: 'unavailable' }),
      rejected: ContractError.schema({ code: 'rejected' }),
    },
    program: Effect.fn(function* ({ db, models, payload, failures }) {
      if (payload.mode === 'sharedReject') {
        return yield* failures.rejected.make();
      }
      if (payload.mode === 'empty') return [];
      const row = db.query.machineGame.findFirst().sync();
      if (!row) throw new Error('Missing counter');
      return [
        yield* models.machineGame.update({
          resourceId: row.id,
          attributes: { value: row.value + 1 },
        }),
      ];
    }),
  });
  const db = makeActorDbVersion({ models });
  const identity = makeActorIdentity({
    claims: Schema.Struct({ aggregateId: Schema.String }),
    actorPath: RoutePattern.parse('/:aggregateId'),
  });
  const human = makeAggregateActorVersion(
    { name: 'human' },
    {
      version: '1.0.0',
      authentication: 'none',
      db,
      identity,
      contracts: { increment, extend },
      queries: { machineGame: db.query.machineGame.findMany() },
    },
  );
  const counter = makeAggregateVersion(
    { name: 'counter' },
    {
      version: '1.0.0',
      models: { ...models, assignment, policy },
      contracts: { increment, extend },
      actors: { human },
      extensions: {
        extend: Effect.fn(function* ({ db, models, payload, failures }) {
          extensionCalls.push(payload.mode);
          const row = db.query.machineGame.findFirst().sync();
          if (!row) throw new Error('Missing submitted counter');
          if (payload.mode === 'reject') {
            return yield* failures.unavailable.make();
          }
          if (payload.mode === 'none') return [];
          const selectedPolicy = db.query.policy.findFirst().sync();
          if (!selectedPolicy) return yield* failures.unavailable.make();
          if (payload.mode === 'missing') {
            return [
              yield* models.assignment.update({
                resourceId: 'asn_missing',
                attributes: { revision: selectedPolicy.revision },
              }),
            ];
          }
          return [
            yield* models.machineGame.update({
              resourceId: row.id,
              attributes: { value: row.value + 1 },
            }),
            yield* models.assignment.create({
              resourceId: `asn_${row.value}`,
              attributes: {
                revision: selectedPolicy.revision,
                approver: selectedPolicy.approver,
              },
            }),
          ];
        }),
      },
    },
  );
  const serviceGame = makeModelVersion(
    defineModel({ name: 'machineGame', abbreviation: 'gam' }),
    {
      version: '1.0.0',
      attributes: { turn: primitives.text(), value: primitives.integer() },
      indexes: [],
    },
  );
  const service = makeService({
    name: 'counter',
    module: {
      '1.0.0': {
        models: { machineGame: serviceGame },
        contracts: { increment: makeIncrement(serviceGame) },
      },
    },
  });
  return {
    default: makeSystemConfig(
      makeSystem({
        name: 'counters',
        aggregates: { counter: { '1.0.0': counter } },
        services: { counter: service },
      }),
      { systemId: 'sys_counter' },
    ),
  };
});

it.each(['aggregate', 'service'] as const)(
  'reads preceding committed state and retains mutations through %s execution',
  async kind => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const aggregate = config.system.aggregates.counter?.['1.0.0'];
        if (!aggregate) throw new Error('Missing counter fixture');
        const dbConfig = makeResourceDbConfig({
          models:
            kind === 'aggregate'
              ? aggregate.models
              : config.system.services.counter!['1.0.0']!.models,
          otherTables:
            kind === 'aggregate'
              ? aggregateVersionRepoDbConfig.tables
              : serviceVersionRepoDbConfig.tables,
        });
        const { db } = yield* makeActorSnapshotDb(dbConfig);
        const model = game;
        const now = new Date();
        const initial = {
          id: 'gam_counter',
          modelName: 'machineGame',
          version: '1.0.0',
          createdAt: now,
          updatedAt: now,
          turn: 'X',
          value: 40,
        };
        db.insert(model.drizzleSchema).values(initial).run();
        const admission = {
          status: 'succeeded' as const,
          startedAt: now,
          completedAt: now,
        };
        if (kind === 'aggregate') {
          db.insert(aggregateVersionRepoDbConfig.schema.head)
            .values({
              singletonId: 1,
              aggregateIndex: 0,
              executedIndex: 0,
              dispositionHash: genesisDispositionHash(),
            })
            .run();
          const commands = yield* Effect.forEach(
            [false, false, true],
            (reject, i) =>
              aggregateChainDbConfig.tables.commands.encodeRow({
                id: `cmd_${i}`,
                commandName: 'increment',
                contractVersion: '1.0.0',
                payload: JSON.stringify({ reject }),
                aggregateIndex: i + 1,
                aggregateId: 'acct_counter',
                aggregateName: 'counter',
                aggregateVersion: '1.0.0',
                systemName: 'counters',
                actorName: 'human',
                actorVersion: '1.0.0',
                claims: { aggregateId: 'acct_counter' },
                nodeId: null,
                nodeIndex: null,
                sessionName: null,
                admission,
              }),
          );
          yield* executeCommands({
            db,
            commands,
            execution: yield* Semaphore.make(1),
            key: {
              systemId: 'sys_counter',
              aggregateId: 'acct_counter',
              aggregateName: 'counter',
              aggregateVersion: '1.0.0',
            },
          });
          const results = yield* Effect.forEach(
            db
              .select()
              .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
              .all(),
            row =>
              aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(
                row,
              ),
          );
          expect(results.map(row => row.execution.status)).toEqual([
            'succeeded',
            'succeeded',
            'failed',
          ]);
          expect(
            db
              .select()
              .from(aggregateVersionRepoDbConfig.schema.mutations)
              .all(),
          ).toHaveLength(2);
        } else {
          const rows = yield* Effect.forEach(
            [false, false, true],
            (reject, i) =>
              serviceChainDbConfig.tables.commands.encodeRow({
                id: `cmd_${i}`,
                commandName: 'increment',
                contractVersion: '1.0.0',
                payload: JSON.stringify({ reject }),
                serviceIndex: i + 1,
                serviceName: 'counter',
                serviceVersion: '1.0.0',
                admission,
              }),
          );
          yield* executeServiceCommands({
            db,
            rows,
            key: {
              systemId: 'sys_counter',
              serviceName: 'counter',
              serviceVersion: '1.0.0',
            },
          });
          const results = yield* Effect.forEach(
            db.select().from(serviceVersionRepoDbConfig.schema.commands).all(),
            row => serviceVersionRepoDbConfig.tables.commands.decodeRow(row),
          );
          expect(results.map(row => row.execution.status)).toEqual([
            'succeeded',
            'succeeded',
            'failed',
          ]);
          expect(
            db.select().from(serviceVersionRepoDbConfig.schema.mutations).all(),
          ).toHaveLength(2);
        }
        expect(db.query.machineGame?.findFirst().sync()).toMatchObject({
          value: 42,
        });
      }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
    );
  },
);

it('executes aggregate extensions in the command savepoint and retains one final result', async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const aggregate = config.system.aggregates.counter?.['1.0.0'];
      if (!aggregate) throw new Error('Missing counter fixture');
      const { db } = yield* makeActorSnapshotDb(
        makeResourceDbConfig({
          models: aggregate.models,
          otherTables: aggregateVersionRepoDbConfig.tables,
        }),
      );
      const now = new Date();
      const model = game;
      const initial = {
        id: 'gam_counter',
        modelName: 'machineGame',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        turn: 'X',
        value: 40,
      };
      db.insert(model.drizzleSchema).values(initial).run();
      const policyRow = {
        id: 'pol_current',
        modelName: 'policy',
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        revision: 7,
        approver: 'manager',
      };
      db.insert(policy.drizzleSchema).values(policyRow).run();
      db.insert(aggregateVersionRepoDbConfig.schema.head)
        .values({
          singletonId: 1,
          aggregateIndex: 0,
          executedIndex: 0,
          dispositionHash: genesisDispositionHash(),
        })
        .run();
      const commands = yield* Effect.forEach(
        [
          'normal',
          'empty',
          'reject',
          'missing',
          'sharedReject',
          'none',
        ] as const,
        (mode, index) =>
          aggregateChainDbConfig.tables.commands.encodeRow({
            id: `cmd_extend_${index}`,
            commandName: 'extend',
            contractVersion: '1.0.0',
            payload: JSON.stringify({ mode }),
            aggregateIndex: index + 1,
            aggregateId: 'acct_counter',
            aggregateName: 'counter',
            aggregateVersion: '1.0.0',
            systemName: 'counters',
            actorName: 'human',
            actorVersion: '1.0.0',
            claims: { aggregateId: 'acct_counter' },
            nodeId: null,
            nodeIndex: null,
            sessionName: null,
            admission: {
              status: 'succeeded',
              startedAt: now,
              completedAt: now,
            },
          }),
      );
      const execution = yield* Semaphore.make(1);
      const run = () =>
        executeCommands({
          db,
          commands,
          execution,
          key: {
            systemId: 'sys_counter',
            aggregateId: 'acct_counter',
            aggregateName: 'counter',
            aggregateVersion: '1.0.0',
          },
        });
      extensionCalls.length = 0;
      yield* run();
      const results = yield* Effect.forEach(
        db
          .select()
          .from(aggregateVersionRepoDbConfig.schema.aggregateCommands)
          .all(),
        row =>
          aggregateVersionRepoDbConfig.tables.aggregateCommands.decodeRow(row),
      );
      expect(results.map(row => row.execution.status)).toEqual([
        'succeeded',
        'succeeded',
        'failed',
        'failed',
        'failed',
        'succeeded',
      ]);
      expect(extensionCalls).toEqual([
        'normal',
        'empty',
        'reject',
        'missing',
        'none',
      ]);
      expect(results[2]?.execution).toMatchObject({
        status: 'failed',
        failure: { code: 'unavailable', scope: 'aggregate' },
      });
      expect(results[3]?.execution).toMatchObject({
        status: 'failed',
        failure: { code: 'mutation-row-not-found' },
      });
      expect(results[0]?.execution).toMatchObject({
        executionDelta: {
          updated: [{ id: 'gam_counter', value: 42 }],
          inserted: [{ id: 'asn_41', revision: 7, approver: 'manager' }],
        },
      });
      expect(results[1]?.execution).toMatchObject({
        executionDelta: {
          updated: [{ id: 'gam_counter', value: 43 }],
          inserted: [{ id: 'asn_42', revision: 7, approver: 'manager' }],
        },
      });
      expect(db.query.machineGame?.findFirst().sync()?.value).toBe(44);
      expect(db.query.assignment?.findMany().sync()).toHaveLength(2);
      const mutations = db
        .select()
        .from(aggregateVersionRepoDbConfig.schema.mutations)
        .all();
      expect(mutations).toHaveLength(6);
      expect(mutations.map(row => row.mutationIndex)).toEqual([
        0, 1, 2, 0, 1, 0,
      ]);
      yield* run();
      expect(extensionCalls).toEqual([
        'normal',
        'empty',
        'reject',
        'missing',
        'none',
      ]);
      expect(
        db.select().from(aggregateVersionRepoDbConfig.schema.mutations).all(),
      ).toHaveLength(6);
    }).pipe(Effect.scoped, Effect.provide(AsyncLive)),
  );
});
