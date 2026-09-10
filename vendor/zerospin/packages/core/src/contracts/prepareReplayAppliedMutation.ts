import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { makeModelIdSchema } from '../models/makeIdSchema.ts';
import { Model } from '../models/makeModel.ts';
import type { IAnyModels } from '../models/types.ts';

import { makeOperationJsonSchema } from './encodeAppliedMutation.ts';
import { makeModelMutations } from './makeModelMutations.ts';
import type { IAnyMutation, IEncodedAppliedMutation } from './types.ts';

/*
 * 1. Parse the source operation without trusting the target model shape.
 * 2. Decode with the exact registered model version.
 * 3. Validate the result and replica source identity.
 */
export const prepareReplayAppliedMutation = Effect.fn(
  'prepareReplayAppliedMutation',
)(function* (props: {
  mutation: Pick<
    IEncodedAppliedMutation,
    'modelName' | 'modelVersion' | 'resourceId' | 'operationName' | 'operation'
  >;
  controller: {
    models: IAnyModels;
  };
}): Effect.fn.Return<IAnyMutation, IAnyError> {
  const { controller, mutation } = props;

  // 1 — Decode only the JSON envelope here. The chosen mutation schema below
  // owns all source attribute/resource decoding, including dates.
  const parsedOperation: unknown = yield* Effect.try({
    try: () => JSON.parse(mutation.operation),
    catch: ZerospinError.catch({
      code: 'replay-applied-mutation-operation-parse-failed',
      message: `Failed to parse replay mutation operation for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
    }),
  });
  if (
    typeof parsedOperation !== 'object' ||
    parsedOperation === null ||
    Array.isArray(parsedOperation)
  ) {
    return yield* new ZerospinError({
      code: 'replay-applied-mutation-operation-invalid',
      message: `Replay mutation operation for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName} must be an object`,
    });
  }

  if (mutation.operationName === 'replicate') {
    const resource = Reflect.get(parsedOperation, 'resource');
    if (
      typeof resource !== 'object' ||
      resource === null ||
      Array.isArray(resource) ||
      Reflect.get(resource, 'id') !== mutation.resourceId ||
      Reflect.get(resource, 'modelName') !== mutation.modelName ||
      Reflect.get(resource, 'version') !== mutation.modelVersion
    ) {
      return yield* new ZerospinError({
        code: 'replay-replicate-resource-source-identity-invalid',
        message: `Replay replication resource identity must equal ${mutation.modelName}@${mutation.modelVersion}/${mutation.resourceId}`,
      });
    }
  }

  const sameNameCurrentModel = controller.models[mutation.modelName];
  if (
    sameNameCurrentModel === undefined ||
    sameNameCurrentModel.version !== mutation.modelVersion
  ) {
    return yield* new ZerospinError({
      code: 'replay-mutation-model-version-unavailable',
      message: `Replay requires the exact model ${mutation.modelName}@${mutation.modelVersion}`,
    });
  }

  // 2 — Decode the operation with the current model codec, then construct a
  // mutation bound to that exact model instance.
  const targetMutation = yield* Effect.gen(function* () {
    if (
      mutation.operationName === 'replicate' &&
      (!Model.isReplica(sameNameCurrentModel) ||
        sameNameCurrentModel.serviceName !==
          Reflect.get(parsedOperation, 'serviceName'))
    ) {
      return yield* new ZerospinError({
        code: 'replay-replicate-resource-destination-invalid',
        message: `Replay destination must be the replica owned by the source service`,
      });
    }
    const resourceId = yield* Schema.decodeUnknownEffect(
      makeModelIdSchema(sameNameCurrentModel),
    )(mutation.resourceId);
    const operation = yield* Schema.decodeUnknownEffect(
      makeOperationJsonSchema({
        model: sameNameCurrentModel,
        modelVersion: sameNameCurrentModel.version,
        operationName: mutation.operationName,
      }),
    )(JSON.stringify(parsedOperation), { onExcessProperty: 'error' });

    // oxlint-disable-next-line default-case -- All IOperationName variants are handled exhaustively.
    switch (mutation.operationName) {
      case 'create': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            encodedAttributes: Schema.Record(Schema.String, Schema.Unknown),
          }),
        )(operation);
        return yield* makeModelMutations(sameNameCurrentModel).create({
          resourceId,
          attributes: decoded.encodedAttributes,
        });
      }
      case 'update': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            encodedAttributes: Schema.Record(Schema.String, Schema.Unknown),
            mask: Schema.optionalKey(Schema.Array(Schema.String)),
          }),
        )(operation);
        return yield* makeModelMutations(sameNameCurrentModel).update({
          resourceId,
          attributes: decoded.encodedAttributes,
          ...(decoded.mask === undefined ? {} : { mask: decoded.mask }),
        });
      }
      case 'delete':
        return yield* makeModelMutations(sameNameCurrentModel).delete({
          resourceId,
        });
      case 'move': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            property: Schema.String,
            prevId: Schema.String,
            nextId: Schema.String,
          }),
        )(operation);
        return yield* makeModelMutations(sameNameCurrentModel).move({
          resourceId,
          ...decoded,
        });
      }
      case 'replicate': {
        const decoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            serviceName: Schema.String,
            serviceVersion: Schema.optionalKey(Schema.String),
            serviceIndex: Schema.optionalKey(Schema.Number),
            resource: Schema.toType(sameNameCurrentModel.resourceSchema),
          }),
        )(operation);
        return {
          model: sameNameCurrentModel,
          modelVersion: sameNameCurrentModel.version,
          operationName: mutation.operationName,
          resourceId,
          operation: decoded,
        };
      }
    }
  }).pipe(
    Effect.mapError(
      error =>
        new ZerospinError({
          code: 'replay-current-applied-mutation-invalid',
          message: `Replay mutation ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName} does not validate under its exact schema`,
          cause: String(error),
        }),
    ),
  );

  // 3 — The result must bind the exact current controller model; replication
  // additionally preserves service, resource, model, version, and ID identity.
  if (targetMutation === undefined) {
    return yield* new ZerospinError({
      code: 'replay-target-mutation-missing',
      message: `Replay produced no target mutation for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
    });
  }
  if (
    controller.models[targetMutation.model.modelName] !== targetMutation.model
  ) {
    return yield* new ZerospinError({
      code: 'replay-target-mutation-model-binding-invalid',
      message: `Replay destination mutation for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName} is not bound to the exact registered controller model`,
    });
  }
  if (
    targetMutation.operationName === 'replicate' &&
    (!Model.isReplica(targetMutation.model) ||
      targetMutation.operation.serviceName !==
        targetMutation.model.serviceName ||
      targetMutation.operation.serviceName !==
        Reflect.get(parsedOperation, 'serviceName') ||
      targetMutation.operation.resource.id !== targetMutation.resourceId ||
      targetMutation.operation.resource.modelName !==
        targetMutation.model.modelName ||
      targetMutation.operation.resource.version !== targetMutation.modelVersion)
  ) {
    return yield* new ZerospinError({
      code: 'replay-replicate-resource-destination-identity-invalid',
      message: `Replay replication destination resource identity must equal ${targetMutation.model.modelName}@${targetMutation.modelVersion}/${targetMutation.resourceId}`,
    });
  }

  return targetMutation;
});
