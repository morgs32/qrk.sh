import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import type { IDecodedRecord, IModel } from '../models/types.ts';

import {
  makeInverseOperationJsonSchema,
  makeOperationJsonSchema,
} from './encodeAppliedMutation.ts';
import type {
  IAnyMutation,
  IAppliedMutation,
  IEncodedAppliedMutation,
  IInverseOperation,
  IMutation,
} from './types.ts';

/** Decodes an applied mutation row/transport value. */
export const decodeAppliedMutation = Effect.fn('decodeAppliedMutation')(
  function* (props: {
    mutation: IEncodedAppliedMutation;
    model: IModel;
  }): Effect.fn.Return<IAppliedMutation, IAnyError> {
    const { mutation, model } = props;
    const definition =
      model.version === mutation.modelVersion
        ? model
        : model.historicalDefinitions.find(
            historicalDefinition =>
              historicalDefinition.version === mutation.modelVersion,
          );
    if (definition === undefined) {
      return yield* new ZerospinError({
        code: 'unknown-applied-mutation-model-version',
        message: `Unknown model version "${mutation.modelVersion}" for "${model.modelName}"`,
      });
    }
    const decoded = yield* Schema.decode(
      makeOperationJsonSchema({
        model,
        modelVersion: mutation.modelVersion,
        operationName: mutation.operationName,
      }),
    )(mutation.operation).pipe(
      mapParseError({
        code: 'failed-to-decode-applied-mutation-operation',
        prefix: `Failed to decode mutation operation for model "${mutation.modelName}"`,
      }),
    );

    const resourceId = mutation.resourceId as IAnyMutation['resourceId'];
    const appliedFields = {
      commandId: mutation.commandId,
      mutationIndex: mutation.mutationIndex,
      modelVersion: mutation.modelVersion,
      appliedAt: mutation.appliedAt,
      lastAppliedAt: mutation.lastAppliedAt,
    };

    switch (mutation.operationName) {
      case 'delete': {
        const inverseOperation = (yield* Schema.decode(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: mutation.modelVersion,
            operationName: 'delete',
          }),
        )(mutation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-mutation-inverse-operation',
            prefix: `Failed to decode mutation inverseOperation for model "${mutation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'delete',
          operation: {},
          ...appliedFields,
          inverseOperation,
        };
      }
      case 'create': {
        const attributes = (
          decoded as { encodedAttributes: IDecodedRecord }
        ).encodedAttributes;
        return {
          model,
          resourceId,
          operationName: 'create',
          operation: { attributes },
          ...appliedFields,
          inverseOperation: null,
        };
      }
      case 'update': {
        const attributes = (
          decoded as { encodedAttributes: IDecodedRecord }
        ).encodedAttributes;
        const decodedInverseOperation = yield* Schema.decode(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: mutation.modelVersion,
            operationName: 'update',
          }),
        )(mutation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-mutation-inverse-operation',
            prefix: `Failed to decode mutation inverseOperation for model "${mutation.modelName}"`,
          }),
        );
        const inverseOperation =
          decodedInverseOperation === null
            ? null
            : {
                attributes: (
                  decodedInverseOperation as {
                    encodedAttributes: IDecodedRecord;
                  }
                ).encodedAttributes,
              };

        return {
          model,
          resourceId,
          operationName: 'update',
          operation: { attributes },
          ...appliedFields,
          inverseOperation,
        };
      }
      case 'move': {
        const inverseOperation = (yield* Schema.decode(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: mutation.modelVersion,
            operationName: 'move',
          }),
        )(mutation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-mutation-inverse-operation',
            prefix: `Failed to decode mutation inverseOperation for model "${mutation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'move',
          operation: decoded as IMutation<IModel, 'move'>['operation'],
          ...appliedFields,
          inverseOperation,
        };
      }
      case 'replicateResource': {
        const replication = decoded as IMutation<
          IModel,
          'replicateResource'
        >['operation'];
        const inverseOperation = (yield* Schema.decode(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: mutation.modelVersion,
            operationName: 'replicateResource',
          }),
        )(mutation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-mutation-inverse-operation',
            prefix: `Failed to decode replication inverse for model "${mutation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'replicateResource',
          operation: replication,
          ...appliedFields,
          inverseOperation,
        };
      }
      default: {
        const _exhaustive: never = mutation.operationName;
        return yield* new ZerospinError({
          code: 'unsupported-mutation-operation',
          message: `decodeAppliedMutation: unsupported operationName "${String(_exhaustive)}"`,
        });
      }
    }
  },
);
