import { makeZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IModel } from './types.ts';

export const requireVersion = Effect.fn('models.requireVersion')(function* <
  MODEL extends IModel,
>(model: MODEL, requestedVersion: string) {
  if (requestedVersion !== model.version) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'model-version-unsupported',
        message: `Model ${model.modelName} is version ${model.version}, not ${requestedVersion}`,
        extra: {
          modelName: model.modelName,
          currentVersion: model.version,
          requestedVersion,
        },
      }),
    );
  }
  return model;
});
