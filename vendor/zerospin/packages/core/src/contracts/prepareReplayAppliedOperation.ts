import {
  catchZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { makeModelIdSchema } from '../models/make/makeModelIdSchema.ts';
import type { IAnyModels } from '../models/types.ts';

import { makeOperationJsonSchema } from './encodeAppliedOperation.ts';
import type { IAnyOperation, IEncodedAppliedOperation } from './types.ts';

/*
 * 1. Parse the source operation without trusting the target model shape.
 * 2. Decode with the exact registered model version.
 * 3. Validate the result and exact model identity.
 */
export const prepareReplayAppliedOperation = Effect.fn(
  'prepareReplayAppliedOperation',
)(function* (props: {
  operation: Pick<
    IEncodedAppliedOperation,
    'modelName' | 'modelVersion' | 'resourceId' | 'operationName' | 'body'
  >;
  controller: {
    models: IAnyModels;
  };
}): Effect.fn.Return<IAnyOperation, IAnyError> {
  const { controller, operation } = props;

  // 1 — Decode only the JSON envelope here. The chosen operation schema below
  // owns all source attribute/resource decoding, including dates.
  const parsedOperation: unknown = yield* Effect.try({
    try: () => JSON.parse(operation.body),
    catch: catchZerospinError({
      code: 'replay-operation-body-parse-failed',
      message: `Failed to parse replay operation body for ${operation.modelName}@${operation.modelVersion}/${operation.operationName}`,
    }),
  });
  if (
    typeof parsedOperation !== 'object' ||
    parsedOperation === null ||
    Array.isArray(parsedOperation)
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'replay-operation-body-invalid',
        message: `Replay operation body for ${operation.modelName}@${operation.modelVersion}/${operation.operationName} must be an object`,
      }),
    );
  }

  const sameNameCurrentModel = controller.models[operation.modelName];
  if (
    sameNameCurrentModel === undefined ||
    sameNameCurrentModel.version !== operation.modelVersion
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'replay-operation-model-version-unavailable',
        message: `Replay requires the exact model ${operation.modelName}@${operation.modelVersion}`,
      }),
    );
  }

  // 2 — Decode the operation with the current model codec, then construct a
  // operation bound to that exact model instance.
  const targetOperation = yield* Effect.gen(function* () {
    const resourceId = yield* Schema.decodeUnknownEffect(
      makeModelIdSchema(sameNameCurrentModel),
    )(operation.resourceId);
    const decodedBody = yield* Schema.decodeUnknownEffect(
      makeOperationJsonSchema({
        model: sameNameCurrentModel,
        modelVersion: sameNameCurrentModel.version,
        operationName: operation.operationName,
      }),
    )(JSON.stringify(parsedOperation), { onExcessProperty: 'error' });

    // oxlint-disable-next-line default-case -- All IOperationName variants are handled exhaustively.
    switch (operation.operationName) {
      case 'create': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            encodedAttributes: Schema.Record(Schema.String, Schema.Unknown),
          }),
        )(decodedBody);
        return {
          model: sameNameCurrentModel,
          modelVersion: sameNameCurrentModel.version,
          operationName: 'create' as const,
          resourceId,
          body: { attributes: decoded.encodedAttributes },
        };
      }
      case 'update': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            encodedAttributes: Schema.Record(Schema.String, Schema.Unknown),
            mask: Schema.optionalKey(Schema.Array(Schema.String)),
          }),
        )(decodedBody);
        return {
          model: sameNameCurrentModel,
          modelVersion: sameNameCurrentModel.version,
          operationName: 'update' as const,
          resourceId,
          body: {
            attributes: decoded.encodedAttributes,
            ...(decoded.mask === undefined ? {} : { mask: [...decoded.mask] }),
          },
        };
      }
      case 'delete':
        return {
          model: sameNameCurrentModel,
          modelVersion: sameNameCurrentModel.version,
          operationName: 'delete' as const,
          resourceId,
          body: {},
        };
      case 'move': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            property: Schema.String,
            prevId: Schema.String,
            nextId: Schema.String,
          }),
        )(decodedBody);
        return {
          model: sameNameCurrentModel,
          modelVersion: sameNameCurrentModel.version,
          operationName: 'move' as const,
          resourceId,
          body: decoded,
        };
      }
    }
  }).pipe(
    Effect.mapError(error =>
      makeZerospinError({
        code: 'replay-current-applied-operation-invalid',
        message: `Replay operation ${operation.modelName}@${operation.modelVersion}/${operation.operationName} does not validate under its exact schema`,
        cause: String(error),
      }),
    ),
  );

  // 3 — The result must bind the exact current controller model.
  if (targetOperation === undefined) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'replay-target-operation-missing',
        message: `Replay produced no target operation for ${operation.modelName}@${operation.modelVersion}/${operation.operationName}`,
      }),
    );
  }
  if (
    controller.models[targetOperation.model.modelName] !== targetOperation.model
  ) {
    return yield* Effect.fail(
      makeZerospinError({
        code: 'replay-target-operation-model-binding-invalid',
        message: `Replay destination operation for ${operation.modelName}@${operation.modelVersion}/${operation.operationName} is not bound to the exact registered controller model`,
      }),
    );
  }

  return targetOperation;
});
