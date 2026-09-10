import { mapParseError, ZerospinError } from '@zerospin/error';
import { makeEffectSchema } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { Model } from '../models/makeModel.ts';
import type { IModel } from '../models/types.ts';

import type { IModelMutations } from './types.ts';

/** Bind mutation construction to the contract's exact authored model version. */
export function makeModelMutations<MODEL extends IModel>(
  model: MODEL,
): IModelMutations<MODEL>;
export function makeModelMutations(model: IModel): IModelMutations<IModel> {
  const { version, modelName, attributes: declaredAttributes } = model;
  return {
    create(props) {
      const modelVersion = version;

      return Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(
          Schema.toType(makeEffectSchema(declaredAttributes)),
        )(props.attributes, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'create-resource-missing-attributes',
            prefix: `createMutation requires all model attributes for "${modelName}"`,
            extra: { modelName },
          }),
          Effect.asVoid,
        );

        return {
          model,
          modelVersion,
          operationName: 'create',
          resourceId: props.resourceId,
          operation: { attributes: props.attributes },
        };
      });
    },

    update(props) {
      const modelVersion = version;

      return Effect.gen(function* () {
        yield* Effect.void;
        const filteredAttributes = props.mask
          ? props.mask.reduce(
              (attributes: Record<string, unknown>, key: string) => {
                attributes[key] = props.attributes[key];
                return attributes;
              },
              {},
            )
          : props.attributes;

        return {
          model,
          modelVersion,
          operationName: 'update',
          resourceId: props.resourceId,
          operation: props.mask
            ? { attributes: filteredAttributes, mask: [...props.mask] }
            : { attributes: filteredAttributes },
        };
      });
    },

    delete(props) {
      const modelVersion = version;

      return Effect.gen(function* () {
        yield* Effect.void;

        return {
          model,
          modelVersion,
          operationName: 'delete',
          resourceId: props.resourceId,
          operation: {},
        };
      });
    },

    move(props) {
      const modelVersion = version;

      return Effect.gen(function* () {
        yield* Effect.void;

        return {
          model,
          modelVersion,
          operationName: 'move',
          resourceId: props.resourceId,
          operation: {
            property: props.property,
            prevId: props.prevId,
            nextId: props.nextId,
          },
        };
      });
    },
    // Replica methods bind the owning service and require a complete source
    // resource whose model identity and version match this model definition.

    replicate(resource) {
      const modelVersion = version;

      if (!Model.isReplica(model)) {
        return Effect.fail(
          new ZerospinError({
            code: 'replicate-resource-not-replica',
            message: `Model "${modelName}" is not a replica`,
          }),
        );
      }
      const sourceDefinition = model.sourceModel;
      const replica = model;
      return Effect.gen(function* () {
        const sourceResource = yield* Schema.decodeUnknownEffect(
          Schema.toType(makeEffectSchema(sourceDefinition.propertiesShape)),
        )(resource, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'replicate-resource-invalid-resource',
            prefix: `replicate requires a complete resource for model "${modelName}"`,
            extra: { modelName, serviceName: replica.serviceName },
          }),
        );

        if (sourceResource.modelName !== modelName) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-name-mismatch',
            message: `Resource ${sourceResource.id} has modelName "${sourceResource.modelName}", not "${modelName}"`,
            extra: {
              modelName,
              resourceModelName: sourceResource.modelName,
              serviceName: replica.serviceName,
            },
          });
        }

        if (sourceResource.version !== modelVersion) {
          return yield* new ZerospinError({
            code: 'replicate-resource-model-version-mismatch',
            message: `Resource ${sourceResource.id} has model version ${sourceResource.version}, not ${modelVersion}`,
            extra: {
              modelName,
              modelVersion,
              resourceVersion: sourceResource.version,
              serviceName: replica.serviceName,
            },
          });
        }

        return {
          model: replica,
          modelVersion,
          operationName: 'replicate',
          resourceId: sourceResource.id,
          operation: {
            serviceName: replica.serviceName,
            resource: {
              ...sourceResource,
              deletedAt: null,
              serviceIndex: null,
            },
          },
        };
      });
    },
  };
}
