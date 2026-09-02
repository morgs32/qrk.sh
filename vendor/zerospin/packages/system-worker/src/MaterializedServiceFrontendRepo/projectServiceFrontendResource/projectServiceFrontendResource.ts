import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const projectServiceFrontendResource = Effect.fn(
  'MaterializedServiceFrontendRepo.projectServiceFrontendResource',
)(function* (props: {
  serviceName: string;
  frontendName: string;
  modelName: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const { frontendName, modelName, resource, serviceName } = props;
  const service = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: service.frontends,
    key: frontendName,
    recordKind: `frontends owned by service ${serviceName}`,
  });
  const bindingEntry = Object.entries(frontendBinding.models).find(
    ([, model]) => model.modelName === modelName,
  );
  if (bindingEntry === undefined) {
    return yield* new ZerospinError({
      code: 'system-runtime-service-adapter-model-not-found',
      message: `Service model "${modelName}" is not bound to frontend ${serviceName}.${frontendName}`,
    });
  }
  const [modelKey, serviceModel] = bindingEntry;
  const frontendModel = yield* getByKeyOrThrow({
    record: frontendBinding.controller.models,
    key: modelKey,
    recordKind: `models owned by frontend ${frontendName}`,
  });
  const projectionAdapter = frontendBinding.projectionAdapters[modelKey];
  if (
    projectionAdapter === undefined &&
    serviceModel.modelName !== frontendModel.modelName
  ) {
    return yield* new ZerospinError({
      code: 'system-runtime-service-model-adapter-required',
      message: `Frontend model ${frontendModel.modelName} requires a projection adapter from service model ${serviceModel.modelName}`,
    });
  }
  const serviceResource = yield* Schema.decodeUnknownEffect(
    makeEffectSchema(serviceModel.propertiesShape),
  )(resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.decodeEffect(Schema.toType(serviceModel.resourceSchema))(
        resource,
        {
          onExcessProperty: 'error',
        },
      ),
    ),
    mapParseError({
      code: 'system-runtime-service-resource-invalid',
      prefix: `Failed to decode service resource for model ${serviceModel.modelName}`,
    }),
  );
  const frontendResource =
    projectionAdapter === undefined
      ? serviceResource
      : yield* projectionAdapter(serviceResource);
  const validatedFrontendResource = yield* Schema.decodeEffect(
    Schema.toType(frontendModel.resourceSchema),
  )(frontendResource, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-service-frontend-resource-invalid',
      prefix: `Projection adapter output did not match frontend model ${frontendModel.modelName}`,
    }),
  );
  return {
    modelName: frontendModel.modelName,
    resource: yield* Schema.encodeEffect(frontendModel.resourceSchema)(
      validatedFrontendResource,
    ).pipe(
      mapParseError({
        code: 'system-runtime-service-frontend-resource-encode-failed',
        prefix: `Failed to encode frontend resource for model ${frontendModel.modelName}`,
      }),
    ),
  };
});
