import { makeServiceSessionLock } from './makeServiceSessionLock.ts';
import type { IServiceSessionDefinition } from '../types.ts';

export function makeServiceSessionSpec(
  definition: Omit<IServiceSessionDefinition, 'systemName'>,
) {
  const serviceSessionLock = makeServiceSessionLock(definition);
  const modelNames: readonly string[] = definition.modelNames.toSorted();

  return {
    kind: 'service' as const,
    actorName: definition.actorName,
    actorVersion: definition.actorVersion,
    serviceName: definition.serviceName,
    serviceVersion: definition.serviceVersion,
    sessionName: definition.sessionName,
    modelNames,
    models: serviceSessionLock.models,
    contracts: {},
    serviceSessionLock,
  };
}

export type IServiceSessionSpec = ReturnType<typeof makeServiceSessionSpec>;
