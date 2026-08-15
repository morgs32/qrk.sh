import { makeFrontendControllerSpec } from '@zerospin/core/frontendController/makeFrontendControllerSpec';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { makeServiceFrontendLockKey } from '@zerospin/core/frontendController/makeServiceFrontendLockKey';
import { encodeShape } from '@zerospin/core/models/encodeShape';
import { descriptorToJsonEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, JSONSchema, Schema } from 'effect';
import { isEqual, mapValues } from 'es-toolkit';
import { system } from 'system';

export const validateServiceFrontendLock = Effect.fn(
  'StaticSystem.validateServiceFrontendLock',
)(function* (props: {
  serviceName: string;
  frontendName: string;
  serviceFrontendLock: unknown;
}) {
  const serviceFrontendLock = yield* Schema.decodeUnknown(
    ServiceFrontendLockSchema,
  )(props.serviceFrontendLock, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'service-frontend-lock-invalid',
      prefix: 'Failed to decode the requested service frontend lock',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey: null,
        definitionPath: 'lock',
        reason: 'malformed',
      },
    }),
  );
  const serviceFrontendLockKey =
    yield* makeServiceFrontendLockKey(serviceFrontendLock);
  const service = system.services[props.serviceName];
  if (service === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend owner is unavailable in the active System',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: `services.${props.serviceName}`,
        reason: 'owner-missing',
      },
    });
  }
  const frontendBinding = service.frontends[props.frontendName];
  if (frontendBinding === undefined) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend is unavailable in the active System',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: `services.${props.serviceName}.frontends.${props.frontendName}`,
        reason: 'frontend-missing',
      },
    });
  }
  const controller = frontendBinding.controller;
  if (
    controller.kind !== 'service' ||
    serviceFrontendLock.systemName !== controller.systemName ||
    serviceFrontendLock.frontendName !== controller.frontendName
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend lock belongs to another logical frontend',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: 'lock.systemName|lock.frontendName',
        reason: 'target-mismatch',
      },
    });
  }
  const resolvedModels: Record<string, unknown> = {};
  const selectedSpecModels: Record<string, unknown> = {};
  if (
    !isEqual(
      Object.keys(serviceFrontendLock.models).toSorted(),
      Object.keys(controller.models).toSorted(),
    )
  ) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message: 'The requested frontend model key set is unavailable',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: 'lock.models',
        reason: 'selection-key-set-mismatch',
      },
    });
  }
  for (const [modelKey, requestedModel] of Object.entries(
    serviceFrontendLock.models,
  )) {
    const model = controller.models[modelKey];
    if (model === undefined) {
      return yield* new ZerospinError({
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model "${modelKey}" is unavailable`,
        extra: {
          target: {
            serviceName: props.serviceName,
            frontendName: props.frontendName,
          },
          serviceFrontendLockKey,
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
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} is unavailable`,
        extra: {
          target: {
            serviceName: props.serviceName,
            frontendName: props.frontendName,
          },
          serviceFrontendLockKey,
          definitionPath: `models.${modelKey}@${requestedModel.version}`,
          reason: 'definition-missing',
        },
      });
    }
    const propertiesShape = {
      ...model.metadata,
      ...definition.attributes,
    };
    const resolvedModel = {
      modelName: model.modelName,
      abbreviation: model.abbreviation,
      version: definition.version,
      propertiesJsonSchema: JSONSchema.make(
        Schema.Struct(
          mapValues(propertiesShape, descriptor =>
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
        code: 'service-frontend-lock-unsupported',
        message: `Frontend model ${modelKey}@${requestedModel.version} changed after publication`,
        extra: {
          target: {
            serviceName: props.serviceName,
            frontendName: props.frontendName,
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
      properties: encodeShape(propertiesShape),
      indexes: definition.indexes,
      historicalDefinitions: [],
    };
  }

  const resolvedLock = {
    systemName: controller.systemName,
    frontendName: controller.frontendName,
    models: resolvedModels,
  };
  if (!isEqual(resolvedLock, serviceFrontendLock)) {
    return yield* new ZerospinError({
      code: 'service-frontend-lock-unsupported',
      message:
        'The requested service frontend lock does not match the running System definitions',
      extra: {
        target: {
          serviceName: props.serviceName,
          frontendName: props.frontendName,
        },
        serviceFrontendLockKey,
        definitionPath: 'lock',
        reason: 'definition-mutated',
      },
    });
  }
  const currentSpec = makeFrontendControllerSpec(controller);
  return {
    serviceFrontendLock: resolvedLock,
    frontendSpec: {
      ...currentSpec,
      models: selectedSpecModels,
      modelNames: Object.keys(selectedSpecModels).toSorted(),
      serviceFrontendLock: resolvedLock,
    },
  };
});
