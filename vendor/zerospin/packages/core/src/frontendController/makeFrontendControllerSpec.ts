import { encodeShape } from '@zerospin/schema';
import { mapValues } from 'es-toolkit';

import type {
  IAggregateFrontendController,
  IAnyFrontendController,
  IFrontendControllerSpec,
  IServiceFrontendController,
} from './types.ts';

export function makeFrontendControllerSpec(
  frontendController: IAggregateFrontendController,
): Extract<IFrontendControllerSpec, { kind: 'aggregate' }>;
export function makeFrontendControllerSpec(
  frontendController: IServiceFrontendController,
): Extract<IFrontendControllerSpec, { kind: 'service' }>;
export function makeFrontendControllerSpec(
  frontendController: IAnyFrontendController,
): IFrontendControllerSpec;
export function makeFrontendControllerSpec(
  frontendController: IAnyFrontendController,
): IFrontendControllerSpec {
  const models = mapValues(frontendController.models, model => ({
    modelName: model.modelName,
    abbreviation: model.abbreviation,
    version: model.version,
    properties: encodeShape(model.propertiesShape),
    indexes: model.indexes.toSorted((left, right) =>
      left.name.localeCompare(right.name),
    ),
    historicalDefinitions: model.historicalDefinitions
      .toSorted((left, right) => left.version.localeCompare(right.version))
      .map(definition => ({
        modelName: definition.modelName,
        abbreviation: definition.abbreviation,
        version: definition.version,
        hasDirectAdapter: typeof definition.adaptResource === 'function',
        properties: encodeShape(definition.propertiesShape),
        indexes: definition.indexes.toSorted((left, right) =>
          left.name.localeCompare(right.name),
        ),
      })),
  }));
  const lockedModels = mapValues(frontendController.models, model => ({
    modelName: model.modelName,
    abbreviation: model.abbreviation,
    version: model.version,
    propertiesJsonSchema: model.spec.propertiesJsonSchema,
    indexes: model.indexes
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(index => ({
        name: index.name,
        columns: [...index.columns],
        unique: index.unique ?? false,
      })),
  }));
  if (frontendController.kind === 'service') {
    return {
      kind: 'service',
      systemName: frontendController.systemName,
      serviceName: frontendController.serviceName,
      frontendName: frontendController.frontendName,
      modelNames: frontendController.modelNames.toSorted(),
      models,
      contracts: {},
      serviceFrontendLock: {
        systemName: frontendController.systemName,
        frontendName: frontendController.frontendName,
        models: lockedModels,
      },
    };
  }

  const contracts = mapValues(frontendController.contracts, contract => ({
    ...contract.spec,
    historicalDefinitions: contract.spec.historicalDefinitions.map(
      definition => ({
        ...definition,
        hasDirectAdapter: contract.historicalDefinitions.some(
          historicalDefinition =>
            historicalDefinition.version === definition.version &&
            typeof historicalDefinition.adaptPayload === 'function',
        ),
      }),
    ),
  }));

  return {
    kind: 'aggregate',
    systemName: frontendController.systemName,
    aggregateName: frontendController.aggregateName,
    frontendName: frontendController.frontendName,
    modelNames: frontendController.modelNames.toSorted(),
    models,
    contracts,
    aggregateFrontendLock: {
      systemName: frontendController.systemName,
      frontendName: frontendController.frontendName,
      models: lockedModels,
      contracts: mapValues(frontendController.contracts, contract => ({
        commandName: contract.commandName,
        version: contract.version,
        payloadJsonSchema: contract.spec.payloadJsonSchema,
      })),
    },
  };
}
