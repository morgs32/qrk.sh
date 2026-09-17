import {
  PrimitiveKind,
  type IAnyPrimitiveDescriptor,
  type IPrimitiveDescriptorDecoded,
  type IShape,
} from '@zerospin/schema';
import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';
import { z } from 'zod';

function abbreviationIdZod(abbreviation: string) {
  return z.string().startsWith(`${abbreviation}_`);
}

function withNullableAndDefault(
  schema: z.ZodType,
  descriptor: IAnyPrimitiveDescriptor,
): z.ZodType {
  const nullable = descriptor.nullable === true;
  const nullableSchema = nullable ? schema.nullable() : schema;

  if (
    ((descriptor.kind === PrimitiveKind.Boolean ||
      descriptor.kind === PrimitiveKind.Integer ||
      descriptor.kind === PrimitiveKind.Number ||
      descriptor.kind === PrimitiveKind.Text ||
      descriptor.kind === PrimitiveKind.Date ||
      descriptor.kind === PrimitiveKind.Enum) &&
      descriptor.defaultValue !== undefined) ||
    (descriptor.kind === PrimitiveKind.Json &&
      descriptor.nullable === true &&
      descriptor.defaultValue === null)
  ) {
    return nullableSchema.default(descriptor.defaultValue);
  }

  return nullableSchema;
}

/*
 * 1. Map booleans and non-primary identifier descriptors.
 * 2. Build primary-key decoding.
 * 3. Map scalar, JSON, date, enum, and reference descriptors.
 * 4. Apply nullable and defaultValue semantics for decoded rows.
 * 5. Reject descriptor kinds outside the supported primitive set.
 */
export function descriptorToZod(
  descriptor: IAnyPrimitiveDescriptor,
): z.ZodType {
  // 1–3 — Build the concrete value schema for this primitive kind.
  const base: z.ZodType = (() => {
    switch (descriptor.kind) {
      case PrimitiveKind.Boolean: {
        return z.boolean();
      }
      case PrimitiveKind.Cursor:
      case PrimitiveKind.ForeignKey: {
        return abbreviationIdZod(descriptor.abbreviation);
      }
      case PrimitiveKind.PrimaryKey: {
        return abbreviationIdZod(descriptor.abbreviation);
      }
      case PrimitiveKind.Integer:
      case PrimitiveKind.Number: {
        return z.number();
      }
      case PrimitiveKind.Text: {
        return z.string();
      }
      case PrimitiveKind.Json: {
        const document = Schema.toJsonSchemaDocument(descriptor.schema);
        return z.fromJSONSchema(document.schema);
      }
      case PrimitiveKind.Date: {
        return z.date();
      }
      case PrimitiveKind.Enum: {
        return z.enum(descriptor.values);
      }
      case PrimitiveKind.Ref: {
        if (descriptor.targetKind === PrimitiveKind.Integer) {
          return z.number();
        }
        return abbreviationIdZod(descriptor.abbreviation);
      }
      // 5 — A descriptor that reaches this branch violated the primitive contract.
      default: {
        throw new Error(
          `Invalid attribute descriptor: ${JSON.stringify(descriptor)}`,
        );
      }
    }
  })();

  // 4 — Nullable descriptors wrap null; defaulted keys fill when missing.
  return withNullableAndDefault(base, descriptor);
}

export function makeZodSchema<SHAPE extends IShape>(
  properties: SHAPE,
): z.ZodObject<{
  [K in keyof SHAPE]: z.ZodType<IPrimitiveDescriptorDecoded<SHAPE[K]>>;
}> {
  return z.object(
    mapValues(properties, descriptor => descriptorToZod(descriptor)),
  ) as z.ZodObject<{
    [K in keyof SHAPE]: z.ZodType<IPrimitiveDescriptorDecoded<SHAPE[K]>>;
  }>;
}
