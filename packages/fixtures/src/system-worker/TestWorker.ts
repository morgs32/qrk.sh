/*
 * System-worker annotation:
 * Provides a small Worker entrypoint used by tests and local harnesses.
 * Keep it focused on test/runtime plumbing rather than production workflow behavior.
 */

import type { IAnyMachineDeclaration } from '@zerospin/core/machine/types';
import { makeMachineRepo } from 'system-worker/makeMachineRepo/makeMachineRepo';
import {
  aggregateMachineNamePattern,
  serviceMachineNamePattern,
} from 'system-worker/machineRepoNames';
import { systemWorkerAbbreviations } from 'system-worker/systemWorkerAbbreviations';

import config from './systems/system.ts';

const machines: Readonly<Record<string, IAnyMachineDeclaration>> = config.system.machines;
export const AggregateMachineRepo = makeMachineRepo({
  sourceKind: 'aggregate',
  namespaceBinding: 'AGGREGATE_MACHINE_REPO',
  namePattern: aggregateMachineNamePattern,
  abbreviation: systemWorkerAbbreviations.aggregateMachineRepo,
  managedRuntime: config.system.runtime,
  resolveMachine: key => {
    const machine = machines[key.machineName];
    if (machine === undefined || !('services' in machine.source) ||
      machine.source.name !== key.aggregateName) throw new Error(`Unknown aggregate machine ${key.machineName}`);
    return machine;
  },
});
export const ServiceMachineRepo = makeMachineRepo({
  sourceKind: 'service',
  namespaceBinding: 'SERVICE_MACHINE_REPO',
  namePattern: serviceMachineNamePattern,
  abbreviation: systemWorkerAbbreviations.serviceMachineRepo,
  managedRuntime: config.system.runtime,
  resolveMachine: key => {
    const machine = machines[key.machineName];
    if (machine === undefined || 'services' in machine.source ||
      machine.source.name !== key.serviceName) throw new Error(`Unknown service machine ${key.machineName}`);
    return machine;
  },
});

export { AggregateChain } from 'system-worker';
export { AggregateVersionRepo } from 'system-worker';
export { AggregateActorVersionRepo } from 'system-worker';
export { AggregateActorVersionChain } from 'system-worker';
export { AggregateVersionChain } from 'system-worker';
export { ServiceVersionChain } from 'system-worker';
export { SystemLogAgent } from 'system-worker';
export { SystemLogRepo } from 'system-worker';
export { ServiceVersionRepo } from 'system-worker';
export { ServiceChain } from 'system-worker';
export { ServiceActorVersionRepo } from 'system-worker';
export { ServiceActorVersionChain } from 'system-worker';
export { SystemRepo } from 'system-worker';
export { FixtureRepo } from './FixtureRepo.ts';
export { FixedDORepoFixture } from './FixedDORepoFixture.ts';
export { MigratableDORepoFixture } from './MigratableDORepoFixture.ts';

// eslint-disable-next-line no-default-export
export default {
  fetch() {
    return new Response('ok');
  },
};

export {
  OutboxSenderFixture,
  OutboxReceiverFixture,
} from './workerd/OutboxFixture.ts';
