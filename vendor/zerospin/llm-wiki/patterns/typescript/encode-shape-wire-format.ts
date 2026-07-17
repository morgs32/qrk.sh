import { JSONSchema, Schema } from 'effect';
import { mapValues } from 'es-toolkit';

enum PrimitiveKind {
  Cursor = 'cursor',
  Json = 'json',
  OpaqueId = 'opaqueId',
  PrimaryKey = 'primaryKey',
  Ref = 'ref',
  Text = 'text',
}

type IShape = Record<
  string,
  | {
      kind: PrimitiveKind.Cursor;
      nullable: boolean;
      unique: boolean;
      abbreviation: string;
    }
  | {
      kind: PrimitiveKind.Json;
      nullable: boolean;
      schema: Schema.Schema<unknown>;
    }
  | {
      kind: PrimitiveKind.Ref;
      nullable: boolean;
      unique: boolean;
      abbreviation: string;
      table: unknown;
      targetTableName: string;
      targetColumnName: string;
      relation: string;
      inverse: string;
    }
  | {
      kind: PrimitiveKind.OpaqueId;
      nullable: boolean;
      unique: boolean;
      abbreviation: string;
    }
  | {
      kind: PrimitiveKind.PrimaryKey;
      nullable: false;
      unique: true;
      abbreviation: string;
    }
  | {
      kind: PrimitiveKind.Text;
      nullable: boolean;
      unique: boolean;
    }
>;

/**
 * Encode shape descriptors into the wire shape the consumer needs; do not round-trip back to IShape unless the consumer needs runtime descriptors.
 *
 * @bad Do not add `decodeShape` when the worker can consume the encoded descriptor shape directly.
 * @bad Do not send `primitives.json({ schema })` descriptors with the Effect `Schema` object across RPC.
 * @bad Do not send a ref's runtime `table` object across RPC instead of its stable target and relation metadata.
 * @bad Do not encode legacy `modelName`, `inverse.kind`, or `primaryKey` flags instead of distinct ref and primary-key descriptors.
 * @bad Do not transform descriptor maps with `Object.entries(...).map(...)` instead of `mapValues`.
 */
export function encodeShape(shape: IShape) {
  return mapValues(shape, descriptor => {
    switch (descriptor.kind) {
      case PrimitiveKind.Json:
        return {
          ...descriptor,
          schema: JSONSchema.make(descriptor.schema),
        };
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
      case PrimitiveKind.Cursor:
      case PrimitiveKind.OpaqueId:
      case PrimitiveKind.PrimaryKey:
      case PrimitiveKind.Text:
        return descriptor;
    }
  });
}
