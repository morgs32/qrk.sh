/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { EncodedSessionCommandSchema } from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IAggregateFrontendSnapshot,
  IAggregateSelectedCommand,
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
    upserted: Schema.Array(EncodedResourceSchema),
    deleted: Schema.Array(RefSchema),
  });

const SessionDeltaSchema = Schema.Struct({
  inserted: Schema.Array(EncodedResourceSchema),
  updated: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(RefSchema),
  mutations: Schema.Array(EncodedAppliedMutationSchema),
});

const EmptySessionDeltaSchema = Schema.Struct({
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

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

export const AggregateSelectedCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  selectionIndex: positiveIndexSchema,
  aggregateIndex: nonNegativeIndexSchema,
  delta: FrontendDeltaSchema,
  failure: Schema.NullOr(EncodedZerospinErrorSchema),
  selectionHash: LowercaseSha256Schema,
}) satisfies Schema.Codec<IAggregateSelectedCommand, any>;

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
  delta: SessionDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
  pushIndex: Schema.Null,
})(EncodedSessionCommandSchema);

const SessionFailedCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  chainedAt: Schema.DateFromString,
  delta: EmptySessionDeltaSchema,
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
  AggregateSelectedCommandSchema,
]);

export const AggregateFrontendSnapshotSchema = Schema.Struct({
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  authentication: Schema.Record(Schema.String, Schema.Unknown),
  aggregateName: Schema.String,
  aggregateVersion: Schema.String,
  frontendName: Schema.String,
  aggregateIndex: nonNegativeIndexSchema,
  selectionIndex: nonNegativeIndexSchema,
  selectionHash: LowercaseSha256Schema,
  selectedCommands: Schema.Array(AggregateSelectedCommandSchema),
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IAggregateFrontendSnapshot, any>;
