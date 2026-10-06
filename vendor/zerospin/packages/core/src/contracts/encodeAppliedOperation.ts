import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeAbbreviationIdSchema, PrimitiveKind } from '@zerospin/shapes';
import { Effect, Schema, Struct } from 'effect';
import { mapValues, pick } from 'es-toolkit';

import type { IModel } from '../models/types.ts';

import type {
  IAnyOperation,
  IAppliedOperation,
  IEncodedAppliedOperation,
  IEncodedOperation,
  IOperationName,
} from './types.ts';

export const EncodedOperationSchema = Schema.Struct({
  commandId: Schema.String,
  operationIndex: Schema.Number,
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  operationName: Schema.Literals(['create', 'delete', 'move', 'update']),
  body: Schema.String,
}) satisfies Schema.Codec<IEncodedOperation, unknown>;

export const EncodedAppliedOperationSchema = Schema.Struct({
  commandId: Schema.String,
  operationIndex: Schema.Number,
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  operationName: Schema.Literals(['create', 'delete', 'move', 'update']),
  body: Schema.String,
  appliedAt: Schema.DateFromString,
  previousUpdatedAt: Schema.NullOr(Schema.DateFromString),
  inverseOperation: Schema.String,
}) satisfies Schema.Codec<IEncodedAppliedOperation, unknown>;

/*
 * 1. Resolve the exact model definition.
 * 2. Build the operation's attribute schema.
 * 3. Build exact owned attribute schemas.
 * 4. Select the forward-operation shape by operation name.
 * 5. Wrap the selected operation as canonical JSON.
 */
export const makeOperationJsonSchema = (props: {
  model: IModel;
  modelVersion: string;
  operationName: IOperationName;
}): Schema.Codec<unknown, string> => {
  // 1 — Operation bytes are version-specific, so resolve the exact model
  // definition before mapping any descriptor.
  const { model, modelVersion, operationName } = props;
  const definition = model.version === modelVersion ? model : undefined;
  if (definition === undefined) {
    throw new Error(
      `Unknown model version "${modelVersion}" for "${model.modelName}"`,
    );
  }

  // 2 — Map authored attributes to their JSON-facing scalar, ID, date, enum,
  // or structured codecs while preserving nullable semantics.
  const attributesSchema = Schema.Struct(
    mapValues(definition.attributes, descriptor => {
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Boolean)
            : Schema.Boolean;
        case PrimitiveKind.Cursor:
        case PrimitiveKind.ForeignKey:
        case PrimitiveKind.Ref: {
          const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
          return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
        }
        case PrimitiveKind.Date:
          return descriptor.nullable
            ? Schema.NullOr(Schema.DateFromString)
            : Schema.DateFromString;
        case PrimitiveKind.Enum: {
          const literalSchema = Schema.Literals(descriptor.values);
          return descriptor.nullable
            ? Schema.NullOr(literalSchema)
            : literalSchema;
        }
        case PrimitiveKind.Integer:
        case PrimitiveKind.Number:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Number)
            : Schema.Number;
        case PrimitiveKind.Json: {
          const jsonSchema = Schema.fromJsonString(
            descriptor.schema as Schema.Codec<unknown, unknown>,
          );
          return descriptor.nullable ? Schema.NullOr(jsonSchema) : jsonSchema;
        }
        case PrimitiveKind.PrimaryKey:
          return makeAbbreviationIdSchema(descriptor.abbreviation);
        case PrimitiveKind.Text:
          return descriptor.nullable
            ? Schema.NullOr(Schema.String)
            : Schema.String;
        default:
          throw new Error(
            `Unknown attribute kind on model "${model.modelName}" version "${modelVersion}"`,
          );
      }
    }),
  );
  // 4 — Each operation retains only its wire fields; update uses a partial
  // attribute struct.
  const innerOperationSchema = (() => {
    switch (operationName) {
      case 'create':
        return Schema.Struct({ encodedAttributes: attributesSchema });
      case 'delete':
        return Schema.Struct({});
      case 'update':
        return Schema.Struct({
          encodedAttributes: attributesSchema.mapFields(
            Struct.map(Schema.optional),
          ),
        });
      case 'move':
        return Schema.Struct({
          prevId: Schema.String,
          nextId: Schema.String,
          property: Schema.String,
        });

      default: {
        const _exhaustive: never = operationName;
        return _exhaustive;
      }
    }
  })();

  // 5 — Persist and transport the operation as one canonical JSON string.
  return Schema.fromJsonString(innerOperationSchema);
};

