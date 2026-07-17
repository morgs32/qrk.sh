import { ZerospinError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import type { YieldWrap } from 'effect/Utils';

import { makeModelIdSchema } from './makeIdSchema.ts';
import type { IModel, InferIdFromAbbreviation } from './types.ts';

export const validateModelId = Effect.fn('validateModelId')(function* <
  MODEL extends IModel,
>(props: {
  model: MODEL;
  id: unknown;
}): Generator<
  YieldWrap<
    Effect.Effect<
      InferIdFromAbbreviation<MODEL['abbreviation']>,
      ZerospinError<'invalid-model-id'>
    >
  >,
  InferIdFromAbbreviation<MODEL['abbreviation']>,
  never
> {
  const { model, id } = props;
  const idSchema = makeModelIdSchema(model);

  return yield* Schema.decodeUnknown(idSchema)(id).pipe(
    Effect.mapError(
      parseError =>
        new ZerospinError({
          code: 'invalid-model-id',
          message: `Invalid id for model "${model.modelName}" (expected prefix "${model.abbreviation}_"): ${parseError.message}`,
        }),
    ),
  );
}) as <MODEL extends IModel>(props: {
  model: MODEL;
  id: unknown;
}) => Effect.Effect<
  InferIdFromAbbreviation<MODEL['abbreviation']>,
  ZerospinError<'invalid-model-id'>
>;
