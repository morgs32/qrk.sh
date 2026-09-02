import {
  PrimitiveKind,
  type IAnyShape,
  type IEncodedShape,
} from '@zerospin/schema';
import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

/**
 * Encode shape descriptors into the wire shape the consumer needs; do not round-trip back to IShape unless the consumer needs runtime descriptors.
 *
 * @bad Do not add `decodeShape` when the worker can consume the encoded descriptor shape directly.
 * @bad Do not send `primitives.json({ schema })` descriptors with the Effect `Schema` object across RPC.
 * @bad Do not emit a bare schema root; preserve the draft-2020-12 document metadata.
 * @bad Do not send a ref's runtime `table` object across RPC instead of its stable target and relation metadata.
 * @bad Do not encode legacy `modelName`, `inverse.kind`, or `primaryKey` flags instead of distinct ref and primary-key descriptors.
 * @bad Do not transform descriptor maps with `Object.entries(...).map(...)` instead of `mapValues`.
 */
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
