import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { makeAbbreviationIdSchema, PrimitiveKind } from '@zerospin/schema';
import { Effect, Schema, Struct } from 'effect';
import { mapValues, pick } from 'es-toolkit';

import type { IModel } from '../models/types.ts';

import type {
  IAnyMutation,
  IAppliedMutation,
  IEncodedAppliedMutation,
  IEncodedMutation,
  IOperationName,
} from './types.ts';

export const EncodedMutationSchema = Schema.Struct({
  commandId: Schema.String,
  mutationIndex: Schema.Number,
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  operationName: Schema.Literals([
    'create',
    'delete',
    'move',
    'replicate',
    'update',
  ]),
  operation: Schema.String,
}) satisfies Schema.Codec<IEncodedMutation, unknown>;

export const EncodedAppliedMutationSchema = Schema.Struct({
  commandId: Schema.String,
  mutationIndex: Schema.Number,
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  operationName: Schema.Literals([
    'create',
    'delete',
    'move',
    'replicate',
    'update',
  ]),
  operation: Schema.String,
  appliedAt: Schema.DateFromString,
  lastAppliedAt: Schema.NullOr(Schema.DateFromString),
  inverseOperation: Schema.String,
}) satisfies Schema.Codec<IEncodedAppliedMutation, unknown>;

/*
 * 1. Resolve the exact model definition.
 * 2. Build the operation's attribute schema.
 * 3. Build the complete resource schema used by replication.
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
          const jsonSchema = Schema.fromJsonString(Schema.Unknown);
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
  // 3 — Replication uses the same mapping over the complete resource shape.
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
          const jsonSchema = Schema.fromJsonString(Schema.Unknown);
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

  // 4 — Each operation retains only its wire fields; update uses a partial
  // attribute struct and replication carries the complete resource.
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
      case 'replicate':
        return Schema.Struct({
          serviceName: Schema.String,
          serviceVersion: Schema.optionalKey(Schema.String),
          serviceIndex: Schema.optionalKey(Schema.Number),
          resource: resourceSchema,
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
  // 1 — Inverse bytes use the exact model version that produced the mutation.
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
          const jsonSchema = Schema.fromJsonString(Schema.Unknown);
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
  // 3 — Map the full versioned resource for delete and replication restoration.
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
          const jsonSchema = Schema.fromJsonString(Schema.Unknown);
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
      case 'replicate':
        return Schema.NullOr(
          Schema.Struct({
            resource: resourceSchema,
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
 * Encodes a contract-produced mutation before any database applies it.
 *
 * 1. Capture the mutation identity shared by every operation.
 * 2. Encode create and delete operations.
 * 3. Apply an update mask before encoding changed attributes.
 * 4. Encode move and replication operations.
 * 5. Reject operation names outside the mutation union.
 */
export const encodeMutation = Effect.fn('encodeMutation')(function* (props: {
  commandId: string;
  mutationIndex: number;
  mutation: IAnyMutation;
}): Effect.fn.Return<IEncodedMutation, IAnyError> {
  // 1 — Keep command, mutation, model, version, resource, and operation identity
  // unchanged while only the operation payload becomes JSON.
  const { commandId, mutation, mutationIndex } = props;
  const { model, modelVersion, operationName, resourceId } = mutation;
  const encodedBase = {
    commandId,
    mutationIndex,
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
        operation: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'delete',
          }),
        )({}).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-frontend-mutation-operation',
            prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    case 'create':
      return {
        ...encodedBase,
        operation: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'create',
          }),
        )({ encodedAttributes: mutation.operation.attributes }).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-frontend-mutation-operation',
            prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    // 3 — Update persists only masked attributes when a mask is present.
    case 'update': {
      const filtered = mutation.operation.mask
        ? pick(mutation.operation.attributes, mutation.operation.mask)
        : mutation.operation.attributes;
      return {
        ...encodedBase,
        operation: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'update',
          }),
        )({ encodedAttributes: filtered }).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-frontend-mutation-operation',
            prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    }
    // 4 — Move and replication preserve their complete operation objects.
    case 'move':
      return {
        ...encodedBase,
        operation: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'move',
          }),
        )(mutation.operation).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-frontend-mutation-operation',
            prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    case 'replicate':
      return {
        ...encodedBase,
        operation: yield* Schema.encodeEffect(
          makeOperationJsonSchema({
            model,
            modelVersion,
            operationName: 'replicate',
          }),
        )(mutation.operation).pipe(
          mapParseError({
            code: 'failed-to-encode-aggregate-frontend-mutation-operation',
            prefix: `Failed to encode replication mutation operation for model "${model.modelName}"`,
          }),
        ),
      };
    // 5 — Exhaustiveness failures become a typed unsupported-operation error.
    default: {
      const _exhaustive: never = operationName;
      return yield* new ZerospinError({
        code: 'unsupported-mutation-operation',
        message: `encodeMutation: unsupported operationName "${String(_exhaustive)}"`,
      });
    }
  }
});

