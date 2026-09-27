import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { makeServiceSessionLockKey } from '@zerospin/core/serviceSession/make/makeServiceSessionLockKey';
import type { IServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { encodeShape } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

const { system } = config;

type IServiceSessionModel = IServiceSessionLock['models'][string];
type IServiceSessionSpecModel = IServiceSessionSpec['models'][string];

/*
 * Session admission validates the submitted service lock against authored
 * definitions here. Supported definitions must match exactly; the result
 * carries the selected lock and definition spec.
 *
 * 1. Canonicalize the submitted lock for diagnostics.
 * 2. Resolve the authored owner and definition.
 * 3. Check the logical definition identity.
 * 4. Require the exact definition model key set.
 * 5. Resolve and compare every selected model definition.
 * 6. Compare the complete reconstructed lock.
 * 7. Return the selected definition spec.
 */
export const validateServiceSessionLock = Effect.fn(
  'ServiceAccessApi.validateServiceSessionLock',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}): Effect.fn.Return<
  Readonly<{
    serviceSessionLock: IServiceSessionLock;
    sessionSpec: IServiceSessionSpec;
  }>,
  IAnyError
> {
  const { sessionName, serviceSessionLock, serviceName, serviceVersion } =
    props;

  // 1 — derive the lock key used in unsupported-definition errors
  const serviceSessionLockKey =
    yield* makeServiceSessionLockKey(serviceSessionLock);

  // 2 — reject missing service or sessionName definitions
  const service = system.services[serviceName]?.[serviceVersion];
  if (service === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message:
          'The requested service definition owner is unavailable in the active System',
        extra: {
          target: {
            serviceName,
            sessionName,
          },
          serviceSessionLockKey,
          definitionPath: `services.${serviceName}`,
          reason: 'owner-missing',
        },
      }),
    );
  }
  const actor = yield* resolveServiceActorVersion(
    { [service.version]: service },
    serviceSessionLock,
  );
  if (
    !isEqual(serviceSessionLock.identity, {
      identityJsonSchema: Schema.toJsonSchemaDocument(
        actor.identity.identitySchema,
      ),
    })
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message:
          'Session identity declarations differ from the selected owner version',
      }),
    );
  }

  if (serviceSessionLock.sessionName !== sessionName) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message:
          'The requested service definition lock belongs to another logical definition',
        extra: {
          target: {
            serviceName,
            sessionName,
          },
          serviceSessionLockKey,
          definitionPath: 'lock.sessionName',
          reason: 'target-mismatch',
        },
      }),
    );
  }

  const resolvedModels: Record<string, IServiceSessionModel> = {};
  const selectedSpecModels: Record<string, IServiceSessionSpecModel> = {};
  for (const [modelKey, requestedModel] of Object.entries(
    serviceSessionLock.models,
  )) {
    const model = actor.selections[modelKey]?.model;
    if (model === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'service-session-lock-unsupported',
          message: `Session model "${modelKey}" is unavailable`,
          extra: {
            target: {
              serviceName,
              sessionName,
            },
            serviceSessionLockKey,
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
          code: 'service-session-lock-unsupported',
          message: `Session model ${modelKey}@${requestedModel.version} is unavailable`,
          extra: {
            target: {
              serviceName,
              sessionName,
            },
            serviceSessionLockKey,
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
          code: 'service-session-lock-unsupported',
          message: `Session model ${modelKey}@${requestedModel.version} changed after publication`,
          extra: {
            target: {
              serviceName,
              sessionName,
            },
            serviceSessionLockKey,
            definitionPath: `models.${modelKey}@${requestedModel.version}`,
            reason: 'definition-mutated',
          },
        }),
      );
    }
    resolvedModels[modelKey] = requestedModel;
    selectedSpecModels[modelKey] = requestedModel;
  }

  // 6 — reject any remaining difference from the submitted lock
  const resolvedLock = {
    actorName: actor.name,
    actorVersion: actor.version,
    identity: serviceSessionLock.identity,
    sessionName,
    models: resolvedModels,
  };
  if (!isEqual(resolvedLock, serviceSessionLock)) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'service-session-lock-unsupported',
        message:
          'The requested service definition lock does not match the running System definitions',
        extra: {
          target: {
            serviceName,
            sessionName,
          },
          serviceSessionLockKey,
          definitionPath: 'lock',
          reason: 'definition-mutated',
        },
      }),
    );
  }

  return {
    serviceSessionLock: resolvedLock,
    sessionSpec: {
      kind: 'service' as const,
      actorName: actor.name,
      actorVersion: actor.version,
      serviceName,
      serviceVersion,
      sessionName,
      models: selectedSpecModels,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      contracts: {},
      serviceSessionLock: resolvedLock,
    },
  };
});
