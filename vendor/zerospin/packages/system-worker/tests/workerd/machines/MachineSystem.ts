import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateVersion } from '@zerospin/core/aggregate/make/makeAggregateVersion';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { MachineClaimsSchema } from '@zerospin/core/machine/MachineClaimsSchema';
import {
  execute,
  makeMachine,
  push,
} from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import { defineModel } from '@zerospin/core/models/defineModel';
import {
  captureActorSelections,
  makeActorDbVersion,
} from '@zerospin/core/models/make/makeActorDbVersion';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';
import { makeSystemConfig } from '@zerospin/core/system/make/makeSystemConfig';
import { ContractError } from '@zerospin/error';
import { makeAbbreviationIdSchema, primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export const record = makeModelVersion(
  defineModel({ name: 'machineRecord', abbreviation: 'mrec' }),
  {
    version: '1.0.0',
    attributes: { value: primitives.integer() },
    indexes: [],
  },
);

export const putRecord = makeContractVersion(defineContract('putRecord'), {
  version: '1.0.0',
  models: { machineRecord: record },
  payload: {
    id: primitives.foreignKey({ abbreviation: 'mrec' }),
    value: primitives.integer(),
  },
  failures: {
    rejected: ContractError.schema({ code: 'machine-record-rejected' }),
  },
  program: ({ models, payload, failures }) =>
    Effect.gen(function* () {
      if (payload.value === -1) {
        return yield* failures.rejected.make({
          message: 'Fixture rejected record',
          extra: null,
        });
      }
      if (payload.value === 0) return [];
      const mutation = yield* models.machineRecord.create({
        resourceId: payload.id,
        attributes: { value: payload.value },
      });
      return [mutation];
    }),
});

export const source = makeService({
  name: 'machineSource',
  module: {
    '1.0.0': { models: { machineRecord: record }, contracts: { putRecord } },
  },
});

export const aggregateRecord = makeModelVersion(
  defineModel({ name: 'aggregateRecord', abbreviation: 'arec' }),
  {
    version: '1.0.0',
    attributes: { value: primitives.integer() },
    indexes: [],
  },
);

export const putAggregateRecord = makeContractVersion(
  defineContract('putAggregateRecord'),
  {
    version: '1.0.0',
    claims: MachineClaimsSchema,
    models: { aggregateRecord },
    payload: {
      id: primitives.foreignKey({ abbreviation: 'arec' }),
      value: primitives.integer(),
    },
    guard: ({ claims }) =>
      Effect.sync(() => {
        if (claims.ownerUserId !== 'usr_machine') {
          throw new Error('machine-identity-claims-missing');
        }
      }),
    program: ({ models, payload }) =>
      models.aggregateRecord
        .create({
          resourceId: payload.id,
          attributes: { value: payload.value },
        })
        .pipe(Effect.map(mutation => [mutation])),
  },
);
export const aggregateSource = makeAggregateVersion(
  defineAggregate({ name: 'machineAggregate' }),
  {
    version: '1.0.0',
    models: { aggregateRecord },
    contracts: { putAggregateRecord },
    actors: {},
  },
);

export const Idle = makeState({
  stateName: 'idle',
  input: { count: Schema.Int },
});
export const Waiting = makeState({
  stateName: 'waiting',
  input: { count: Schema.Int },
});
export const Sending = makeState({
  stateName: 'sending',
  input: { id: makeAbbreviationIdSchema('mrec') },
});
export const Pushing = makeState({
  stateName: 'pushing',
  input: { id: makeAbbreviationIdSchema('mrec') },
});
export const AggregateSending = makeState({
  stateName: 'sending',
  input: { id: makeAbbreviationIdSchema('arec') },
});
export const Preparing = makeState({
  stateName: 'preparing',
  input: { token: Schema.Int },
});
export const Done = makeState({
  stateName: 'done',
  input: { count: Schema.Int },
});
export const preparationBarriers = new Map<number, Promise<void>>();
export const preparationAttempts = new Map<number, number>();
export const versionChanges: {
  previousVersion: string;
  version: string;
  selectedCount: number;
}[] = [];
const selectedSourceDb = makeActorDbVersion({
  models: { machineRecord: record },
});
const selections = captureActorSelections(
  selectedSourceDb,
  {
    machineRecord: selectedSourceDb.query.machineRecord.findMany({
      where: { value: { eq: 1 } },
    }),
  },
  Schema.Struct({}),
);

export const machine = makeMachine({
  source: source.versions['1.0.0'],
  selections,
  contracts: {
    putRecord: { contract: putRecord, target: source.versions['1.0.0'] },
  },
  states: {
    idle: Idle,
    waiting: Waiting,
    sending: Sending,
    pushing: Pushing,
    preparing: Preparing,
    done: Done,
  },
  onBootstrap: ({ db }) =>
    Idle.make({ count: db.query.machineRecord.findMany().sync().length }),
  onVersionChange: ({ db, previousVersion, version }) => {
    versionChanges.push({
      previousVersion,
      version,
      selectedCount: db.query.machineRecord.findMany().sync().length,
    });
    return undefined;
  },
  routes: {
    idle: {
      onCommand: ({ origin, command, db }) => {
        if (
          command.commandName !== 'putRecord' ||
          command.execution.status !== 'succeeded'
        ) {
          return undefined;
        }
        const payload = Schema.decodeUnknownSync(
          Schema.fromJsonString(
            Schema.Struct({
              id: makeAbbreviationIdSchema('mrec'),
              value: Schema.Int,
            }),
          ),
        )(command.payload);
        if (
          payload.value === 1 &&
          !db.query.machineRecord
            .findMany()
            .sync()
            .some(row => row.id === payload.id)
        ) {
          throw new Error('machine-selected-projection-missing');
        }
        if (payload.value === 3) throw new Error('machine-receipt-rejected');
        if (payload.value === 0 || payload.value === 4) return undefined;
        if (payload.value === 6) return Preparing.make({ token: 6 });
        if (payload.value === 8) {
          return Pushing.make({ id: 'mrec_machine_pushed' });
        }
        return payload.value === 2
          ? Sending.make({ id: 'mrec_machine_output' })
          : Waiting.make({ count: origin.count + 1 });
      },
    },
    waiting: {
      wakeAt: () => Date.now() + 3_600_000,
      onWake: ({ origin }) => Done.make({ count: origin.count }),
    },
    sending: {
      command: ({ origin }) =>
        execute({
          binding: 'putRecord',
          payload: { id: origin.id, value: 5 },
        }),
      onResult: () => Done.make({ count: 5 }),
    },
    pushing: {
      command: ({ origin }) =>
        push({
          binding: 'putRecord',
          payload: { id: origin.id, value: 9 },
        }),
      onResult: ({ result }) => {
        if (!('accepted' in result) || !result.accepted) {
          throw new Error('machine-push-receipt-missing');
        }
        return Done.make({ count: 9 });
      },
    },
    preparing: {
      onCommand: ({ command }) => {
        if (
          command.commandName !== 'putRecord' ||
          command.execution.status !== 'succeeded'
        ) {
          return undefined;
        }
        const payload = Schema.decodeUnknownSync(
          Schema.fromJsonString(Schema.Struct({ value: Schema.Int })),
        )(command.payload);
        return payload.value === 7 ? Preparing.make({ token: 7 }) : undefined;
      },
      onActivation: ({ origin }) =>
        Effect.gen(function* () {
          preparationAttempts.set(
            origin.token,
            (preparationAttempts.get(origin.token) ?? 0) + 1,
          );
          const barrier = preparationBarriers.get(origin.token);
          if (barrier !== undefined) yield* Effect.promise(() => barrier);
          return Done.make({ count: origin.token });
        }),
    },
  },
});

export const aggregateWriter = makeMachine({
  source: aggregateSource,
  selections: {},
  contracts: {
    putAggregateRecord: {
      contract: putAggregateRecord,
      target: aggregateSource,
    },
  },
  states: { sending: AggregateSending, done: Done },
  onBootstrap: () => AggregateSending.make({ id: 'arec_aggregate_output' }),
  routes: {
    sending: {
      command: ({ origin }) =>
        execute({
          binding: 'putAggregateRecord',
          aggregateId: 'acct_machine',
          claims: { ownerUserId: 'usr_machine' },
          payload: { id: origin.id, value: 8 },
        }),
      onResult: () => Done.make({ count: 8 }),
    },
  },
});

export const system = makeSystem({
  name: 'machineTest',
  aggregates: { machineAggregate: { '1.0.0': aggregateSource } },
  services: { machineSource: source },
  machines: { observer: machine, aggregateWriter },
});

// oxlint-disable-next-line import/no-default-export -- Wrangler config module interface.
export default makeSystemConfig(system, { systemId: 'sys_machine_test' });
