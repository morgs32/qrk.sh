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
    properties: structuredClone(model.spec.propertiesShape),
    indexes: model.indexes
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(index => ({
        ...index,
        columns: [...index.columns],
      })),
  }));
  const lockedModels = mapValues(frontendController.models, model => ({
    modelName: model.modelName,
    abbreviation: model.abbreviation,
    version: model.version,
    propertiesShape: structuredClone(model.spec.propertiesShape),
    indexes: model.indexes
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(index => ({
        name: index.name,
        columns: [...index.columns],
        unique: index.unique ?? false,
      })),
  }));
  if (frontendController.kind === 'service') {
    const spec: Extract<IFrontendControllerSpec, { kind: 'service' }> = {
      kind: 'service',
      systemName: frontendController.systemName,
      serviceName: frontendController.serviceName,
      serviceVersion: frontendController.serviceVersion,
      name: frontendController.name,
      modelNames: frontendController.modelNames.toSorted(),
      models,
      contracts: {},
      serviceFrontendLock: {
        systemName: frontendController.systemName,
        frontendName: frontendController.name,
        models: lockedModels,
      },
    };

    return spec;
  }

  const contracts = mapValues(frontendController.contracts, binding => {
    const { contract } = binding;
    return {
      commandName: contract.spec.commandName,
      version: contract.spec.version,
      payloadShape: structuredClone(contract.spec.payloadShape),
      models: structuredClone(contract.spec.models),
    };
  });

  const spec: Extract<IFrontendControllerSpec, { kind: 'aggregate' }> = {
    kind: 'aggregate',
    systemName: frontendController.systemName,
    aggregateName: frontendController.aggregateName,
    name: frontendController.name,
    aggregateVersion: frontendController.aggregateVersion,
    modelNames: frontendController.modelNames.toSorted(),
    models,
    contracts,
    aggregateFrontendLock: {
      systemName: frontendController.systemName,
      frontendName: frontendController.name,
      models: lockedModels,
      contracts: mapValues(frontendController.contracts, binding => {
        const { contract } = binding;
        return {
          commandName: contract.commandName,
          version: contract.version,
          payloadShape: structuredClone(contract.spec.payloadShape),
        };
      }),
    },
  };

  return spec;
}
