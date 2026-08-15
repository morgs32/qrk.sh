import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { system } from 'system';

export const projectAggregateFrontendResource = Effect.fn(
  'AggregateFrontendRepo.projectAggregateFrontendResource',
)(function* (props: {
  aggregateName: string;
  frontendName: string;
  modelName: string;
  resource: unknown;
}): Effect.fn.Return<
  Readonly<{ modelName: string; resource: unknown }>,
  IAnyError
> {
  const aggregate = yield* getByKeyOrThrow({
    record: system.aggregates,
    key: props.aggregateName,
    recordKind: 'aggregates',
  });
  const frontendBinding = yield* getByKeyOrThrow({
    record: aggregate.frontends,
    key: props.frontendName,
    recordKind: `frontends owned by aggregate ${props.aggregateName}`,
  });
  const bindingEntry = Object.entries(frontendBinding.models).find(
    ([, model]) => model.modelName === props.modelName,
  );
  if (bindingEntry === undefined) {
    return yield* new ZerospinError({
      code: 'system-runtime-adapter-model-not-found',
      message: `Aggregate model "${props.modelName}" is not bound to frontend ${props.aggregateName}.${props.frontendName}`,
    });
  }
  const [modelKey, aggregateModel] = bindingEntry;
  const frontendModel = yield* getByKeyOrThrow({
    record: frontendBinding.controller.models,
    key: modelKey,
    recordKind: `models owned by frontend ${props.frontendName}`,
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
  const aggregateResource = yield* Schema.decodeUnknown(
    makeEffectSchema(aggregateModel.propertiesShape),
  )(props.resource, { onExcessProperty: 'error' }).pipe(
    Effect.flatMap(resource =>
      Schema.validate(aggregateModel.resourceSchema)(resource, {
        onExcessProperty: 'error',
      }),
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
  const validatedFrontendResource = yield* Schema.validate(
    frontendModel.resourceSchema,
  )(frontendResource, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'system-runtime-aggregate-frontend-resource-invalid',
      prefix: `Model adapter output did not match frontend model ${frontendModel.modelName}`,
    }),
  );
  return {
    modelName: frontendModel.modelName,
    resource: yield* Schema.encode(frontendModel.resourceSchema)(
      validatedFrontendResource,
    ).pipe(
      mapParseError({
        code: 'system-runtime-aggregate-frontend-resource-encode-failed',
        prefix: `Failed to encode frontend resource for model ${frontendModel.modelName}`,
      }),
    ),
  };
});
