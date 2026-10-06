/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { Schema } from 'effect';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';

import type {
  IServiceBrowserCommand,
  IServiceSessionSnapshot,
} from './types.ts';
const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);
const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);
const ServiceHashSchema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);
export const ServiceBrowserCommandSchema = Schema.fieldsAssign({
  executedIndex: positiveIndexSchema,
  serviceHash: ServiceHashSchema,
  serviceIndex: nonNegativeIndexSchema,
})(BrowserCommandSchema) satisfies Schema.Codec<IServiceBrowserCommand, any>;
export const ServiceSessionSnapshotSchema = Schema.Struct({
  resolvedThrough: nonNegativeIndexSchema,
  serviceIndex: nonNegativeIndexSchema,
  actorName: Schema.String,
  actorVersion: Schema.String,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  serviceName: Schema.String,
  sessionName: Schema.String,
  executedIndex: nonNegativeIndexSchema,
  serviceHash: ServiceHashSchema,
  serviceVersion: Schema.String,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IServiceSessionSnapshot, any>;
