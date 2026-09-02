/*
 * prepareReplayAppliedMutation validates and adapts one stored applied
 * mutation for the current controller.
 *
 * 1. Parse the source operation without trusting the target model shape.
 * 2. Try a same-name current mutation schema first. A successful decode is
 *    the automatic compatible-version promotion path.
 * 3. Otherwise locate exactly one direct controller-owned source edge.
 * 4. Decode with that edge's historical source schema, invoke its adapter (or
 *    discard a null destination), and validate the adapted destination.
 */

import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Result, Schema } from 'effect';

import type { IModels } from '../models/types.ts';

import type {
  IAnyMutation,
  IEncodedAppliedMutation,
  IOperationName,
} from './types.ts';

export const prepareReplayAppliedMutation = Effect.fn(
  'prepareReplayAppliedMutation',
)(function* (props: {
  mutation: IEncodedAppliedMutation;
  controller: {
    models: IModels;
    mutationAdapters:
      | Record<
          string,
          Partial<
            Record<
              IOperationName,
              readonly {
                source: Schema.Codec<IAnyMutation, unknown>;
                destination: Schema.Codec<IAnyMutation, unknown> | null;
                adapter?: unknown;
              }[]
            >
          >
        >
      | undefined;
  };
}): Effect.fn.Return<IAnyMutation | null, IAnyError> {
  const { controller, mutation } = props;

  // 1 — Decode only the JSON envelope here. The chosen mutation schema below
  // owns all source attribute/resource decoding, including historical dates.
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

  let sourceReplicationResource: object | undefined;
  if (mutation.operationName === 'replicateResource') {
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
    sourceReplicationResource = resource;
  }

  const encodedMutationOperation =
    mutation.operationName === 'create' || mutation.operationName === 'update'
      ? {
          attributes: Reflect.get(parsedOperation, 'encodedAttributes'),
        }
      : parsedOperation;
  const encodedMutation = {
    modelName: mutation.modelName,
    modelVersion: mutation.modelVersion,
    operationName: mutation.operationName,
    resourceId: mutation.resourceId,
    operation: encodedMutationOperation,
  };

  let targetMutation: IAnyMutation | undefined;
  const sameNameCurrentModel = controller.models[mutation.modelName];

  // 2 — A historical mutation that decodes under the same-name current
  // schema needs no adapter. Decoding also replaces its modelVersion with the
  // destination version and binds the exact current model object.
  if (sameNameCurrentModel !== undefined) {
    let currentMutationSchema: Schema.Codec<IAnyMutation, unknown> | undefined;
    switch (mutation.operationName) {
      case 'create':
        currentMutationSchema = sameNameCurrentModel.createMutation(
          sameNameCurrentModel.version,
        );
        break;
      case 'delete':
        currentMutationSchema = sameNameCurrentModel.deleteMutation(
          sameNameCurrentModel.version,
        );
        break;
      case 'move':
        currentMutationSchema = sameNameCurrentModel.moveMutation(
          sameNameCurrentModel.version,
        );
        break;
      case 'replicateResource':
        if (
          !('sourceModel' in sameNameCurrentModel) ||
          Reflect.get(sameNameCurrentModel, 'serviceName') !==
            Reflect.get(parsedOperation, 'serviceName')
        ) {
          break;
        }
        const replicateResourceMutation = Reflect.get(
          sameNameCurrentModel,
          'replicateResourceMutation',
        );
        if (typeof replicateResourceMutation !== 'function') {
          return yield* new ZerospinError({
            code: 'replay-replicate-resource-destination-schema-missing',
            message: `Replay destination model replica "${sameNameCurrentModel.modelName}" has no replicateResource mutation schema`,
          });
        }
        currentMutationSchema = Reflect.apply(
          replicateResourceMutation,
          sameNameCurrentModel,
          [sameNameCurrentModel.version],
        );
        break;
      case 'update':
        currentMutationSchema = sameNameCurrentModel.updateMutation(
          sameNameCurrentModel.version,
        );
        break;
      default: {
        const _exhaustive: never = mutation.operationName;
        return yield* new ZerospinError({
          code: 'replay-applied-mutation-operation-unsupported',
          message: `Unsupported replay mutation operation "${String(_exhaustive)}"`,
        });
      }
    }

    if (currentMutationSchema !== undefined) {
      const promoted = yield* Schema.decodeUnknownEffect(currentMutationSchema)(
        mutation.operationName === 'replicateResource' &&
          sourceReplicationResource !== undefined
          ? {
              ...encodedMutation,
              modelVersion: sameNameCurrentModel.version,
              operation: {
                ...parsedOperation,
                resource: {
                  ...sourceReplicationResource,
                  modelName: sameNameCurrentModel.modelName,
                  version: sameNameCurrentModel.version,
                },
              },
            }
          : {
              ...encodedMutation,
              modelVersion: sameNameCurrentModel.version,
            },
        { onExcessProperty: 'error' },
      ).pipe(Effect.result);
      if (Result.isSuccess(promoted)) {
        targetMutation = promoted.success;
      } else if (mutation.modelVersion === sameNameCurrentModel.version) {
        return yield* new ZerospinError({
          code: 'replay-current-applied-mutation-invalid',
          message: `Current replay mutation ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName} does not validate under its current schema`,
          cause: String(promoted.failure),
        });
      }
    }
  }

  // 3 — Incompatible and renamed mutations require one direct source edge.
  // Every edge is revalidated here because replay is the persisted-data trust
  // boundary, even though controller construction validates authored config.
  if (targetMutation === undefined) {
    const edges =
      controller.mutationAdapters?.[mutation.modelName]?.[
        mutation.operationName
      ];
    if (edges === undefined) {
      return yield* new ZerospinError({
        code: 'replay-mutation-adapter-missing',
        message: `Missing mutation adapter for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
      });
    }

    let selectedSource: Schema.Codec<IAnyMutation, unknown> | undefined;
    let selectedDestination:
      | Schema.Codec<IAnyMutation, unknown>
      | null
      | undefined;
    let selectedAdapter: unknown;

    for (const [edgeIndex, edge] of edges.entries()) {
      if (typeof edge !== 'object' || edge === null) {
        return yield* new ZerospinError({
          code: 'replay-mutation-adapter-edge-invalid',
          message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] must be an object`,
        });
      }
      const source = Reflect.get(edge, 'source');
      if (!Schema.isSchema(source)) {
        return yield* new ZerospinError({
          code: 'replay-mutation-adapter-source-invalid',
          message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] has no source schema`,
        });
      }

      const sourceJsonSchema = Schema.toJsonSchemaDocument(source);
      const sourceProperties = Reflect.get(
        sourceJsonSchema.schema,
        'properties',
      );
      const sourceModelNameProperty =
        typeof sourceProperties === 'object' && sourceProperties !== null
          ? Reflect.get(sourceProperties, 'modelName')
          : undefined;
      const sourceModelVersionProperty =
        typeof sourceProperties === 'object' && sourceProperties !== null
          ? Reflect.get(sourceProperties, 'modelVersion')
          : undefined;
      const sourceOperationNameProperty =
        typeof sourceProperties === 'object' && sourceProperties !== null
          ? Reflect.get(sourceProperties, 'operationName')
          : undefined;
      const sourceModelNames =
        typeof sourceModelNameProperty === 'object' &&
        sourceModelNameProperty !== null
          ? Reflect.get(sourceModelNameProperty, 'enum')
          : undefined;
      const sourceModelVersions =
        typeof sourceModelVersionProperty === 'object' &&
        sourceModelVersionProperty !== null
          ? Reflect.get(sourceModelVersionProperty, 'enum')
          : undefined;
      const sourceOperationNames =
        typeof sourceOperationNameProperty === 'object' &&
        sourceOperationNameProperty !== null
          ? Reflect.get(sourceOperationNameProperty, 'enum')
          : undefined;
      const sourceModelName = Array.isArray(sourceModelNames)
        ? sourceModelNames[0]
        : undefined;
      const sourceModelVersion = Array.isArray(sourceModelVersions)
        ? sourceModelVersions[0]
        : undefined;
      const sourceOperationName = Array.isArray(sourceOperationNames)
        ? sourceOperationNames[0]
        : undefined;
      if (
        sourceModelName !== mutation.modelName ||
        typeof sourceModelVersion !== 'string' ||
        sourceOperationName !== mutation.operationName
      ) {
        return yield* new ZerospinError({
          code: 'replay-mutation-adapter-source-identity-invalid',
          message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] source identity is not ${mutation.modelName}@<version>/${mutation.operationName}`,
        });
      }

      const destination = Reflect.get(edge, 'destination');
      const adapter = Reflect.get(edge, 'adapter');
      if (destination === null) {
        if (adapter !== undefined) {
          return yield* new ZerospinError({
            code: 'replay-null-mutation-adapter-has-callback',
            message: `Null mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] must omit adapter`,
          });
        }
      } else {
        if (!Schema.isSchema(destination)) {
          return yield* new ZerospinError({
            code: 'replay-mutation-adapter-destination-invalid',
            message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] has no destination schema`,
          });
        }
        if (typeof adapter !== 'function') {
          return yield* new ZerospinError({
            code: 'replay-mutation-adapter-callback-missing',
            message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] requires an adapter callback`,
          });
        }

        const destinationJsonSchema = Schema.toJsonSchemaDocument(destination);
        const destinationProperties = Reflect.get(
          destinationJsonSchema.schema,
          'properties',
        );
        const destinationModelNameProperty =
          typeof destinationProperties === 'object' &&
          destinationProperties !== null
            ? Reflect.get(destinationProperties, 'modelName')
            : undefined;
        const destinationModelVersionProperty =
          typeof destinationProperties === 'object' &&
          destinationProperties !== null
            ? Reflect.get(destinationProperties, 'modelVersion')
            : undefined;
        const destinationOperationNameProperty =
          typeof destinationProperties === 'object' &&
          destinationProperties !== null
            ? Reflect.get(destinationProperties, 'operationName')
            : undefined;
        const destinationModelNames =
          typeof destinationModelNameProperty === 'object' &&
          destinationModelNameProperty !== null
            ? Reflect.get(destinationModelNameProperty, 'enum')
            : undefined;
        const destinationModelVersions =
          typeof destinationModelVersionProperty === 'object' &&
          destinationModelVersionProperty !== null
            ? Reflect.get(destinationModelVersionProperty, 'enum')
            : undefined;
        const destinationOperationNames =
          typeof destinationOperationNameProperty === 'object' &&
          destinationOperationNameProperty !== null
            ? Reflect.get(destinationOperationNameProperty, 'enum')
            : undefined;
        const destinationModelName = Array.isArray(destinationModelNames)
          ? destinationModelNames[0]
          : undefined;
        const destinationModelVersion = Array.isArray(destinationModelVersions)
          ? destinationModelVersions[0]
          : undefined;
        const destinationOperationName = Array.isArray(
          destinationOperationNames,
        )
          ? destinationOperationNames[0]
          : undefined;
        const destinationModel =
          typeof destinationModelName === 'string'
            ? controller.models[destinationModelName]
            : undefined;
        if (
          destinationModel === undefined ||
          destinationModelVersion !== destinationModel.version ||
          destinationOperationName !== mutation.operationName
        ) {
          return yield* new ZerospinError({
            code: 'replay-mutation-adapter-destination-identity-invalid',
            message: `Mutation adapter edge ${mutation.modelName}.${mutation.operationName}[${edgeIndex}] destination must be a current controller model with the same operation`,
          });
        }
      }

      if (sourceModelVersion !== mutation.modelVersion) {
        continue;
      }
      if (selectedSource !== undefined) {
        return yield* new ZerospinError({
          code: 'replay-mutation-adapter-duplicate',
          message: `Multiple mutation adapter edges match ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
        });
      }
      selectedSource = source;
      selectedDestination = destination;
      selectedAdapter = adapter;
    }

    if (selectedSource === undefined || selectedDestination === undefined) {
      return yield* new ZerospinError({
        code: 'replay-mutation-adapter-missing',
        message: `Missing mutation adapter for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
      });
    }
    if (selectedDestination === null) {
      return null;
    }

    // 4 — The source schema is the only decoder that still owns a retired or
    // renamed model. Decode the adjacent callback as an Effect-returning
    // function before invoking it with that validated historical source.
    const sourceMutation = yield* Schema.decodeUnknownEffect(selectedSource)(
      encodedMutation,
      { onExcessProperty: 'error' },
    ).pipe(
      mapParseError({
        code: 'replay-mutation-adapter-source-decode-failed',
        prefix: `Failed to decode mutation adapter source ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
      }),
    );
    const invokeAdapter = yield* Schema.decodeUnknownEffect(
      Schema.declare(
        (
          input: unknown,
        ): input is (
          sourceMutation: unknown,
        ) => Effect.Effect<unknown, IAnyError, never> =>
          typeof input === 'function',
      ),
    )(selectedAdapter).pipe(
      mapParseError({
        code: 'replay-mutation-adapter-callback-invalid',
        prefix: `Mutation adapter callback is invalid for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
      }),
    );
    const adaptedMutation = yield* invokeAdapter(sourceMutation);
    targetMutation = yield* Schema.decodeUnknownEffect(
      Schema.toType(selectedDestination),
    )(adaptedMutation, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'replay-mutation-adapter-destination-invalid',
        prefix: `Mutation adapter returned an invalid destination for ${mutation.modelName}@${mutation.modelVersion}/${mutation.operationName}`,
      }),
    );
  }

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
    targetMutation.operationName === 'replicateResource' &&
    (!('sourceModel' in targetMutation.model) ||
      targetMutation.operation.serviceName !==
        Reflect.get(targetMutation.model, 'serviceName') ||
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
