/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { ZerospinError } from '@zerospin/error';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema, Tuple } from 'effect';

import {
  EmptyResourceDeltaSchema,
  ResourceDeltaSchema,
} from '../models/ResourceDeltaSchema.ts';
import type { IResourceDelta } from '../models/types.ts';

import type {
  IAggregateCommand,
  IChainedCommand,
  IEncodedCommand,
  ISeedCommand,
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
    sessionId: Schema.Null,
    userId: Schema.Null,
    frontendName: Schema.Null,
    pushIndex: Schema.Null,
  })(UnknownAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    sessionId: makeAbbreviationIdSchema('sesn'),
    userId: Schema.String,
    frontendName: Schema.String,
    pushIndex: positiveIndexSchema,
  })(UnknownAggregateCommandBaseSchema),
]) satisfies Schema.Codec<IAggregateCommand, any>;

export const UnknownServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: Schema.String,
  serviceName: Schema.String,
}) satisfies Schema.Codec<IServiceCommand, any>;

export const EncodedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  serviceName: Schema.String,
}) satisfies Schema.Codec<IEncodedCommand<IServiceCommand>, any>;

export const SeedCommandSchema = Schema.Union([
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
]) satisfies Schema.Codec<ISeedCommand, any>;

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
    sessionId: Schema.Null,
    userId: Schema.Null,
    frontendName: Schema.Null,
    pushIndex: Schema.Null,
  })(EncodedAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    sessionId: makeAbbreviationIdSchema('sesn'),
    userId: Schema.String,
    frontendName: Schema.String,
    pushIndex: positiveIndexSchema,
  })(EncodedAggregateCommandBaseSchema),
]) satisfies Schema.Codec<
  IEncodedCommand<IAggregateCommand>,
  any
>;

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

const ServicePendingCommandSchema = Schema.fieldsAssign({
  ...serviceChainFields,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceSuccessfulCommandSchema = Schema.fieldsAssign({
  ...serviceChainFields,
  delta: ResourceDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const ServiceFailedCommandSchema = Schema.fieldsAssign({
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

const derivedAggregateChainFields = {
  aggregateIndex: positiveIndexSchema,
  serviceIndex: positiveIndexSchema,
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
      }),
    ),
  );

const DirectAggregateSuccessfulCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...directAggregateChainFields,
        delta: ResourceDeltaSchema,
        failedAt: Schema.Null,
        failure: Schema.Null,
      }),
    ),
  );

const DirectAggregateFailedCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...directAggregateChainFields,
        delta: EmptyResourceDeltaSchema,
        failedAt: Schema.DateFromString,
        failure: EncodedZerospinErrorSchema,
      }),
    ),
  );

const DerivedAggregatePendingCommandSchema = Schema.fieldsAssign({
  ...derivedAggregateChainFields,
  delta: Schema.Null,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const DerivedAggregateSuccessfulCommandSchema = Schema.fieldsAssign({
  ...derivedAggregateChainFields,
  delta: ResourceDeltaSchema,
  failedAt: Schema.Null,
  failure: Schema.Null,
})(EncodedServiceCommandSchema);

const DerivedAggregateFailedCommandSchema = Schema.fieldsAssign({
  ...derivedAggregateChainFields,
  delta: EmptyResourceDeltaSchema,
  failedAt: Schema.DateFromString,
  failure: EncodedZerospinErrorSchema,
})(EncodedServiceCommandSchema);

export const AggregateChainedCommandSchema = Schema.Union([
  ...DirectAggregatePendingCommandSchema.members,
  ...DirectAggregateSuccessfulCommandSchema.members,
  ...DirectAggregateFailedCommandSchema.members,
  DerivedAggregatePendingCommandSchema,
  DerivedAggregateSuccessfulCommandSchema,
  DerivedAggregateFailedCommandSchema,
]) satisfies Schema.Codec<
  | IEncodedCommand<
      IChainedCommand<IAggregateCommand, IResourceDelta> &
        Readonly<{ aggregateIndex: number }>
    >
  | IEncodedCommand<
      IChainedCommand<IServiceCommand, IResourceDelta> &
        Readonly<{ aggregateIndex: number; serviceIndex: number }>
    >,
  any
>;
