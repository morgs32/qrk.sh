import type { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { ZerospinError } from '@zerospin/error';
import { encodeShape } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema } from 'effect';
import { isEqual } from 'es-toolkit';

const { system } = config;

/*
 * Frontend admission and read paths validate the submitted service lock
 * against authored definitions here. Supported current or historical definitions
 * must match exactly; the result carries the selected lock and frontend spec.
 *
 * 1. Canonicalize the submitted lock for diagnostics.
 * 2. Resolve the authored owner and frontend.
 * 3. Check the logical frontend identity.
 * 4. Require the exact frontend model key set.
 * 5. Resolve and compare every selected model definition.
 * 6. Compare the complete reconstructed lock.
 * 7. Return the selected frontend spec.
 */
export const validateServiceFrontendLock = Effect.fn(
  'StaticSystem.validateServiceFrontendLock',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  serviceFrontendLock: Schema.Schema.Type<typeof ServiceFrontendLockSchema>;
}) {
  const { frontendName, serviceFrontendLock, serviceName } = props;

  // 1 — derive the lock key used in unsupported-definition errors
  const serviceFrontendLockKey =
    yield* makeServiceFrontendLockKey(serviceFrontendLock);

  // 2 — reject missing service or frontendName definitions
  const service = system.services[serviceName]?.[props.serviceVersion];
  if (service === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend owner is unavailable in the active System',
      extra: {
        target: {
          serviceName,
          frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: `services.${serviceName}`,
        reason: 'owner-missing',
      },
    });
  }
  if (
    !isEqual(serviceFrontendLock.authentication, {
      authenticationJsonSchema: Schema.toJsonSchemaDocument(
        service.authentication.authenticationSchema,
      ),
    })
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'Frontend authentication declarations differ from the selected owner version',
    });
  }

  if (
    serviceFrontendLock.systemName !== system.name ||
    serviceFrontendLock.frontendName !== frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend lock belongs to another logical frontend',
      extra: {
        target: {
          serviceName,
          frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: 'lock.systemName|lock.frontendName',
        reason: 'target-mismatch',
      },
    });
  }

  const resolvedModels: Record<string, unknown> = {};
  const selectedSpecModels: Record<string, unknown> = {};
  for (const [modelKey, requestedModel] of Object.entries(
    serviceFrontendLock.models,
  )) {
    const model = service.models[modelKey];
    if (model === undefined) {
      return yield* new ZerospinError({
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model "${modelKey}" is unavailable`,
        extra: {
          target: {
            serviceName,
            frontendName,
          },
          serviceFrontendLockKey,
          definitionPath: `models.${modelKey}`,
          reason: 'definition-missing',
        },
      });
    }
    const definition =
      requestedModel.version === model.version ? model : undefined;
    if (definition === undefined) {
      return yield* new ZerospinError({
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} is unavailable`,
        extra: {
          target: {
            serviceName,
            frontendName,
          },
          serviceFrontendLockKey,
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
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} changed after publication`,
        extra: {
          target: {
            serviceName,
            frontendName,
          },
          serviceFrontendLockKey,
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

  // 6 — reject any remaining difference from the submitted lock
  const resolvedLock = {
    authentication: serviceFrontendLock.authentication,
    systemName: system.name,
    frontendName,
    models: resolvedModels,
  };
  if (!isEqual(resolvedLock, serviceFrontendLock)) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend lock does not match the running System definitions',
      extra: {
        target: {
          serviceName,
          frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: 'lock',
        reason: 'definition-mutated',
      },
    });
  }

  return {
    serviceFrontendLock: resolvedLock,
    frontendSpec: {
      kind: 'service' as const,
      systemName: system.name,
      serviceName,
      serviceVersion: props.serviceVersion,
      name: frontendName,
      models: selectedSpecModels,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      contracts: {},
      serviceFrontendLock: resolvedLock,
    },
  };
});