/*
 * 1. Resolve the exact model definition.
 * 2. Build the inverse attribute schema.
 * 3. Build the complete resource schema used to restore deleted state.
 * 4. Select the nullable inverse shape by operation name.
 * 5. Wrap the selected inverse as canonical JSON.
 */
export const makeInverseOperationJsonSchema = (props: {
  model: IModel;
  modelVersion: string;
  operationName: IOperationName;
}): Schema.Codec<unknown, string> => {
  // 1 — Inverse bytes use the exact model version that produced the operation.
  const { model, modelVersion, operationName } = props;
  const definition = model.version === modelVersion ? model : undefined;
  if (definition === undefined) {
    throw new Error(
      `Unknown model version "${modelVersion}" for "${model.modelName}"`,
    );
  }

  // 2 — Map the version's authored attributes for update restoration.
  const attributesSchema = Schema.Struct(
    mapValues(definition.attributes, descriptor => {
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Boolean)
            : Schema.Boolean;
        case PrimitiveKind.Cursor:
        case PrimitiveKind.ForeignKey:
        case PrimitiveKind.Ref: {
          const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
          return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
        }
        case PrimitiveKind.Date:
          return descriptor.nullable
            ? Schema.NullOr(Schema.DateFromString)
            : Schema.DateFromString;
        case PrimitiveKind.Enum: {
          const literalSchema = Schema.Literals(descriptor.values);
          return descriptor.nullable
            ? Schema.NullOr(literalSchema)
            : literalSchema;
        }
        case PrimitiveKind.Integer:
        case PrimitiveKind.Number:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Number)
            : Schema.Number;
        case PrimitiveKind.Json: {
          const jsonSchema = Schema.fromJsonString(
            descriptor.schema as Schema.Codec<unknown, unknown>,
          );
          return descriptor.nullable ? Schema.NullOr(jsonSchema) : jsonSchema;
        }
        case PrimitiveKind.PrimaryKey:
          return makeAbbreviationIdSchema(descriptor.abbreviation);
        case PrimitiveKind.Text:
          return descriptor.nullable
            ? Schema.NullOr(Schema.String)
            : Schema.String;
        default:
          throw new Error(
            `Unknown attribute kind on model "${model.modelName}" version "${modelVersion}"`,
          );
      }
    }),
  );
  // 3 — Map the full versioned resource for delete restoration.
  const resourceSchema = Schema.Struct(
    mapValues(definition.propertiesShape, descriptor => {
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Boolean)
            : Schema.Boolean;
        case PrimitiveKind.Cursor:
        case PrimitiveKind.ForeignKey:
        case PrimitiveKind.Ref: {
          const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
          return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
        }
        case PrimitiveKind.Date:
          return descriptor.nullable
            ? Schema.NullOr(Schema.DateFromString)
            : Schema.DateFromString;
        case PrimitiveKind.Enum: {
          const literalSchema = Schema.Literals(descriptor.values);
          return descriptor.nullable
            ? Schema.NullOr(literalSchema)
            : literalSchema;
        }
        case PrimitiveKind.Integer:
        case PrimitiveKind.Number:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Number)
            : Schema.Number;
        case PrimitiveKind.Json: {
          const jsonSchema = Schema.fromJsonString(
            descriptor.schema as Schema.Codec<unknown, unknown>,
          );
          return descriptor.nullable ? Schema.NullOr(jsonSchema) : jsonSchema;
        }
        case PrimitiveKind.PrimaryKey:
          return makeAbbreviationIdSchema(descriptor.abbreviation);
        case PrimitiveKind.Text:
          return descriptor.nullable
            ? Schema.NullOr(Schema.String)
            : Schema.String;
        default:
          throw new Error(
            `Unknown property kind on model "${model.modelName}" version "${modelVersion}"`,
          );
      }
    }),
  );

  // 4 — Create has only a null inverse; every other operation permits null or
  // the minimal data required to restore its prior state.
  const innerInverseOperationSchema = (() => {
    switch (operationName) {
      case 'create':
        return Schema.Null;
      case 'delete':
        return Schema.NullOr(
          Schema.Struct({
            resource: resourceSchema,
          }),
        );
      case 'update':
        return Schema.NullOr(
          Schema.Struct({
            encodedAttributes: attributesSchema.mapFields(
              Struct.map(Schema.optional),
            ),
          }),
        );
      case 'move':
        return Schema.NullOr(
          Schema.Struct({
            property: Schema.String,
            prevId: Schema.String,
          }),
        );

      default: {
        const _exhaustive: never = operationName;
        return _exhaustive;
      }
    }
  })();

  // 5 — Persist and transport the inverse as one canonical JSON string.
  return Schema.fromJsonString(innerInverseOperationSchema);
};

