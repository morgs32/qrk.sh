import { PublicFailureSchema } from '@zerospin/error';
/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { BrowserCommandSchema } from '../../contracts/BrowserCommandSchema.ts';
import { EncodedSessionCommandSchema } from '../../contracts/CommandSchema.ts';
import { EncodedResourceSchema } from '../../models/EncodedResourceSchema.ts';
import { coreAbbreviations } from '../../utils/coreAbbreviations.ts';
import { StagingResultSchema } from '../StagingResultSchema.ts';
import type {
  IAggregateActorOutput,
  IAggregateSessionSnapshot,
} from '../types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

export const AggregateActorOutputSchema = Schema.Struct({
  executedIndex: positiveIndexSchema,
  aggregateIndex: nonNegativeIndexSchema,
  executedHash: LowercaseSha256Schema,
  command: BrowserCommandSchema,
}) satisfies Schema.Codec<IAggregateActorOutput, any>;

export const SessionCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  staging: StagingResultSchema,
  failure: Schema.NullOr(PublicFailureSchema),
})(EncodedSessionCommandSchema);

export const AggregateSessionSnapshotSchema = Schema.Struct({
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  claims: Schema.Record(Schema.String, Schema.Unknown),
  aggregateName: Schema.String,
  aggregateVersion: Schema.String,
  actorName: Schema.String,
  actorVersion: Schema.String,
  sessionName: Schema.String,
  aggregateIndex: nonNegativeIndexSchema,
  executedIndex: nonNegativeIndexSchema,
  executedHash: LowercaseSha256Schema,
  resolvedThrough: nonNegativeIndexSchema,
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IAggregateSessionSnapshot, any>;
