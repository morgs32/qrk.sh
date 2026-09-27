import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeAggregateSessionLockKey } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLockKey';
import type { IAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import { getVersion } from '@zerospin/core/contracts/getVersion';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { encodeShape } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

const { system } = config;

type IAggregateSessionModel = IAggregateSessionLock['models'][string];
type IAggregateSessionContract = IAggregateSessionLock['contracts'][string];
type IAggregateSessionSpecModel = IAggregateSessionSpec['models'][string];
type IAggregateSessionSpecContract = IAggregateSessionSpec['contracts'][string];

/*
 * Session admission validates the submitted aggregate lock against authored
 * definitions here. Selected aggregate definitions must match exactly; the
 * result carries the selected lock and definition spec.
 *
 * 1. Canonicalize the submitted lock for diagnostics.
 * 2. Resolve the selected aggregate version.
 * 3. Check the logical definition identity.
 * 4. Accept a subset of aggregate models.
 * 5. Resolve and compare every selected model definition.
 * 6. Accept a subset of aggregate contracts.
 * 7. Resolve and compare each selected command definition.
 * 8. Compare the complete reconstructed lock.
 * 9. Return the selected definition spec.
 */
export const validateAggregateSessionLock = Effect.fn(
  'AggregateAccessApi.validateAggregateSessionLock',
)(function* (props: {
  aggregateName: string;
  aggregateVersion: string;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}): Effect.fn.Return<
  Readonly<{
    aggregateSessionLock: IAggregateSessionLock;
    sessionSpec: IAggregateSessionSpec;
  }>,
  IAnyError
> {
  const { aggregateSessionLock, aggregateName, sessionName, aggregateVersion } =
    props;

  // 1 — derive the lock key used in unsupported-definition errors
  const aggregateSessionLockKey =
    yield* makeAggregateSessionLockKey(aggregateSessionLock);

  // 2 — reject missing aggregate versions
  const aggregate = system.aggregates[aggregateName]?.[aggregateVersion];
  if (aggregate === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-lock-unsupported',
        message:
          'The requested aggregate definition owner is unavailable in the active System',
        extra: {
          target: {
            aggregateName,
            sessionName,
          },
          aggregateSessionLockKey,
          definitionPath: `aggregates.${aggregateName}`,
          reason: 'owner-missing',
        },
      }),
    );
  }

  const actor = yield* resolveAggregateActorVersion(
    { [aggregate.version]: aggregate },
    aggregateSessionLock,
  );

  if (
    actor.authentication !== 'none' &&
    (actor.authentication?.credentialsSchema === undefined ||
      actor.authentication.authenticate === undefined)
  ) {
    return yield* Effect.fail(
      makeZerospinError('actor-session-binding-forbidden'),
    );
  }
  if (
    !isEqual(aggregateSessionLock.claims, {
      claimsJsonSchema: Schema.toJsonSchemaDocument(
        actor.identity.claimsSchema,
      ),
    })
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-lock-unsupported',
        message:
          'Session claims declarations differ from the selected owner version',
      }),
    );
  }

  // 3 — compare the requested definition identity
  if (aggregateSessionLock.sessionName !== sessionName) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-lock-unsupported',
        message:
          'The requested aggregate definition lock belongs to another logical definition',
        extra: {
          target: {
            aggregateName,
            sessionName,
          },
          aggregateSessionLockKey,
          definitionPath: 'lock.sessionName',
          reason: 'target-mismatch',
        },
      }),
    );
  }

  // 4 — collect the exact selected model definitions
  const resolvedModels: Record<string, IAggregateSessionModel> = {};
  const selectedSpecModels: Record<string, IAggregateSessionSpecModel> = {};
  // 5 — match exact version, encoded primitive descriptors, abbreviation, and sorted indexes
  for (const [modelKey, requestedModel] of Object.entries(
    aggregateSessionLock.models,
  )) {
    // Schema availability supports programs; only the selection filters expose rows.
    const model = aggregate.models[modelKey];
    if (model === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-lock-unsupported',
          message: `Session model "${modelKey}" is unavailable`,
          extra: {
            target: {
              aggregateName,
              sessionName,
            },
            aggregateSessionLockKey,
            definitionPath: `models.${modelKey}`,
            reason: 'definition-missing',
          },
        }),
      );
    }
    const definition =
      requestedModel.version === model.version ? model : undefined;
    if (definition === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-lock-unsupported',
          message: `Session model ${modelKey}@${requestedModel.version} is unavailable`,
          extra: {
            target: {
              aggregateName,
              sessionName,
            },
            aggregateSessionLockKey,
            definitionPath: `models.${modelKey}@${requestedModel.version}`,
            reason: 'definition-missing',
          },
        }),
      );
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
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-lock-unsupported',
          message: `Session model ${modelKey}@${requestedModel.version} changed after publication`,
          extra: {
            target: {
              aggregateName,
              sessionName,
            },
            aggregateSessionLockKey,
            definitionPath: `models.${modelKey}@${requestedModel.version}`,
            reason: 'definition-mutated',
          },
        }),
      );
    }
    resolvedModels[modelKey] = requestedModel;
    selectedSpecModels[modelKey] = requestedModel;
  }

  // 6 — resolve selected names from actor.contracts
  const resolvedContracts: Record<string, IAggregateSessionContract> = {};
  const selectedSpecContracts: Record<string, IAggregateSessionSpecContract> =
    {};
  const contracts = actor.contracts;
  // 7 — match commandName, version, and payload encoded primitive descriptors
  for (const [contractKey, requestedContract] of Object.entries(
    aggregateSessionLock.contracts,
  )) {
    const contract = contracts[contractKey];
    const selectedContract =
      contract === undefined
        ? undefined
        : yield* getVersion(contract, requestedContract.version);
    const definition = selectedContract?.spec;
    if (contract === undefined || definition === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-lock-unsupported',
          message: `Session contract ${contractKey}@${requestedContract.version} is unavailable`,
          extra: {
            target: {
              aggregateName,
              sessionName,
            },
            aggregateSessionLockKey,
            definitionPath: `contracts.${contractKey}@${requestedContract.version}`,
            reason: 'definition-missing',
          },
        }),
      );
    }
    const resolvedContract = {
      commandName: contract.commandName,
      version: definition.version,
      payloadShape: definition.payloadShape,
      failureJsonSchema: definition.failureJsonSchema,
    };
    if (!isEqual(resolvedContract, requestedContract)) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'aggregate-session-lock-unsupported',
          message: `Session contract ${contractKey}@${requestedContract.version} changed after publication`,
          extra: {
            target: {
              aggregateName,
              sessionName,
            },
            aggregateSessionLockKey,
            definitionPath: `contracts.${contractKey}@${requestedContract.version}`,
            reason: 'definition-mutated',
          },
        }),
      );
    }
    for (const { modelName } of Object.values(definition.models)) {
      if (!Object.hasOwn(aggregateSessionLock.models, modelName)) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'aggregate-session-lock-unsupported',
            message: `Contract ${contractKey} requires selected model ${modelName}`,
            extra: {
              aggregateSessionLockKey,
              definitionPath: `contracts.${contractKey}.models.${modelName}`,
              reason: 'mutation-model-missing',
            },
          }),
        );
      }
    }
    resolvedContracts[contractKey] = requestedContract;
    selectedSpecContracts[contractKey] = {
      ...requestedContract,
      models: definition.models,
    };
  }

  // 8 — reject any remaining difference from the submitted lock
  const resolvedLock = {
    actorName: actor.name,
    actorVersion: actor.version,
    claims: aggregateSessionLock.claims,
    sessionName,
    models: resolvedModels,
    contracts: resolvedContracts,
  };
  if (!isEqual(resolvedLock, aggregateSessionLock)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'aggregate-session-lock-unsupported',
        message:
          'The requested aggregate definition lock does not match the running System definitions',
        extra: {
          target: {
            aggregateName,
            sessionName,
          },
          aggregateSessionLockKey,
          definitionPath: 'lock',
          reason: 'definition-mutated',
        },
      }),
    );
  }

  // 9 — replace model and contract definitions with the checked selections
  return {
    aggregateSessionLock: resolvedLock,
    sessionSpec: {
      kind: 'aggregate',
      aggregateName,
      aggregateVersion,
      actorName: actor.name,
      actorVersion: actor.version,
      sessionName,
      models: selectedSpecModels,
      contracts: selectedSpecContracts,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      aggregateSessionLock: resolvedLock,
    },
  };
});
