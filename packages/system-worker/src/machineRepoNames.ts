import { RoutePattern } from '@remix-run/route-pattern';
import { env } from 'cloudflare:workers';
import { Effect } from 'effect';

import { makeRepoNameUtils } from './makeDORepo/makeRepoNameUtils.js';
import { systemWorkerAbbreviations } from './systemWorkerAbbreviations.js';

export const aggregateMachineNamePattern = RoutePattern.parse(
  '/:systemId/:aggregateName/:aggregateId/:machineName',
);
export const serviceMachineNamePattern = RoutePattern.parse(
  '/:systemId/:serviceName/:machineName',
);
export const aggregateMachineNameUtils = makeRepoNameUtils({
  abbreviation: systemWorkerAbbreviations.aggregateMachineRepo,
  namePattern: aggregateMachineNamePattern,
});
export const serviceMachineNameUtils = makeRepoNameUtils({
  abbreviation: systemWorkerAbbreviations.serviceMachineRepo,
  namePattern: serviceMachineNamePattern,
});

export const getAggregateMachineRepo = Effect.fn('getAggregateMachineRepo')(
  function* (props: {
    key: Parameters<typeof aggregateMachineNameUtils.makeName>[0];
  }) {
    const name = yield* aggregateMachineNameUtils.makeName(props.key);
    return env.AGGREGATE_MACHINE_REPO.getByName(name);
  },
);

export const getServiceMachineRepo = Effect.fn('getServiceMachineRepo')(
  function* (props: {
    key: Parameters<typeof serviceMachineNameUtils.makeName>[0];
  }) {
    const name = yield* serviceMachineNameUtils.makeName(props.key);
    return env.SERVICE_MACHINE_REPO.getByName(name);
  },
);
