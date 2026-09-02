import { primitives } from '@zerospin/schema';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

import type { InferCommandPayload, InferPayloadInput } from './types.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const nullableJsonWithDefault = primitives.json({
  nullable: true,
  schema: TinyJsonRowSchema,
  defaultValue: null,
});

const nullableJsonDefaultPayloadShape = {
  payload: nullableJsonWithDefault,
};

assert<
  Equals<
    InferPayloadInput<typeof nullableJsonDefaultPayloadShape>,
    {
      payload?: { readonly x: string } | null;
    }
  >
>();

assert<
  Equals<
    InferCommandPayload<typeof nullableJsonDefaultPayloadShape>,
    {
      payload: { readonly x: string } | null;
    }
  >
>();

const omittedNullableJsonDefault: InferPayloadInput<
  typeof nullableJsonDefaultPayloadShape
> = {};
void omittedNullableJsonDefault;
