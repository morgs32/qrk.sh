import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { IModel, InferEncodedResource, InferResource } from './types.ts';

export const encodeResource = Effect.fn('models.encodeResource')(function* <
  MODEL extends IModel,
>(
  model: MODEL,
  resource: InferResource<NoInfer<MODEL>>,
): Effect.fn.Return<InferEncodedResource<MODEL>, IAnyError> {
  const { modelName, version, propertiesShape } = model;
  const currentResource = yield* Schema.decodeUnknownEffect(
    Schema.toType(makeEffectSchema(propertiesShape)),
  )(resource, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'model-current-resource-invalid',
      prefix: `Failed to validate current resource for ${modelName}@${version}`,
      extra: { modelName, modelVersion: version },
    }),
  );
  if (
    Reflect.get(currentResource, 'modelName') !== modelName ||
    Reflect.get(currentResource, 'version') !== version
  ) {
    return yield* new ZerospinError({
      code: 'model-current-resource-identity-invalid',
      message: `Current resource must identify ${modelName}@${version}`,
      extra: {
        modelName,
        modelVersion: version,
        resourceModelName: Reflect.get(currentResource, 'modelName'),
        resourceVersion: Reflect.get(currentResource, 'version'),
      },
    });
  }

  return yield* Schema.encodeEffect(model.resourceSchema)(currentResource, {
    onExcessProperty: 'error',
  }).pipe(
    mapParseError({
      code: 'model-resource-encode-invariant-failed',
      prefix: `Failed to encode resource for ${modelName}@${version}`,
      extra: {
        modelName,
        modelVersion: version,
      },
    }),
  );
});
