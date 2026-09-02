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
      | IAnyRefDescriptor
    >
  | (Omit<
      Extract<IAnyPrimitiveDescriptor, { kind: PrimitiveKind.Json }>,
      'schema'
    > & {
      schema: JsonSchema.Document<'draft-2020-12'>;
    })
  | Omit<IAnyRefDescriptor, 'table'>
>;

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

      case PrimitiveKind.Boolean:
      case PrimitiveKind.Cursor:
      case PrimitiveKind.Date:
      case PrimitiveKind.Enum:
      case PrimitiveKind.Integer:
      case PrimitiveKind.Number:
      case PrimitiveKind.OpaqueId:
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
