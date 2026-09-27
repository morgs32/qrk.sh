import type {
  IAnyModels,
  IEncodedResourceShape,
  InferResource,
} from '@zerospin/core/models/types';
import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

export function encodeFixtureResources<MODELS extends IAnyModels>(props: {
  models: MODELS;
  resources: Partial<{
    [K in keyof MODELS]: readonly InferResource<MODELS[K]>[];
  }>;
}): Effect.Effect<readonly IEncodedResourceShape[], IAnyError> {
  return Effect.gen(function* () {
    const encoded: IEncodedResourceShape[] = [];
    for (const modelResources of Object.values(props.resources)) {
      if (modelResources === undefined) {
        continue;
      }
      const [firstResource] = modelResources;
      if (firstResource === undefined) {
        continue;
      }
      const model = props.models[firstResource.modelName];
      if (model === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'mock-session-resource-model-not-found',
            message: `Mock resource model ${firstResource.modelName} was not found`,
          }),
        );
      }
      const encodedModelResources = yield* Schema.encodeEffect(
        Schema.Array(
          Schema.Struct({
            id: makeAbbreviationIdSchema(model.abbreviation),
            modelName: Schema.Literal(model.modelName),
            createdAt: Schema.Date,
            updatedAt: Schema.Date,
            version: Schema.String,
            ...model.attributesSchema.fields,
          }),
        ),
      )(modelResources).pipe(
        mapParseError({
          code: 'mock-session-resource-encode-failed',
          prefix: `Failed to encode mock ${firstResource.modelName} resources`,
        }),
      );
      encoded.push(...encodedModelResources);
    }
    return encoded;
  });
}
