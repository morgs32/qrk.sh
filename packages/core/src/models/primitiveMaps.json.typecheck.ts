import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { descriptorToEffectSchema } from './primitiveMaps.ts';
import { primitives } from './primitives.ts';
import type {
  InferCommandPayload,
  InferDecodedRow,
  InferPayloadInput,
} from './types.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const jsonColumn = primitives.json({ schema: TinyJsonRowSchema });

type IJsonDomainRow = InferDecodedRow<{ json: typeof jsonColumn }>;

assert<Equals<IJsonDomainRow['json'], { x: string }>>();

const nullableJson = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
});

const nullableJsonWithDefault = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

// @ts-expect-error non-nullable json cannot have a defaultValue
primitives.json({ schema: TinyJsonRowSchema, defaultValue: null });

// @ts-expect-error nullable json only accepts null as defaultValue
primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: { x: 'ok' },
});

const nullableJsonEffectSchema = descriptorToEffectSchema(nullableJson);

type INullableJsonEncoded = typeof nullableJsonEffectSchema.Encoded;
type INullableJsonDecoded = typeof nullableJsonEffectSchema.Type;

assert<Equals<INullableJsonEncoded, string | null>>();
assert<Equals<INullableJsonDecoded, { x: string } | null>>();

const nullableJsonDefaultPayloadShape = {
  payload: nullableJsonWithDefault,
} as const;

assert<
  Equals<
    InferPayloadInput<typeof nullableJsonDefaultPayloadShape>,
    {
      readonly payload?: { x: string } | null;
    }
  >
>();

assert<
  Equals<
    InferCommandPayload<typeof nullableJsonDefaultPayloadShape>,
    {
      readonly payload: { x: string } | null;
    }
  >
>();

const omittedNullableJsonDefault: InferPayloadInput<
  typeof nullableJsonDefaultPayloadShape
> = {};
void omittedNullableJsonDefault;
