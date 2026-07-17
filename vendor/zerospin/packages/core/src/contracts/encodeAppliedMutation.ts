import { mapParseError, ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { mapValues, pick } from 'es-toolkit';

import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { PrimitiveKind } from '../models/primitiveKind.ts';
import { primitives } from '../models/primitives.ts';
import type { IModel } from '../models/types.ts';

import type {
  IAppliedMutation,
  IEncodedAppliedMutation,
  IOperationName,
} from './types.ts';

export const EncodedAppliedMutationSchema = Schema.Struct({
  commandId: Schema.String,
  mutationIndex: Schema.Number,
  modelName: Schema.String,
  modelVersion: Schema.String,
  resourceId: Schema.String,
  operationName: Schema.Literal(
    'create',
    'delete',
    'move',
    'replicateResource',
    'update',
  ),
  operation: Schema.String,
  appliedAt: Schema.Date,
  lastAppliedAt: Schema.NullOr(Schema.Date),
  inverseOperation: Schema.String,
}) satisfies Schema.Schema<
  IEncodedAppliedMutation,
  Schema.Schema.Encoded<Schema.Schema.Any>
>;

export const makeOperationJsonSchema = (props: {
  model: IModel;
  modelVersion: string;
  operationName: IOperationName;
}): Schema.Schema<unknown, string, never> => {
  const { model, modelVersion, operationName } = props;
  const definition =
    model.version === modelVersion
      ? model
      : model.historicalDefinitions.find(
          historicalDefinition =>
            historicalDefinition.version === modelVersion,
        );
  if (definition === undefined) {
    throw new Error(
      `Unknown model version "${modelVersion}" for "${model.modelName}"`,
    );
  }

  const attributesSchema = Schema.Struct(
    mapValues(definition.attributes, descriptor => {
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Boolean)
            : Schema.Boolean;
        case PrimitiveKind.Cursor:
        case PrimitiveKind.OpaqueId:
        case PrimitiveKind.Ref: {
          const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
          return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
        }
        case PrimitiveKind.Date:
          return descriptor.nullable ? Schema.NullOr(Schema.Date) : Schema.Date;
        case PrimitiveKind.Enum: {
          const literalSchema = Schema.Literal(...descriptor.values);
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
          const jsonSchema = Schema.parseJson();
          return descriptor.nullable
            ? Schema.NullOr(jsonSchema)
            : jsonSchema;
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
  const resourceSchema = Schema.Struct(
    mapValues(
      {
        id: primitives.primaryKey({ abbreviation: model.abbreviation }),
        modelName: primitives.text({ nullable: false }),
        createdAt: primitives.date({ nullable: false }),
        updatedAt: primitives.date({ nullable: false }),
        version: primitives.text({ nullable: false }),
        ...definition.attributes,
      },
      descriptor => {
        switch (descriptor.kind) {
          case PrimitiveKind.Boolean:
            return descriptor.nullable
              ? Schema.NullOr(Schema.Boolean)
              : Schema.Boolean;
          case PrimitiveKind.Cursor:
          case PrimitiveKind.OpaqueId:
          case PrimitiveKind.Ref: {
            const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
            return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
          }
          case PrimitiveKind.Date:
            return descriptor.nullable
              ? Schema.NullOr(Schema.Date)
              : Schema.Date;
          case PrimitiveKind.Enum: {
            const literalSchema = Schema.Literal(...descriptor.values);
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
            const jsonSchema = Schema.parseJson();
            return descriptor.nullable
              ? Schema.NullOr(jsonSchema)
              : jsonSchema;
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
      },
    ),
  );

  const innerOperationSchema = (() => {
    switch (operationName) {
      case 'create':
        return Schema.Struct({ encodedAttributes: attributesSchema });
      case 'delete':
        return Schema.Struct({});
      case 'update':
        return Schema.Struct({
          encodedAttributes: Schema.partial(attributesSchema),
        });
      case 'move':
        return Schema.Struct({
          prevId: Schema.String,
          nextId: Schema.String,
          property: Schema.String,
        });
      case 'replicateResource':
        return Schema.Struct({
          serviceName: Schema.String,
          resource: resourceSchema,
        });
      default: {
        const _exhaustive: never = operationName;
        return _exhaustive;
      }
    }
  })();

  return Schema.parseJson(innerOperationSchema) as Schema.Schema<
    unknown,
    string,
    never
  >;
};

export const makeInverseOperationJsonSchema = (props: {
  model: IModel;
  modelVersion: string;
  operationName: IOperationName;
}): Schema.Schema<unknown, string, never> => {
  const { model, modelVersion, operationName } = props;
  const definition =
    model.version === modelVersion
      ? model
      : model.historicalDefinitions.find(
          historicalDefinition =>
            historicalDefinition.version === modelVersion,
        );
  if (definition === undefined) {
    throw new Error(
      `Unknown model version "${modelVersion}" for "${model.modelName}"`,
    );
  }

  const attributesSchema = Schema.Struct(
    mapValues(definition.attributes, descriptor => {
      switch (descriptor.kind) {
        case PrimitiveKind.Boolean:
          return descriptor.nullable
            ? Schema.NullOr(Schema.Boolean)
            : Schema.Boolean;
        case PrimitiveKind.Cursor:
        case PrimitiveKind.OpaqueId:
        case PrimitiveKind.Ref: {
          const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
          return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
        }
        case PrimitiveKind.Date:
          return descriptor.nullable ? Schema.NullOr(Schema.Date) : Schema.Date;
        case PrimitiveKind.Enum: {
          const literalSchema = Schema.Literal(...descriptor.values);
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
          const jsonSchema = Schema.parseJson();
          return descriptor.nullable
            ? Schema.NullOr(jsonSchema)
            : jsonSchema;
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
  const resourceSchema = Schema.Struct(
    mapValues(
      {
        id: primitives.primaryKey({ abbreviation: model.abbreviation }),
        modelName: primitives.text({ nullable: false }),
        createdAt: primitives.date({ nullable: false }),
        updatedAt: primitives.date({ nullable: false }),
        version: primitives.text({ nullable: false }),
        ...definition.attributes,
      },
      descriptor => {
        switch (descriptor.kind) {
          case PrimitiveKind.Boolean:
            return descriptor.nullable
              ? Schema.NullOr(Schema.Boolean)
              : Schema.Boolean;
          case PrimitiveKind.Cursor:
          case PrimitiveKind.OpaqueId:
          case PrimitiveKind.Ref: {
            const idSchema = makeAbbreviationIdSchema(descriptor.abbreviation);
            return descriptor.nullable ? Schema.NullOr(idSchema) : idSchema;
          }
          case PrimitiveKind.Date:
            return descriptor.nullable
              ? Schema.NullOr(Schema.Date)
              : Schema.Date;
          case PrimitiveKind.Enum: {
            const literalSchema = Schema.Literal(...descriptor.values);
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
            const jsonSchema = Schema.parseJson();
            return descriptor.nullable
              ? Schema.NullOr(jsonSchema)
              : jsonSchema;
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
      },
    ),
  );

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
            encodedAttributes: Schema.partial(attributesSchema),
          }),
        );
      case 'move':
        return Schema.NullOr(
          Schema.Struct({
            property: Schema.String,
            prevId: Schema.String,
          }),
        );
      case 'replicateResource':
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

  return Schema.parseJson(innerInverseOperationSchema) as Schema.Schema<
    unknown,
    string,
    never
  >;
};

/** Encodes an applied mutation for ledger, persistence, or rollback storage. */
export const encodeAppliedMutation = Effect.fn('encodeAppliedMutation')(
  function* (props: {
    mutation: IAppliedMutation;
  }): Effect.fn.Return<IEncodedAppliedMutation, IAnyError> {
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
    const encoded = yield* Effect.gen(function* () {
      switch (operationName) {
        case 'delete':
          return {
            ...encodedBase,
            operation: yield* Schema.encode(
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
            operation: yield* Schema.encode(
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
            operation: yield* Schema.encode(
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
            operation: yield* Schema.encode(
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
        case 'replicateResource':
          return {
            ...encodedBase,
            operation: yield* Schema.encode(
              makeOperationJsonSchema({
                model,
                modelVersion,
                operationName: 'replicateResource',
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

    if (inverseOperation === null) {
      return {
        ...encoded,
        inverseOperation: yield* Schema.encode(
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
          inverseOperation: yield* Schema.encode(
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
          inverseOperation: yield* Schema.encode(
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
      case 'replicateResource':
        if (!('resource' in inverseOperation)) {
          return yield* new ZerospinError({
            code: 'invalid-inverse-operation',
            message:
              'encodeAppliedMutation: replicateResource inverseOperation must include resource',
          });
        }
        return {
          ...encoded,
          inverseOperation: yield* Schema.encode(
            makeInverseOperationJsonSchema({
              model,
              modelVersion,
              operationName: 'replicateResource',
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
          inverseOperation: yield* Schema.encode(
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
