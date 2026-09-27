import { makeAutomation } from '@zerospin/core/automation/makeAutomation';
import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { makeService } from '@zerospin/core/service/make/makeService';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';

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

const finishStartedJob = makeAutomation({
  name: 'finishStartedJob',
  on: startJob,
  contracts: { finishJob },
  program: Effect.fn('finishStartedJob')(function* ({ on, contracts }) {
    return contracts.finishJob({ id: on.payload.id });
  }),
});

export const serviceAutomation = makeService({
  name: 'serviceAutomation',
  module: {
    '1.0.0': {
      models: { job },
      contracts: { startJob, finishJob },
      automations: { finishStartedJob },
    },
    '1.1.0': {
      models: { job },
      contracts: { startJob, finishJob },
      automations: { finishStartedJob },
    },
  },
});
