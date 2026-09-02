import type { IContracts } from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { ZerospinError } from '@zerospin/error';
import { descriptorToJsonEffectSchema, encodeShape } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';
import { system } from 'system';

export const validateAggregateFrontendLock = Effect.fn(
  'StaticSystem.validateAggregateFrontendLock',
)(function* (props: {
  aggregateName: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}) {
  const { aggregateFrontendLock, aggregateName, frontendName } = props;
  const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
    aggregateFrontendLock,
  );
  const aggregate = system.aggregates[aggregateName];
  if (aggregate === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend owner is unavailable in the active System',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: `aggregates.${aggregateName}`,
        reason: 'owner-missing',
      },
    });
  }
  const frontendBinding = aggregate.frontends[frontendName];
  if (frontendBinding === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend is unavailable in the active System',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: `aggregates.${aggregateName}.frontends.${frontendName}`,
        reason: 'frontend-missing',
      },
    });
  }
  const controller = frontendBinding.controller;
  if (
    controller.kind !== 'aggregate' ||
    aggregateFrontendLock.systemName !== controller.systemName ||
    aggregateFrontendLock.frontendName !== controller.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend lock belongs to another logical frontend',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock.systemName|lock.frontendName',
        reason: 'target-mismatch',
      },
    });
  }
  const resolvedModels: Record<string, unknown> = {};
  const selectedSpecModels: Record<string, unknown> = {};
  if (
    !isEqual(
      Object.keys(aggregateFrontendLock.models).toSorted(),
      Object.keys(controller.models).toSorted(),
    )
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message: 'The requested frontend model key set is unavailable',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock.models',
        reason: 'selection-key-set-mismatch',
      },
    });
  }
  for (const [modelKey, requestedModel] of Object.entries(
    aggregateFrontendLock.models,
  )) {
    const model = controller.models[modelKey];
    if (model === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend model "${modelKey}" is unavailable`,
        extra: {
          target: {
            aggregateName: aggregateName,
            frontendName: frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `models.${modelKey}`,
          reason: 'definition-missing',
        },
      });
    }
    const definition =
      requestedModel.version === model.version
        ? model
        : model.historicalDefinitions.find(
            historicalDefinition =>
              historicalDefinition.version === requestedModel.version,
          );
    if (definition === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} is unavailable`,
        extra: {
          target: {
            aggregateName: aggregateName,
            frontendName: frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `models.${modelKey}@${requestedModel.version}`,
          reason: 'definition-missing',
        },
      });
    }
    const resolvedModel = {
      modelName: model.modelName,
      abbreviation: model.abbreviation,
      version: definition.version,
      propertiesJsonSchema: Schema.toJsonSchemaDocument(
        Schema.Struct(
          mapValues(definition.propertiesShape, descriptor =>
            descriptorToJsonEffectSchema(descriptor),
          ),
        ),
      ),
      indexes: definition.indexes
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map(index => ({
          name: index.name,
          columns: [...index.columns],
          unique: index.unique ?? false,
        })),
    };
    if (!isEqual(resolvedModel, requestedModel)) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} changed after publication`,
        extra: {
          target: {
            aggregateName: aggregateName,
            frontendName: frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `models.${modelKey}@${requestedModel.version}`,
          reason: 'definition-mutated',
        },
      });
    }
    resolvedModels[modelKey] = resolvedModel;
    selectedSpecModels[modelKey] = {
      modelName: model.modelName,
      abbreviation: model.abbreviation,
      version: definition.version,
      properties: encodeShape(definition.propertiesShape),
      indexes: definition.indexes,
      historicalDefinitions: [],
    };
  }

  const resolvedContracts: Record<string, unknown> = {};
  const selectedSpecContracts: Record<string, unknown> = {};
  const contracts: IContracts = controller.contracts;
  if (
    !isEqual(
      Object.keys(aggregateFrontendLock.contracts).toSorted(),
      Object.keys(contracts).toSorted(),
    )
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message: 'The requested frontend contract key set is unavailable',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock.contracts',
        reason: 'selection-key-set-mismatch',
      },
    });
  }
  for (const [contractKey, requestedContract] of Object.entries(
    aggregateFrontendLock.contracts,
  )) {
    const contract = contracts[contractKey];
    const definition =
      contract === undefined
        ? undefined
        : requestedContract.version === contract.version
          ? contract.spec
          : contract.spec.historicalDefinitions.find(
              historicalDefinition =>
                historicalDefinition.version === requestedContract.version,
            );
    if (contract === undefined || definition === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend contract ${contractKey}@${requestedContract.version} is unavailable`,
        extra: {
          target: {
            aggregateName: aggregateName,
            frontendName: frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `contracts.${contractKey}@${requestedContract.version}`,
          reason: 'definition-missing',
        },
      });
    }
    const resolvedContract = {
      commandName: contract.commandName,
      version: definition.version,
      payloadJsonSchema: definition.payloadJsonSchema,
    };
    if (!isEqual(resolvedContract, requestedContract)) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend contract ${contractKey}@${requestedContract.version} changed after publication`,
        extra: {
          target: {
            aggregateName: aggregateName,
            frontendName: frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `contracts.${contractKey}@${requestedContract.version}`,
          reason: 'definition-mutated',
        },
      });
    }
    resolvedContracts[contractKey] = resolvedContract;
    selectedSpecContracts[contractKey] = {
      ...resolvedContract,
      historicalDefinitions: [],
    };
  }

  const resolvedLock = {
    systemName: controller.systemName,
    frontendName: controller.frontendName,
    models: resolvedModels,
    contracts: resolvedContracts,
  };
  if (!isEqual(resolvedLock, aggregateFrontendLock)) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend lock does not match the running System definitions',
      extra: {
        target: {
          aggregateName: aggregateName,
          frontendName: frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock',
        reason: 'definition-mutated',
      },
    });
  }
  const currentSpec = makeFrontendControllerSpec(controller);
  return {
    aggregateFrontendLock: resolvedLock,
    frontendSpec: {
      ...currentSpec,
      models: selectedSpecModels,
      contracts: selectedSpecContracts,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      aggregateFrontendLock: resolvedLock,
    },
  };
});