/**
 * Encodes a contract-produced operation before any database applies it.
 *
 * 1. Capture the operation identity shared by every operation.
 * 2. Encode create and delete operations.
 * 3. Apply an update mask before encoding changed attributes.
 * 4. Encode move operations.
 * 5. Reject operation names outside the operation union.
 */
export const encodeOperation = Effect.fn('encodeOperation')(function* (props: {
  commandId: string;
  operationIndex: number;
  operation: IAnyOperation;
}): Effect.fn.Return<IEncodedOperation, IAnyError> {
  // 1 — Keep command, operation, model, version, resource, and operation identity
  // unchanged while only the operation payload becomes JSON.
  const { commandId, operation, operationIndex } = props;
  const { model, modelVersion, operationName, resourceId } = operation;
  const encodedBase = {
    commandId,
    operationIndex,
    modelName: model.modelName,
    modelVersion,
    resourceId,
    operationName,
  };

  switch (operationName) {
    // 2 — Delete encodes an empty operation; create encodes all authored attributes.
    case 'delete':
      return {
        ...encodedBase,
        body: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'delete',
          }),
        )({}).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-session-operation-operation',
            prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
          }),
        ),
      };
    case 'create':
      return {
        ...encodedBase,
        body: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'create',
          }),
        )({ encodedAttributes: operation.body.attributes }).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-session-operation-operation',
            prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
          }),
        ),
      };
    // 3 — Update persists only masked attributes when a mask is present.
    case 'update': {
      const filtered = operation.body.mask
        ? pick(operation.body.attributes, operation.body.mask)
        : operation.body.attributes;
      return {
        ...encodedBase,
        body: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'update',
          }),
        )({ encodedAttributes: filtered }).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-session-operation-operation',
            prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
          }),
        ),
      };
    }
    // 4 — Move operations preserve their complete operation objects.
    case 'move':
      return {
        ...encodedBase,
        body: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'move',
          }),
        )(operation.body).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-session-operation-operation',
            prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
          }),
        ),
      };

    // 5 — Exhaustiveness failures become a typed unsupported-operation error.
    default: {
      const _exhaustive: never = operationName;
      return yield* Effect.fail(
        makeZerospinError({
          code: 'unsupported-operation-operation',
          message: `encodeOperation: unsupported operationName "${String(_exhaustive)}"`,
        }),
      );
    }
  }
});

/**
 * Encodes an applied operation for ledger, persistence, or rollback storage.
 *
 * 1. Capture applied operation identity and timestamps.
 * 2. Encode the forward operation by operation name.
 * 3. Encode a null inverse when the operation changed no prior state.
 * 4. Validate and mask update inverses.
 * 5. Validate and encode move and delete inverses.
 * 6. Reject impossible create inverses and unsupported operations.
 */
