/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import { Schema } from 'effect';

import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import { aggregateCommandShape } from './aggregateCommandShape.ts';
import type {
  IAggregateCommand,
  IDeploySeedCommand,
  IEncodedCommand,
  IExecutedAggregateCommand,
  IExecutedPushedCommand,
  IExecutedServiceCommand,
  IFailedAggregateCommand,
  IFailedPushedCommand,
  IFailedServiceCommand,
  IFailedStagedReplicaCommand,
  IFinalizedFailedStagedReplicaCommand,
  IPushBlock,
  IPushedCommand,
  IServiceCommand,
  IStagedReplicaCommand,
  IStagedSessionCommand,
} from './types.ts';

export const UnknownAggregateCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: Schema.String,
  commandType: Schema.Literal('aggregate'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
  sessionId: Schema.NullOr(makeAbbreviationIdSchema('sesn')),
  userId: Schema.NullOr(Schema.String),
  frontendName: Schema.NullOr(Schema.String),
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
}) satisfies Schema.Schema<IAggregateCommand, any>;

export const UnknownServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  contractVersion: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
}) satisfies Schema.Schema<IServiceCommand, any>;

export const EncodedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
}) satisfies Schema.Schema<IEncodedCommand<IServiceCommand>, any>;

export const DeploySeedCommandSchema = Schema.Union(
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
) satisfies Schema.Schema<IDeploySeedCommand, any>;

export const EncodedAggregateCommandSchema = makeEffectSchema(
  aggregateCommandShape,
) satisfies Schema.Schema<
  IEncodedCommand<IAggregateCommand>,
  IEncodedCommand<IAggregateCommand>
>;

export const StagedSessionCommandSchema: Schema.Schema<
  IEncodedCommand<IStagedSessionCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  userId: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  status: Schema.Literal('staged'),
});

export const StagedReplicaCommandSchema: Schema.Schema<
  IEncodedCommand<IStagedReplicaCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  userId: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  status: Schema.Literal('staged'),
});

export const PushedCommandSchema: Schema.Schema<
  IEncodedCommand<IPushedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  userId: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  status: Schema.Literal('pushed'),
});

export const FailedStagedReplicaCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedStagedReplicaCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  userId: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  aggregateCursor: Schema.optional(Schema.Never),
  aggregateIndex: Schema.optional(Schema.Never),
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
});

export const FinalizedFailedStagedReplicaCommandSchema: Schema.Schema<
  IEncodedCommand<IFinalizedFailedStagedReplicaCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  frontendName: Schema.String,
  userId: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  aggregateCursor: makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  aggregateIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
});

export const EncodedExecutedAggregateCommandSchema: Schema.Schema<
  IEncodedCommand<IExecutedAggregateCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('aggregate'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
  mode: Schema.Literal('authoritative', 'optimistic-lww'),
  aggregateCursor: makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  aggregateIndex: Schema.Number,
  executedAt: Schema.Date,
  status: Schema.Literal('executed'),
  sessionId: Schema.NullOr(makeAbbreviationIdSchema('sesn')),
  userId: Schema.NullOr(Schema.String),
  frontendName: Schema.NullOr(Schema.String),
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
});

export const ExecutedPushedCommandSchema: Schema.Schema<
  IEncodedCommand<IExecutedPushedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  systemName: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  userId: Schema.String,
  frontendName: Schema.String,
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  mode: Schema.Literal('authoritative', 'optimistic-lww'),
  aggregateCursor: makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  aggregateIndex: Schema.Number,
  executedAt: Schema.Date,
  status: Schema.Literal('executed'),
});

export const EncodedFailedAggregateCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedAggregateCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('aggregate'),
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  systemName: Schema.String,
  aggregateCursor: makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  aggregateIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
  sessionId: Schema.NullOr(makeAbbreviationIdSchema('sesn')),
  userId: Schema.NullOr(Schema.String),
  frontendName: Schema.NullOr(Schema.String),
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
});

export const FailedPushedCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedPushedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('frontend'),
  systemName: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  userId: Schema.String,
  frontendName: Schema.String,
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  replicaIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  aggregateCursor: makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  aggregateIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
});

export const PushBlockSchema = Schema.Struct({
  writeIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  guardedAtAggregateCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.aggregateCursor),
  ),
  pendingCommands: Schema.Array(PushedCommandSchema),
  pushedCommands: Schema.Array(PushedCommandSchema),
  executedCommands: Schema.Array(ExecutedPushedCommandSchema),
  failedStagedCommands: Schema.Array(
    Schema.Union(
      FinalizedFailedStagedReplicaCommandSchema,
      FailedStagedReplicaCommandSchema,
    ),
  ),
  failedPushedCommands: Schema.Array(FailedPushedCommandSchema),
}) satisfies Schema.Schema<IPushBlock, any>;

export const EncodedExecutedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
  mode: Schema.Literal('authoritative', 'optimistic-lww'),
  serviceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  serviceIndex: Schema.Number,
  executedAt: Schema.Date,
  status: Schema.Literal('executed'),
}) satisfies Schema.Schema<IEncodedCommand<IExecutedServiceCommand>, any>;

export const EncodedFailedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
  serviceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  serviceIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
}) satisfies Schema.Schema<IEncodedCommand<IFailedServiceCommand>, any>;