/**
 * Encodes an applied mutation for ledger, persistence, or rollback storage.
 *
 * 1. Capture applied mutation identity and timestamps.
 * 2. Encode the forward operation by operation name.
 * 3. Encode a null inverse when the mutation changed no prior state.
 * 4. Validate and mask update inverses.
 * 5. Validate and encode move, replication, and delete inverses.
 * 6. Reject impossible create inverses and unsupported operations.
 */
export const encodeAppliedMutation = Effect.fn('encodeAppliedMutation')(
  function* (props: {
    mutation: IAppliedMutation;
  }): Effect.fn.Return<IEncodedAppliedMutation, IAnyError> {
    // 1 — Preserve command, mutation, model, resource, version, and application
    // timestamps while encoding forward and inverse operation payloads.
    const { mutation } = props;
    const {
      appliedAt,
      commandId,
      lastAppliedAt,
      inverseOperation,
      model,
      modelVersion,
      mutationIndex,
      operationName,
      resourceId,
    } = mutation;
    const encodedBase = {
      commandId,
      mutationIndex,
      modelName: model.modelName,
      modelVersion,
      resourceId,
      operationName,
      appliedAt,
      lastAppliedAt,
    };
    // 2 — Encode the forward operation exactly as the pre-application mutation
    // encoder does, retaining update masks and complete move/replication data.
    const encoded = yield* Effect.gen(function* () {
      switch (operationName) {
        case 'delete':
          return {
            ...encodedBase,
            operation: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'delete',
              }),
            )({}).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
              }),
            ),
          };
        case 'create':
          return {
            ...encodedBase,
            operation: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'create',
              }),
            )({ encodedAttributes: mutation.operation.attributes }).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
              }),
            ),
          };
        case 'update': {
          const filtered = mutation.operation.mask
            ? pick(mutation.operation.attributes, mutation.operation.mask)
            : mutation.operation.attributes;
          return {
            ...encodedBase,
            operation: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'update',
              }),
            )({ encodedAttributes: filtered }).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
              }),
            ),
          };
        }
        case 'move':
          return {
            ...encodedBase,
            operation: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'move',
              }),
            )(mutation.operation).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode mutation operation JSON for model "${model.modelName}"`,
              }),
            ),
          };
        case 'replicate':
          return {
            ...encodedBase,
            operation: yield* Schema.encodeEffect(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'replicate',
              }),
            )(mutation.operation).pipe(
              mapParseError({
                code: 'failed-to-encode-applied-mutation-operation',
                prefix: `Failed to encode replication mutation operation for model "${model.modelName}"`,
              }),
            ),
          };
        default: {
          const _exhaustive: never = operationName;
          return yield* new ZerospinError({
            code: 'unsupported-mutation-operation',
            message: `encodeAppliedMutation: unsupported operationName "${String(_exhaustive)}"`,
          });
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
            code: 'failed-to-encode-applied-mutation-inverse-operation',
            prefix: `Failed to encode mutation inverseOperation JSON for model "${model.modelName}"`,
          }),
        ),
      };
    }

    switch (operationName) {
      // 4 — Update inverses must contain attributes and obey the forward mask.
      case 'update': {
        if (!('attributes' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: update inverseOperation must include attributes',
          });
        }
        const filtered = mutation.operation.mask
          ? pick(inverseOperation.attributes, mutation.operation.mask)
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
              code: 'failed-to-encode-applied-mutation-inverse-operation',
              prefix: `Failed to encode mutation inverseOperation JSON for model "${model.modelName}"`,
            }),
          ),
        };
      }
      // 5 — Move, replication, and delete each validate their required restore
      // fields before encoding through the matching inverse schema.
      case 'move':
        if (!('property' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: move inverseOperation must include property',
          });
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
              code: 'failed-to-encode-applied-mutation-inverse-operation',
              prefix: `Failed to encode mutation inverseOperation JSON for model "${model.modelName}"`,
            }),
          ),
        };
      case 'replicate':
        if (!('resource' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: replicate inverseOperation must include resource',
          });
        }
        return {
          ...encoded,
          inverseOperation: yield* Schema.encodeEffect(
            makeInverseOperationJsonSchema({
              model,
              modelVersion,
              operationName: 'replicate',
            }),
          )(inverseOperation).pipe(
            mapParseError({
              code: 'failed-to-encode-applied-mutation-inverse-operation',
              prefix: `Failed to encode replication inverse for model "${model.modelName}"`,
            }),
          ),
        };
      case 'delete':
        if (!('resource' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: delete inverseOperation must include resource',
          });
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
              code: 'failed-to-encode-applied-mutation-inverse-operation',
              prefix: `Failed to encode delete inverse for model "${model.modelName}"`,
            }),
          ),
        };
      // 6 — A non-null create inverse is impossible; unknown operations remain
      // a typed unsupported-operation failure.
      case 'create':
        return yield* new ZerospinError({
          code: 'invalid-inverse-operation',
          message:
            'encodeAppliedMutation: create inverseOperation must be null',
        });
      default: {
        const _exhaustive: never = operationName;
        return yield* new ZerospinError({
          code: 'unsupported-mutation-operation',
          message: `encodeAppliedMutation: unsupported operationName "${String(_exhaustive)}"`,
        });
      }
    }
  },
);
