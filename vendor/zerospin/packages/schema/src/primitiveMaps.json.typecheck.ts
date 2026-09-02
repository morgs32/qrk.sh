import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import { makeEffectSchema, primitives, type InferDecodedRow } from './index.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const jsonColumn = primitives.json({ schema: TinyJsonRowSchema });

type IJsonDomainRow = InferDecodedRow<{ json: typeof jsonColumn }>;

assert<Equals<IJsonDomainRow['json'], { readonly x: string }>>();

const nullableJson = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
});

const _nullableJsonWithDefault = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

// @ts-expect-error non-nullable json cannot have a defaultValue
primitives.json({ schema: TinyJsonRowSchema, defaultValue: null });

primitives.json({
  // @ts-expect-error nullable json only accepts null as defaultValue
  nullable: true,
  schema: TinyJsonRowSchema,
  // @ts-expect-error nullable json only accepts null as defaultValue
  defaultValue: { x: 'ok' },
});

const nullableJsonEffectSchema = makeEffectSchema({ json: nullableJson });

type INullableJsonEncoded = typeof nullableJsonEffectSchema.Encoded;
type INullableJsonDecoded = typeof nullableJsonEffectSchema.Type;

assert<Equals<INullableJsonEncoded, { json: string | null }>>();
assert<Equals<INullableJsonDecoded, { json: { readonly x: string } | null }>>();
