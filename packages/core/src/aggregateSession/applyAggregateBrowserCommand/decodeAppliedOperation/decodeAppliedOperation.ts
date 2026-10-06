import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import type { IDecodedRecord } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';

import {
  makeInverseOperationJsonSchema,
  makeOperationJsonSchema,
} from '../../../contracts/encodeAppliedOperation.ts';
import type {
  IAnyOperation,
  IAppliedOperation,
  IEncodedAppliedOperation,
  IInverseOperation,
  IOperation,
} from '../../../contracts/types.ts';
import type { IModel } from '../../../models/types.ts';

/** Decodes an applied operation row/transport value. */
export const decodeAppliedOperation = Effect.fn('decodeAppliedOperation')(
  function* (props: {
    operation: IEncodedAppliedOperation;
    model: IModel;
  }): Effect.fn.Return<IAppliedOperation, IAnyError> {
    const { operation, model } = props;
    const definition =
      model.version === operation.modelVersion ? model : undefined;
    if (definition === undefined) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'unknown-applied-operation-model-version',
          message: `Unknown model version "${operation.modelVersion}" for "${model.modelName}"`,
        }),
      );
    }
    const decoded = yield* Schema.decodeEffect(
      makeOperationJsonSchema({
        model,
        modelVersion: operation.modelVersion,
        operationName: operation.operationName,
      }),
    )(operation.body).pipe(
      mapParseError({
        code: 'failed-to-decode-applied-operation-operation',
        prefix: `Failed to decode operation body for model "${operation.modelName}"`,
      }),
    );

    const resourceId = operation.resourceId as IAnyOperation['resourceId'];
    const appliedFields = {
      commandId: operation.commandId,
      operationIndex: operation.operationIndex,
      modelVersion: operation.modelVersion,
      appliedAt: operation.appliedAt,
      previousUpdatedAt: operation.previousUpdatedAt,
    };

    switch (operation.operationName) {
      case 'delete': {
        const inverseOperation = (yield* Schema.decodeEffect(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: operation.modelVersion,
            operationName: 'delete',
          }),
        )(operation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-operation-inverse-operation',
            prefix: `Failed to decode operation inverseOperation for model "${operation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'delete',
          body: {},
          ...appliedFields,
          inverseOperation,
        };
      }
      case 'create': {
        const attributes = (decoded as { encodedAttributes: IDecodedRecord })
          .encodedAttributes;
        return {
          model,
          resourceId,
          operationName: 'create',
          body: { attributes },
          ...appliedFields,
          inverseOperation: null,
        };
      }
      case 'update': {
        const attributes = (decoded as { encodedAttributes: IDecodedRecord })
          .encodedAttributes;
        const decodedInverseOperation = yield* Schema.decodeEffect(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: operation.modelVersion,
            operationName: 'update',
          }),
        )(operation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-operation-inverse-operation',
            prefix: `Failed to decode operation inverseOperation for model "${operation.modelName}"`,
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
          body: { attributes },
          ...appliedFields,
          inverseOperation,
        };
      }
      case 'move': {
        const inverseOperation = (yield* Schema.decodeEffect(
          makeInverseOperationJsonSchema({
            model,
            modelVersion: operation.modelVersion,
            operationName: 'move',
          }),
        )(operation.inverseOperation).pipe(
          mapParseError({
            code: 'failed-to-decode-applied-operation-inverse-operation',
            prefix: `Failed to decode operation inverseOperation for model "${operation.modelName}"`,
          }),
        )) as IInverseOperation | null;
        return {
          model,
          resourceId,
          operationName: 'move',
          body: decoded as IOperation<IModel, 'move'>['body'],
          ...appliedFields,
          inverseOperation,
        };
      }

      default: {
        const _exhaustive: never = operation.operationName;
        return yield* Effect.fail(
          makeZerospinError({
            code: 'unsupported-operation-operation',
            message: `decodeAppliedOperation: unsupported operationName "${String(_exhaustive)}"`,
          }),
        );
      }
    }
  },
);
