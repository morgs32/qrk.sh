import { Schema } from 'effect';

import type { IEncodedResourceShape } from './types.ts';

export const EncodedResourceSchema = Schema.extend(
  Schema.Struct({
    createdAt: Schema.Date,
    id: Schema.String,
    modelName: Schema.String,
    updatedAt: Schema.Date,
    version: Schema.String,
  }),
  Schema.Record({ key: Schema.String, value: Schema.Unknown }),
) satisfies Schema.Schema<
  IEncodedResourceShape,
  Schema.Schema.Encoded<Schema.Schema.Any>
>;
