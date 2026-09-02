import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const projectAggregateFrontendResource = Effect.fn(
  'MaterializedAggregateFrontendRepo.projectAggregateFrontendResource',
)(function* (props: {
  aggregateName: string;
  frontendName: string;
  modelName: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const { aggregateName, frontendName, modelName, resource } = props;
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: aggregateName,
    recordKind: 'aggregates',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: frontendName,
    recordKind: `frontends owned by aggregate ${aggregateName}`,
  });
  const bindingEntry = Object.entries(frontendBinding.models).find(
    ([, model]) => model.modelName === modelName,
  );
  if (bindingEntry === undefined) {
    return yield* new ZerospinError({
      code: 'system-runtime-adapter-model-not-found',
      message: `Aggregate model "${modelName}" is not bound to frontend ${aggregateName}.${frontendName}`,
    });
  }
  const [modelKey, aggregateModel] = bindingEntry;
  const frontendModel = yield* getByKeyOrThrow({
    record: frontendBinding.controller.models,
    key: modelKey,
    recordKind: `models owned by frontend ${frontendName}`,
  });
  const projectionAdapter = frontendBinding.projectionAdapters[modelKey];
  if (
    projectionAdapter === undefined &&
    aggregateModel.modelName !== frontendModel.modelName
  ) {
    return yield* new ZerospinError({
      code: 'system-runtime-model-adapter-required',
      message: `Frontend model ${frontendModel.modelName} requires a projection adapter from aggregate model ${aggregateModel.modelName}`,
    });
  }
  const aggregateResource = yield* Schema.decodeUnknownEffect(
    makeEffectSchema(aggregateModel.propertiesShape),
  )(resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.decodeEffect(Schema.toType(aggregateModel.resourceSchema))(
        resource,
        {
          onExcessProperty: 'error',
        },
      ),
    ),
    mapParseError({
      code: 'system-runtime-aggregate-resource-invalid',
      prefix: `Failed to decode aggregate resource for model ${aggregateModel.modelName}`,
    }),
  );
  const frontendResource =
    projectionAdapter === undefined
      ? aggregateResource
      : yield* projectionAdapter(aggregateResource);
  const validatedFrontendResource = yield* Schema.decodeEffect(
    Schema.toType(frontendModel.resourceSchema),
  )(frontendResource, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-resource-invalid',
      prefix: `Model adapter output did not match frontend model ${frontendModel.modelName}`,
    }),
  );
  return {
    modelName: frontendModel.modelName,
    resource: yield* Schema.encodeEffect(frontendModel.resourceSchema)(
      validatedFrontendResource,
    ).pipe(
      mapParseError({
        code: 'system-runtime-aggregate-frontend-resource-encode-failed',
        prefix: `Failed to encode frontend resource for model ${frontendModel.modelName}`,
      }),
    ),
  };
});