export const encodeAppliedOperation = Effect.fn('encodeAppliedOperation')(
  function* (props: {
    operation: IAppliedOperation;
  }): Effect.fn.Return<IEncodedAppliedOperation, IAnyError> {
    // 1 — Preserve command, operation, model, resource, version, and application
    // timestamps while encoding forward and inverse operation payloads.
    const { operation } = props;
    const {
      appliedAt,
      commandId,
      previousUpdatedAt,
      inverseOperation,
      model,
      modelVersion,
      operationIndex,
      operationName,
      resourceId,
    } = operation;
    const encodedBase = {
      commandId,
      operationIndex,
      modelName: model.modelName,
      modelVersion,
      resourceId,
      operationName,
      appliedAt,
      previousUpdatedAt,
    };
    // 2 — Encode the forward operation exactly as the pre-application operation
    // encoder does, retaining update masks and complete move data.
    const encoded = yield* Effect.gen(function* () {
      switch (operationName) {
        case 'delete':
          return {
            ...encodedBase,
            body: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'delete',
              }),
            )({}).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-operation-operation',
                prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
              }),
            ),
          };
        case 'create':
          return {
            ...encodedBase,
            body: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'create',
              }),
            )({ encodedAttributes: operation.body.attributes }).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-operation-operation',
                prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
              }),
            ),
          };
        case 'update': {
          const filtered = operation.body.mask
            ? pick(operation.body.attributes, operation.body.mask)
            : operation.body.attributes;
          return {
            ...encodedBase,
            body: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'update',
              }),
            )({ encodedAttributes: filtered }).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-operation-operation',
                prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
              }),
            ),
          };
        }
        case 'move':
          return {
            ...encodedBase,
            body: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'move',
              }),
            )(operation.body).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-operation-operation',
                prefix: `Failed to encode operation body JSON for model "${model.modelName}"`,
              }),
            ),
          };

        default: {
          const _exhaustive: never = operationName;
          return yield* Effect.fail(
            makeZerospinError({
              code: 'unsupported-operation-operation',
              message: `encodeAppliedOperation: unsupported operationName "${String(_exhaustive)}"`,
            }),
          );
        }
      }
    });

    // 3 — Null inverse is a valid encoded value for operations that changed no
    // prior resource state.
    if (inverseOperation === null) {
      return {
        ...encoded,
        inverseOperation: yield* Schema.encodeEffect(
          makeInverseOperationJsonSchema({
            model,
            modelVersion,
            operationName,
          }),
        )(null).pipe(
          mapParseError({
            code: 'failed-to-encode-applied-operation-inverse-operation',
            prefix: `Failed to encode operation inverseOperation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    }

    switch (operationName) {
      // 4 — Update inverses must contain attributes and obey the forward mask.
      case 'update': {
        if (!('attributes' in inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'encodeAppliedOperation: update inverseOperation must include attributes',
            }),
          );
        }
        const filtered = operation.body.mask
          ? pick(inverseOperation.attributes, operation.body.mask)
          : inverseOperation.attributes;
        return {
          ...encoded,
          inverseOperation: yield* Schema.encodeEffect(
            makeInverseOperationJsonSchema({
              model,
              modelVersion,
              operationName: 'update',
            }),
          )({ encodedAttributes: filtered }).pipe(
            mapParseError({
              code: 'failed-to-encode-applied-operation-inverse-operation',
              prefix: `Failed to encode operation inverseOperation JSON for model "${model.modelName}"`,
            }),
          ),
        };
      }
      // 5 — Move and delete each validate their required restore
      // fields before encoding through the matching inverse schema.
      case 'move':
        if (!('property' in inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'encodeAppliedOperation: move inverseOperation must include property',
            }),
          );
        }
        return {
          ...encoded,
          inverseOperation: yield* Schema.encodeEffect(
            makeInverseOperationJsonSchema({
              model,
              modelVersion,
              operationName: 'move',
            }),
          )(inverseOperation).pipe(
            mapParseError({
              code: 'failed-to-encode-applied-operation-inverse-operation',
              prefix: `Failed to encode operation inverseOperation JSON for model "${model.modelName}"`,
            }),
          ),
        };

      case 'delete':
        if (!('resource' in inverseOperation)) {
          return yield* Effect.fail(
            makeZerospinError({
              code: 'invalid-inverse-operation',
              message:
                'encodeAppliedOperation: delete inverseOperation must include resource',
            }),
          );
        }
        return {
          ...encoded,
          inverseOperation: yield* Schema.encodeEffect(
            makeInverseOperationJsonSchema({
              model,
              modelVersion,
              operationName: 'delete',
            }),
          )(inverseOperation).pipe(
            mapParseError({
              code: 'failed-to-encode-applied-operation-inverse-operation',
              prefix: `Failed to encode delete inverse for model "${model.modelName}"`,
            }),
          ),
        };
      // 6 — A non-null create inverse is impossible; unknown operations remain
      // a typed unsupported-operation failure.
      case 'create':
        return yield* Effect.fail(
          makeZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedOperation: create inverseOperation must be null',
          }),
        );
      default: {
        const _exhaustive: never = operationName;
        return yield* Effect.fail(
          makeZerospinError({
            code: 'unsupported-operation-operation',
            message: `encodeAppliedOperation: unsupported operationName "${String(_exhaustive)}"`,
          }),
        );
      }
    }
  },
);
