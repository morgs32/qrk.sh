import { Schema, type JsonSchema } from 'effect';
import { mapValues } from 'es-toolkit';

import { PrimitiveKind } from './primitiveKind.ts';
import type {
  IAnyPrimitiveDescriptor,
  IAnyRefDescriptor,
  IAnyShape,
} from './types.ts';

export type IEncodedShape = Record<
  string,
  | Exclude<
      IAnyPrimitiveDescriptor,
      | Extract<IAnyPrimitiveDescriptor, { kind: PrimitiveKind.Json }>
      | Extract<IAnyPrimitiveDescriptor, { kind: PrimitiveKind.Date }>
      | IAnyRefDescriptor
    >
  | (Omit<
      Extract<IAnyPrimitiveDescriptor, { kind: PrimitiveKind.Json }>,
      'schema'
    > & {
      schema: JsonSchema.Document<'draft-2020-12'>;
    })
  | (Omit<
      Extract<IAnyPrimitiveDescriptor, { kind: PrimitiveKind.Date }>,
      'defaultValue'
    > & { defaultValue?: string })
  | Omit<IAnyRefDescriptor, 'table'>
>;

const encodedPrimitiveDescriptorSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.PrimaryKey),
    nullable: Schema.Literal(false),
    unique: Schema.Literal(true),
    abbreviation: Schema.String,
    autogenerate: Schema.optionalKey(Schema.Boolean),
    modelName: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.ForeignKey),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Ref),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
    targetKind: Schema.optionalKey(Schema.Literal(PrimitiveKind.Integer)),
    targetTableName: Schema.String,
    targetColumnName: Schema.String,
    relation: Schema.String,
    inverse: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Cursor),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    abbreviation: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Boolean),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Integer),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optional(Schema.Number),
    primaryKey: Schema.optionalKey(Schema.Boolean),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Number),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optional(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Text),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optional(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Date),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    defaultValue: Schema.optionalKey(
      Schema.String.check(
        Schema.makeFilter(value => !Number.isNaN(Date.parse(value))),
      ),
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Enum),
    nullable: Schema.Boolean,
    unique: Schema.Boolean,
    values: Schema.NonEmptyArray(Schema.String),
    defaultValue: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal(PrimitiveKind.Json),
    nullable: Schema.Boolean,
    schema: Schema.Struct({
      dialect: Schema.Literal('draft-2020-12'),
      schema: Schema.Any,
      definitions: Schema.Record(Schema.String, Schema.Any),
    }),
    defaultValue: Schema.optional(Schema.Null),
  }),
]);

export const encodedShapeSchema = Schema.Record(
  Schema.String,
  encodedPrimitiveDescriptorSchema,
);

export function encodeShape(shape: IAnyShape): IEncodedShape {
  return mapValues(shape, descriptor => {
    switch (descriptor.kind) {
      case PrimitiveKind.Json: {
        return {
          ...descriptor,
          schema: Schema.toJsonSchemaDocument(descriptor.schema),
        };
      }

      case PrimitiveKind.Ref: {
        const {
          abbreviation,
          inverse,
          kind,
          nullable,
          relation,
          targetKind,
          targetColumnName,
          targetTableName,
          unique,
        } = descriptor;
        return {
          abbreviation,
          inverse,
          kind,
          nullable,
          relation,
          ...(targetKind === PrimitiveKind.Integer ? { targetKind } : {}),
          targetColumnName,
          targetTableName,
          unique,
        };
      }

      case PrimitiveKind.Date: {
        const { defaultValue, ...date } = descriptor;
        return {
          ...date,
          ...(defaultValue === undefined
            ? {}
            : { defaultValue: defaultValue.toISOString() }),
        };
      }

      case PrimitiveKind.Boolean:
      case PrimitiveKind.Cursor:
      case PrimitiveKind.Enum:
      case PrimitiveKind.Integer:
      case PrimitiveKind.Number:
      case PrimitiveKind.ForeignKey:
      case PrimitiveKind.PrimaryKey:
      case PrimitiveKind.Text: {
        return descriptor;
      }

      default: {
        throw new Error('Unsupported primitive kind');
      }
    }
  });
}
