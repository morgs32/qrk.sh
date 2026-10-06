import { encodeOperation } from '@zerospin/core/contracts/encodeAppliedOperation';
import type { IAnyOperation } from '@zerospin/core/contracts/types';
import { mapParseError, type IAnyError } from '@zerospin/error';
import { primitives } from '@zerospin/shapes';
import { Effect, Schema } from 'effect';
export const ownedOperationShape = {
  commandId: primitives.text(),
  operationIndex: primitives.integer(),
  modelName: primitives.text(),
  modelVersion: primitives.text(),
  resourceId: primitives.text(),
  operationName: primitives.enum({
    values: ['create', 'delete', 'move', 'update'],
  }),
  body: primitives.text(),
};
export const OwnedOperationSchema = Schema.Struct({
  commandId: Schema.String,
  operationIndex: Schema.Number.check(
    Schema.isInt(),
    Schema.isGreaterThanOrEqualTo(0),
  ),
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  body: Schema.String,
  operationName: Schema.Literals(['create', 'delete', 'move', 'update']),
});
export type IOwnedOperation = typeof OwnedOperationSchema.Type;
export const decodeOwnedOperation = (input: unknown) =>
  Schema.decodeUnknownEffect(OwnedOperationSchema)(input).pipe(
    mapParseError({
      code: 'owned-operation-invalid',
      prefix: 'Invalid owned operation',
    }),
  );
export const encodeOwnedOperation = Effect.fn('encodeOwnedOperation')(
  function* (props: {
    output: IAnyOperation;
    commandId: string;
    operationIndex: number;
  }): Effect.fn.Return<IOwnedOperation, IAnyError> {
    const encoded = yield* encodeOperation({
      commandId: props.commandId,
      operationIndex: props.operationIndex,
      operation: props.output,
    });
    return encoded;
  },
);
