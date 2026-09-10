import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { makeAggregateFrontendLockKey } from '@zerospin/core/frontendController/makeAggregateFrontendLockKey';
import { ZerospinError } from '@zerospin/error';
import { encodeShape } from '@zerospin/schema';
import { Effect, type Schema } from 'effect';
import { isEqual } from 'es-toolkit';
import { system } from 'system';

/*
 * Frontend admission and read paths validate the submitted aggregate lock
 * against authored definitions here. Selected aggregate definitions
 * must match exactly; the result carries the selected lock and frontend spec.
 *
 * 1. Canonicalize the submitted lock for diagnostics.
 * 2. Resolve the selected aggregate version.
 * 3. Check the logical frontend identity.
 * 4. Accept a subset of aggregate models.
 * 5. Resolve and compare every selected model definition.
 * 6. Accept a subset of aggregate contracts.
 * 7. Resolve and compare each selected command definition.
 * 8. Compare the complete reconstructed lock.
 * 9. Return the selected frontend spec.
 */
export const validateAggregateFrontendLock = Effect.fn(
  'StaticSystem.validateAggregateFrontendLock',
)(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  frontendName: string;
  aggregateFrontendLock: Schema.Schema.Type<typeof AggregateFrontendLockSchema>;
}) {
  const { aggregateFrontendLock, aggregateName, frontendName } = props;

  // 1 — derive the lock key used in unsupported-definition errors
  const aggregateFrontendLockKey = yield* makeAggregateFrontendLockKey(
    aggregateFrontendLock,
  );

  // 2 — reject missing aggregate versions
  const aggregate = system.aggregates[aggregateName]?.[props.aggregateVersion];
  if (aggregate === undefined) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend owner is unavailable in the active System',
      extra: {
        target: {
          aggregateName,
          frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: `aggregates.${aggregateName}`,
        reason: 'owner-missing',
      },
    });
  }

  // 3 — compare the requested system and frontend identity
  if (
    aggregateFrontendLock.systemName !== system.name ||
    aggregateFrontendLock.frontendName !== frontendName
  ) {
    return yield* new ZerospinError({
      code: 'aggregate-frontend-lock-unsupported',
      message:
        'The requested aggregate frontend lock belongs to another logical frontend',
      extra: {
        target: {
          aggregateName,
          frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock.systemName|lock.frontendName',
        reason: 'target-mismatch',
      },
    });
  }

  // 4 — collect the exact selected model definitions
  const resolvedModels: Record<string, unknown> = {};
  const selectedSpecModels: Record<string, unknown> = {};
  // 5 — match exact version, encoded primitive descriptors, abbreviation, and sorted indexes
  for (const [modelKey, requestedModel] of Object.entries(
    aggregateFrontendLock.models,
  )) {
    const model = aggregate.models[modelKey];
    if (model === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend model "${modelKey}" is unavailable`,
        extra: {
          target: {
            aggregateName,
            frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `models.${modelKey}`,
          reason: 'definition-missing',
        },
      });
    }
    const definition =
      requestedModel.version === model.version ? model : undefined;
    if (definition === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} is unavailable`,
        extra: {
          target: {
            aggregateName,
            frontendName,
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
      propertiesShape: encodeShape(definition.propertiesShape),
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
            aggregateName,
            frontendName,
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
      properties: resolvedModel.propertiesShape,
      indexes: definition.indexes,
    };
  }

  // 6 — resolve selected names from aggregate.contracts
  const resolvedContracts: Record<string, unknown> = {};
  const selectedSpecContracts: Record<string, unknown> = {};
  const contracts = aggregate.contracts;
  // 7 — match commandName, version, and payload encoded primitive descriptors
  for (const [contractKey, requestedContract] of Object.entries(
    aggregateFrontendLock.contracts,
  )) {
    const contract = contracts[contractKey]?.contract;
    const definition =
      contract?.version === requestedContract.version
        ? contract.spec
        : undefined;
    if (contract === undefined || definition === undefined) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend contract ${contractKey}@${requestedContract.version} is unavailable`,
        extra: {
          target: {
            aggregateName,
            frontendName,
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
      payloadShape: definition.payloadShape,
    };
    if (!isEqual(resolvedContract, requestedContract)) {
      return yield* new ZerospinError({
        code: 'aggregate-frontend-lock-unsupported',
        message: `Frontend contract ${contractKey}@${requestedContract.version} changed after publication`,
        extra: {
          target: {
            aggregateName,
            frontendName,
          },
          aggregateFrontendLockKey,
          definitionPath: `contracts.${contractKey}@${requestedContract.version}`,
          reason: 'definition-mutated',
        },
      });
    }
    for (const { modelName } of Object.values(definition.models)) {
      if (!Object.hasOwn(aggregateFrontendLock.models, modelName)) {
        return yield* new ZerospinError({
          code: 'aggregate-frontend-lock-unsupported',
          message: `Contract ${contractKey} requires selected model ${modelName}`,
          extra: {
            aggregateFrontendLockKey,
            definitionPath: `contracts.${contractKey}.models.${modelName}`,
            reason: 'mutation-model-missing',
          },
        });
      }
    }
    resolvedContracts[contractKey] = resolvedContract;
    selectedSpecContracts[contractKey] = {
      ...resolvedContract,
      models: definition.models,
    };
  }

  // 8 — reject any remaining difference from the submitted lock
  const resolvedLock = {
    systemName: system.name,
    frontendName,
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
          aggregateName,
          frontendName,
        },
        aggregateFrontendLockKey,
        definitionPath: 'lock',
        reason: 'definition-mutated',
      },
    });
  }

  // 9 — replace model and contract definitions with the checked selections
  return {
    aggregateFrontendLock: resolvedLock,
    frontendSpec: {
      kind: 'aggregate',
      systemName: system.name,
      aggregateName,
      aggregateVersion: props.aggregateVersion,
      name: frontendName,
      models: selectedSpecModels,
      contracts: selectedSpecContracts,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      aggregateFrontendLock: resolvedLock,
    },
  };
});
