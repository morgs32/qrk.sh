/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import {
  AggregateChainedCommandSchema,
  AggregateExecutionEntrySchema,
  EncodedSessionCommandSchema,
} from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendSyncState,
  IFrontendDelta,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

const EncodedZerospinErrorSchema = Schema.toEncoded(ZerospinError.schema);

export const FrontendDeltaSchema: Schema.Codec<IFrontendDelta, any> =
  Schema.Struct({
    inserted: Schema.Array(EncodedResourceSchema),
    updated: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
    mutations: Schema.Array(EncodedAppliedMutationSchema),
  });

const EmptyFrontendDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  updated: Schema.Array(EncodedResourceSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
  deleted: Schema.Array(RefSchema).check(Schema.isLengthBetween(0, 0)),
  mutations: Schema.Array(EncodedAppliedMutationSchema).check(
    Schema.isLengthBetween(0, 0),
  ),
});

export const AggregateFrontendFinalizedCommandSchema = Schema.Struct({
  userIndex: positiveIndexSchema,
  aggregateIndex: nonNegativeIndexSchema,
  delta: FrontendDeltaSchema,
  resolution: Schema.NullOr(AggregateExecutionEntrySchema),
}) satisfies Schema.Codec<IAggregateFrontendFinalizedCommand, any>;

const SessionPendingCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  chainedAt: Schema.DateFromString,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
  pushIndex: Schema.Null,
})(EncodedSessionCommandSchema);

const SessionSuccessfulCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  chainedAt: Schema.DateFromString,
  delta: FrontendDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
  pushIndex: Schema.Null,
})(EncodedSessionCommandSchema);

const SessionFailedCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  chainedAt: Schema.DateFromString,
  delta: EmptyFrontendDeltaSchema,
  failedAt: Schema.DateFromString,
  failure: EncodedZerospinErrorSchema,
  pushIndex: Schema.Null,
})(EncodedSessionCommandSchema);

export const SessionCommandSchema = Schema.Union([
  SessionPendingCommandSchema,
  SessionSuccessfulCommandSchema,
  SessionFailedCommandSchema,
]);

export const AggregateFrontendJournalCommandSchema = Schema.Union([
  SessionCommandSchema,
  AggregateChainedCommandSchema,
  AggregateFrontendFinalizedCommandSchema,
]);

export const AggregateFrontendSyncStateSchema = Schema.Struct({
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  userId: Schema.NonEmptyString,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  aggregateName: Schema.String,
  aggregateVersion: Schema.String,
  resolutions: Schema.Array(AggregateExecutionEntrySchema),
  frontendName: Schema.String,
  aggregateIndex: nonNegativeIndexSchema,
  userIndex: nonNegativeIndexSchema,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IAggregateFrontendSyncState, any>;
