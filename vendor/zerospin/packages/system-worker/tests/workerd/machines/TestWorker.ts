import { makeMachineRepo } from '../../../src/makeMachineRepo/makeMachineRepo.js';
import config from './MachineSystem.js';
import { aggregateMachineNamePattern, serviceMachineNamePattern } from '../../../src/machineRepoNames.js';
import { systemWorkerAbbreviations } from '../../../src/systemWorkerAbbreviations.js';

export { AggregateChain, AggregateVersionChain, AggregateVersionRepo, ServiceChain, ServiceVersionChain, ServiceVersionRepo, SystemRepo, SystemLogRepo, SystemLogAgent } from '../../../src/index.js';

export const AggregateMachineRepo: ReturnType<
  typeof makeMachineRepo<'/:systemId/:aggregateName/:aggregateId/:machineName', 'AGGREGATE_MACHINE_REPO'>
> = makeMachineRepo({
  sourceKind: 'aggregate',
  namespaceBinding: 'AGGREGATE_MACHINE_REPO',
  namePattern: aggregateMachineNamePattern,
  abbreviation: systemWorkerAbbreviations.aggregateMachineRepo,
  managedRuntime: config.system.runtime,
  resolveMachine: () => config.system.machines.aggregateWriter,
});

export const ServiceMachineRepo: ReturnType<
  typeof makeMachineRepo<'/:systemId/:serviceName/:machineName', 'SERVICE_MACHINE_REPO'>
> = makeMachineRepo({
  sourceKind: 'service',
  namespaceBinding: 'SERVICE_MACHINE_REPO',
  namePattern: serviceMachineNamePattern,
  abbreviation: systemWorkerAbbreviations.serviceMachineRepo,
  managedRuntime: config.system.runtime,
  resolveMachine: () => config.system.machines.observer,
});

// oxlint-disable-next-line import/no-default-export -- Wrangler Worker entrypoint.
export default { fetch: () => new Response('machine fixture') };
