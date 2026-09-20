/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';

import type {
  IServiceFrontendSnapshot,
  IServiceSelectedCommand,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

const ServiceFrontendDeltaSchema = Schema.Struct({
  upserted: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(RefSchema),
});

const ServiceHashSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

export const ServiceSelectedCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  serviceIndex: positiveIndexSchema,
  delta: ServiceFrontendDeltaSchema,
  serviceHash: ServiceHashSchema,
}) satisfies Schema.Codec<IServiceSelectedCommand, any>;

export const ServiceFrontendSnapshotSchema = Schema.Struct({
  authentication: Schema.Record(Schema.String, Schema.Unknown),
  serviceName: Schema.String,
  frontendName: Schema.String,
  serviceIndex: nonNegativeIndexSchema,
  serviceHash: ServiceHashSchema,
  serviceVersion: Schema.String,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IServiceFrontendSnapshot, any>;
