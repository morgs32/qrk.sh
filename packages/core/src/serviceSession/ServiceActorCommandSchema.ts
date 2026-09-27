/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { ActorDeltaSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';

import type { IServiceActorCommand, IServiceSessionSnapshot } from './types.ts';

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

export const ServiceActorCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  serviceIndex: positiveIndexSchema,
  actorDelta: ActorDeltaSchema,
  serviceHash: ServiceHashSchema,
}) satisfies Schema.Codec<IServiceActorCommand, any>;

export const ServiceSessionSnapshotSchema = Schema.Struct({
  actorName: Schema.String,
  actorVersion: Schema.String,
  identity: Schema.Record(Schema.String, Schema.Unknown),
  serviceName: Schema.String,
  sessionName: Schema.String,
  serviceIndex: nonNegativeIndexSchema,
  serviceHash: ServiceHashSchema,
  serviceVersion: Schema.String,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IServiceSessionSnapshot, any>;
