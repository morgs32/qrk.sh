import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import {
  execute,
  makeMachine,
} from '@zerospin/core/machine/makeMachine/makeMachine';
import { makeState } from '@zerospin/core/machine/makeState/makeState';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { makeAbbreviationIdSchema, primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

const job = makeModelVersion(
  defineModel({ name: 'job', abbreviation: 'job' }),
  {
    version: '1.0.0',
    attributes: { status: primitives.text() },
    indexes: [],
  },
);

const startJob = makeContractVersion(defineContract('startJob'), {
  version: '1.0.0',
  models: { job },
  payload: { id: primitives.foreignKey({ abbreviation: 'job' }) },
  program: ({ payload, models }) =>
    Effect.map(
      models.job.create({
        resourceId: payload.id,
        attributes: { status: 'started' },
      }),
      mutation => [mutation],
    ),
});

const finishJob = makeContractVersion(defineContract('finishJob'), {
  version: '1.0.0',
  models: { job },
  payload: { id: primitives.foreignKey({ abbreviation: 'job' }) },
  program: ({ payload, models }) =>
    Effect.map(
      models.job.update({
        resourceId: payload.id,
        attributes: { status: 'finished' },
      }),
      mutation => [mutation],
    ),
});

export const serviceMachine = makeService({
  name: 'serviceMachine',
  module: {
    '1.0.0': {
      models: { job },
      contracts: { startJob, finishJob },
    },
    '1.1.0': {
      models: { job },
      contracts: { startJob, finishJob },
    },
  },
});

const Idle = makeState({ stateName: 'idle', input: {} });
const Finishing = makeState({
  stateName: 'finishing',
  input: { jobId: makeAbbreviationIdSchema('job') },
});
export const finishStartedJob = makeMachine({
  source: serviceMachine.versions['1.1.0'],
  selections: {},
  contracts: {
    finishJob: {
      contract: finishJob,
      target: serviceMachine.versions['1.1.0'],
    },
  },
  states: { idle: Idle, finishing: Finishing },
  onBootstrap: () => Idle.make({}),
  routes: {
    idle: {
      onCommand: ({ command }) => {
        if (
          command.commandName !== 'startJob' ||
          command.execution.status !== 'succeeded'
        ) {
          return undefined;
        }
        const payload = Schema.decodeUnknownSync(
          Schema.fromJsonString(
            Schema.Struct({ id: makeAbbreviationIdSchema('job') }),
          ),
        )(command.payload);
        return Finishing.make({ jobId: payload.id });
      },
    },
    finishing: {
      command: ({ origin }) =>
        execute({
          binding: 'finishJob',
          payload: { id: origin.jobId },
        }),
      onResult: () => Idle.make({}),
    },
  },
});
