import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { system } from 'system';

/*
 * Service frontend projection adapts one service-owned resource through its
 * frontend binding. Source and destination schemas are checked around the
 * optional authored projection adapter.
 *
 * 1. Resolve the service frontend.
 * 2. Find the source model binding.
 * 3. Require adapters for changed model names.
 * 4. Decode the persisted source resource.
 * 5. Adapt and validate the frontend resource.
 * 6. Return the encoded frontend resource.
 */
export const projectServiceFrontendResource = Effect.fn(
  'FrontendVersionedServiceRepo.projectServiceFrontendResource',
)(function* (props: {
  serviceName: string;
  serviceVersion: string;
  frontendName: string;
  modelName: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const { frontendName, modelName, resource, serviceName } = props;

  // 1 — read the service definition and requested frontend binding
  const authored = yield* getByKeyOrThrow({
    record: system.services,
    key: serviceName,
    recordKind: 'services',
  });
  const service = yield* getByKeyOrThrow({
    record: authored,
    key: props.serviceVersion,
    recordKind: 'listed versions',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: service.frontends,
    key: frontendName,
    recordKind: `frontends owned by service ${serviceName}`,
  });

  // 2 — match modelName or fail for an unbound service resource
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

  // 3 — compare the service and frontend model identities
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

  // 4 — decode properties and validate the service resource schema
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

  // 5 — apply the projection adapter when present, then check the destination schema
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

  // 6 — encode through the frontend model resource schema
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
