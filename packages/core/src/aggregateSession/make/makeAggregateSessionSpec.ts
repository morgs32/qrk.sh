import { mapValues } from 'es-toolkit';

import { makeAggregateSessionLock } from './makeAggregateSessionLock.ts';
import type { IAggregateSessionDefinition } from '../types.ts';

export function makeAggregateSessionSpec(
  definition: Omit<IAggregateSessionDefinition, 'systemName'>,
) {
  const aggregateSessionLock = makeAggregateSessionLock(definition);
  const modelNames: readonly string[] = definition.modelNames.toSorted();
  const contracts = mapValues(definition.contracts, binding => {
    const { contract } = binding;
    return {
      commandName: contract.spec.commandName,
      version: contract.spec.version,
      payloadShape: structuredClone(contract.spec.payloadShape),
      failureJsonSchema: structuredClone(contract.spec.failureJsonSchema),
      models: structuredClone(contract.spec.models),
    };
  });

  return {
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    kind: 'aggregate' as const,
    aggregateName: definition.aggregateName,
    sessionName: definition.sessionName,
    aggregateVersion: definition.aggregateVersion,
    modelNames,
    models: aggregateSessionLock.models,
    contracts,
    aggregateSessionLock,
  };
}

export type IAggregateSessionSpec = ReturnType<typeof makeAggregateSessionSpec>;
