/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema, Tuple } from 'effect';

import {
  EmptyResourceDeltaSchema,
  ResourceDeltaSchema,
} from '../models/ResourceDeltaSchema.ts';
import type { IResourceDelta } from '../models/types.ts';

import { EncodedMutationSchema } from './encodeAppliedMutation.ts';
import type {
  IAggregateCommand,
  IChainedCommand,
  IEncodedCommand,
  IServiceCommand,
  ISessionCommand,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const EncodedZerospinErrorSchema = Schema.toEncoded(ZerospinError.schema);

const UnknownAggregateCommandBaseSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
});

export const UnknownAggregateCommandSchema = Schema.Union([
  Schema.fieldsAssign({
    aggregateVersion: Schema.String,
    sessionId: Schema.Null,
    userId: Schema.Null,
    frontendName: Schema.Null,
    pushIndex: Schema.Null,
  })(UnknownAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    sessionId: makeAbbreviationIdSchema('sesn'),
    userId: Schema.String,
    frontendName: Schema.String,
    pushIndex: Schema.NullOr(positiveIndexSchema),
  })(UnknownAggregateCommandBaseSchema),
]) satisfies Schema.Codec<IAggregateCommand, any>;

export const UnknownServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String,
}) satisfies Schema.Codec<IServiceCommand, any>;

export const EncodedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  serviceName: Schema.String,
  serviceVersion: Schema.String,
}) satisfies Schema.Codec<IEncodedCommand<IServiceCommand>, any>;

const EncodedAggregateCommandBaseSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
});

export const EncodedAggregateCommandSchema = Schema.Union([
  Schema.fieldsAssign({
    aggregateVersion: Schema.String,
    sessionId: Schema.Null,
    userId: Schema.Null,
    frontendName: Schema.Null,
    pushIndex: Schema.Null,
  })(EncodedAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    sessionId: makeAbbreviationIdSchema('sesn'),
    userId: Schema.String,
    frontendName: Schema.String,
    pushIndex: Schema.NullOr(positiveIndexSchema),
  })(EncodedAggregateCommandBaseSchema),
]) satisfies Schema.Codec<IEncodedCommand<IAggregateCommand>, any>;

export const EncodedSessionCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  userId: Schema.String,
  frontendName: Schema.String,
  pushIndex: Schema.NullOr(positiveIndexSchema),
}) satisfies Schema.Codec<IEncodedCommand<ISessionCommand>, any>;

const chainedFields = {
  chainedAt: Schema.DateFromString,
};

const serviceChainFields = {
  serviceIndex: positiveIndexSchema,
  ...chainedFields,
};

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);

const ServicePendingCommandSchema = Schema.fieldsAssign({
  dispositionHash: Schema.Null,
  ...serviceChainFields,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceSuccessfulCommandSchema = Schema.fieldsAssign({
  dispositionHash: LowercaseSha256Schema,
  ...serviceChainFields,
  delta: ResourceDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceFailedCommandSchema = Schema.fieldsAssign({
  dispositionHash: LowercaseSha256Schema,
  ...serviceChainFields,
  delta: EmptyResourceDeltaSchema,
  failedAt: Schema.DateFromString,
  failure: EncodedZerospinErrorSchema,
})(EncodedServiceCommandSchema);

export const ServiceChainedCommandSchema = Schema.Union([
  ServicePendingCommandSchema,
  ServiceSuccessfulCommandSchema,
  ServiceFailedCommandSchema,
]) satisfies Schema.Codec<
  IEncodedCommand<
    IChainedCommand<IServiceCommand, IResourceDelta> &
      Readonly<{ serviceIndex: number }>
  >,
  any
>;

const directAggregateChainFields = {
  aggregateIndex: positiveIndexSchema,
  ...chainedFields,
};

const DirectAggregatePendingCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...directAggregateChainFields,
        delta: Schema.Null,
        failedAt: Schema.Null,
        failure: Schema.Null,
        dispositionHash: Schema.Null,
      }),
    ),
  );

const DirectAggregateSuccessfulCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...directAggregateChainFields,
        delta: Schema.Null,
        failedAt: Schema.Null,
        failure: Schema.Null,
        dispositionHash: LowercaseSha256Schema,
      }),
    ),
  );

const DirectAggregateFailedCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...directAggregateChainFields,
        delta: Schema.Null,
        failedAt: Schema.DateFromString,
        failure: EncodedZerospinErrorSchema,
        dispositionHash: LowercaseSha256Schema,
      }),
    ),
  );

export const AggregateChainedCommandSchema = Schema.Union([
  ...DirectAggregatePendingCommandSchema.members,
  ...DirectAggregateSuccessfulCommandSchema.members,
  ...DirectAggregateFailedCommandSchema.members,
]) satisfies Schema.Codec<
  IEncodedCommand<
    IChainedCommand<IAggregateCommand, IResourceDelta | null> &
      Readonly<{ aggregateIndex: number }>
  > &
    Readonly<{ dispositionHash: string | null }>,
  any
>;

/** Authoritative replication copy read by a version-owned materializer. */
export const ReplicatedResourceMutationSchema = Schema.Struct({
  modelName: Schema.String,
  modelVersion: Schema.String,
  operationName: Schema.Literal('replicate'),
  resourceId: Schema.String,
  operation: Schema.Struct({
    serviceName: Schema.String,
    serviceVersion: Schema.String,
    serviceIndex: Schema.Number,
    resource: Schema.Unknown,
  }),
});

export const AggregateExecutionEntrySchema = Schema.Struct({
  sourceCommand: Schema.String,
  command: AggregateChainedCommandSchema,
  mutations: Schema.Array(EncodedMutationSchema),
  preparationVersion: Schema.String,
  executionTimestamp: Schema.DateFromString,
});

/** Version-owned service execution, retained after the producer outbox is deleted. */
export const ServiceExecutionEntrySchema = Schema.Struct({
  sourceCommand: Schema.String,
  command: ServiceChainedCommandSchema,
  mutations: Schema.Array(EncodedMutationSchema),
  preparationVersion: Schema.String,
  executionTimestamp: Schema.DateFromString,
});
