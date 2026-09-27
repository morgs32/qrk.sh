/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

import { AdmissionResultSchema } from '../../contracts/AdmissionResultSchema.ts';
import { EncodedSessionCommandSchema } from '../../contracts/CommandSchema.ts';
import { ExecutionSummarySchema } from '../../contracts/ExecutionSummarySchema.ts';
import { EncodedResourceSchema } from '../../models/EncodedResourceSchema.ts';
import { coreAbbreviations } from '../../utils/coreAbbreviations.ts';
import { StagingResultSchema } from '../StagingResultSchema.ts';
import type {
  IActorDelta,
  IAggregateActorCommand,
  IAggregateSessionSnapshot,
} from '../types.ts';

import { RefSchema } from './ResourceSchema/ResourceSchema.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const nonNegativeIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const ActorDeltaSchema: Schema.Codec<IActorDelta, any> = Schema.Struct({
  upserted: Schema.Array(EncodedResourceSchema),
  deleted: Schema.Array(RefSchema),
});

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

export const AggregateActorCommandSchema = Schema.Struct({
  nodeId: Schema.NullOr(Schema.String),
  nodeIndex: Schema.NullOr(positiveIndexSchema),
  id: makeAbbreviationIdSchema('cmd'),
  executedIndex: positiveIndexSchema,
  aggregateIndex: nonNegativeIndexSchema,
  actorDelta: ActorDeltaSchema,
  admission: Schema.NullOr(AdmissionResultSchema),
  execution: Schema.NullOr(ExecutionSummarySchema),
  executedHash: LowercaseSha256Schema,
}).check(
  Schema.makeFilter(command => {
    if (command.admission === null || command.execution === null) {
      return (
        (command.admission === null && command.execution === null) ||
        'Private operation results must be exposed together'
      );
    }
    if (command.admission.status === 'failed') {
      return (
        (command.execution.status === 'skipped' &&
          command.execution.reason === 'admission-failed') ||
        'Admission rejection skips execution'
      );
    }
    return (
      (command.admission.status === 'succeeded' &&
        (command.execution.status === 'succeeded' ||
          command.execution.status === 'failed')) ||
      'Actor commands require completed server results'
    );
  }),
) satisfies Schema.Codec<IAggregateActorCommand, any>;

export const SessionCommandSchema = Schema.fieldsAssign({
  sessionIndex: positiveIndexSchema,
  staging: StagingResultSchema,
  admission: AdmissionResultSchema,
  execution: ExecutionSummarySchema,
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
