/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema, Tuple } from 'effect';

import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  EncodedSessionCommandSchema,
} from '../contracts/CommandSchema.ts';
import { EncodedAppliedMutationSchema } from '../contracts/encodeAppliedMutation.ts';
import type { IEncodedCommand } from '../contracts/types.ts';
import { EncodedResourceSchema } from '../models/EncodedResourceSchema.ts';
import { RefSchema } from '../models/ResourceSchema.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import type {
  IAggregateFrontendFinalizedCommand,
  IAggregateFrontendPushedCommand,
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

const makeTerminalFields = {
  chainedAt: Schema.DateFromString,
};

const AggregateFrontendPushedPendingCommandSchema = Schema.fieldsAssign({
  pushIndex: positiveIndexSchema,
  ...makeTerminalFields,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedSessionCommandSchema);

const AggregateFrontendPushedSuccessfulCommandSchema = Schema.fieldsAssign({
  pushIndex: positiveIndexSchema,
  ...makeTerminalFields,
  delta: FrontendDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedSessionCommandSchema);

const AggregateFrontendPushedFailedCommandSchema = Schema.fieldsAssign({
  pushIndex: positiveIndexSchema,
  ...makeTerminalFields,
  delta: EmptyFrontendDeltaSchema,
  failedAt: Schema.DateFromString,
  failure: EncodedZerospinErrorSchema,
})(EncodedSessionCommandSchema);

export const AggregateFrontendPushedCommandSchema = Schema.Union([
  AggregateFrontendPushedPendingCommandSchema,
  AggregateFrontendPushedSuccessfulCommandSchema,
  AggregateFrontendPushedFailedCommandSchema,
]) satisfies Schema.Codec<
  IEncodedCommand<IAggregateFrontendPushedCommand>,
  any
>;

const aggregateFrontendFinalizedFields = {
  aggregateIndex: positiveIndexSchema,
  frontendIndex: positiveIndexSchema,
  ...makeTerminalFields,
};

const derivedAggregateFrontendFinalizedFields = {
  serviceIndex: positiveIndexSchema,
  ...aggregateFrontendFinalizedFields,
};

const AggregateFrontendFinalizedPendingCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...aggregateFrontendFinalizedFields,
        delta: Schema.Null,
        failedAt: Schema.Null,
        failure: Schema.Null,
      }),
    ),
  );

const AggregateFrontendFinalizedSuccessfulCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...aggregateFrontendFinalizedFields,
        delta: FrontendDeltaSchema,
        failedAt: Schema.Null,
        failure: Schema.Null,
      }),
    ),
  );

const AggregateFrontendFinalizedFailedCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...aggregateFrontendFinalizedFields,
        delta: EmptyFrontendDeltaSchema,
        failedAt: Schema.DateFromString,
        failure: EncodedZerospinErrorSchema,
      }),
    ),
  );

const DerivedAggregateFrontendFinalizedPendingCommandSchema =
  Schema.fieldsAssign({
    ...derivedAggregateFrontendFinalizedFields,
    delta: Schema.Null,
    failedAt: Schema.Null,
    failure: Schema.Null,
  })(EncodedServiceCommandSchema);

const DerivedAggregateFrontendFinalizedSuccessfulCommandSchema =
  Schema.fieldsAssign({
    ...derivedAggregateFrontendFinalizedFields,
    delta: FrontendDeltaSchema,
    failedAt: Schema.Null,
    failure: Schema.Null,
  })(EncodedServiceCommandSchema);

const DerivedAggregateFrontendFinalizedFailedCommandSchema =
  Schema.fieldsAssign({
    ...derivedAggregateFrontendFinalizedFields,
    delta: EmptyFrontendDeltaSchema,
    failedAt: Schema.DateFromString,
    failure: EncodedZerospinErrorSchema,
  })(EncodedServiceCommandSchema);

export const AggregateFrontendFinalizedCommandSchema = Schema.Union([
  ...AggregateFrontendFinalizedPendingCommandSchema.members,
  ...AggregateFrontendFinalizedSuccessfulCommandSchema.members,
  ...AggregateFrontendFinalizedFailedCommandSchema.members,
  DerivedAggregateFrontendFinalizedPendingCommandSchema,
  DerivedAggregateFrontendFinalizedSuccessfulCommandSchema,
  DerivedAggregateFrontendFinalizedFailedCommandSchema,
]) satisfies Schema.Codec<
  IEncodedCommand<IAggregateFrontendFinalizedCommand>,
  any
>;

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
  AggregateFrontendPushedCommandSchema,
  AggregateFrontendFinalizedCommandSchema,
]);

export const AggregateFrontendSyncStateSchema = Schema.Struct({
  aggregateId: makeAbbreviationIdSchema(coreAbbreviations.aggregate),
  userId: Schema.NonEmptyString,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  systemVersion: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  aggregateIndex: nonNegativeIndexSchema,
  frontendIndex: nonNegativeIndexSchema,
  pushIndex: nonNegativeIndexSchema,
  resolvedPushIndexes: Schema.Array(positiveIndexSchema),
  resources: Schema.Array(EncodedResourceSchema),
}) satisfies Schema.Codec<IAggregateFrontendSyncState, any>;
