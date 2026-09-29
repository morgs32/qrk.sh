import type { IAnyMachineDeclaration } from '@zerospin/core/machine/types';
import { makeMachineRepo } from 'system-worker/makeMachineRepo/makeMachineRepo';
import config from 'config';
import {
  aggregateMachineNamePattern,
  serviceMachineNamePattern,
} from 'system-worker/machineRepoNames';
import { systemWorkerAbbreviations } from 'system-worker/systemWorkerAbbreviations';

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
      machine.source.name !== key.aggregateName) {
      throw new Error(`Unknown aggregate machine ${key.machineName}`);
    }
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
      machine.source.name !== key.serviceName) {
      throw new Error(`Unknown service machine ${key.machineName}`);
    }
    return machine;
  },
});
