/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant; any is intentional for satisfies */
import { Schema } from 'effect';

import { makeAbbreviationIdSchema } from '../models/makeIdSchema.ts';
import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { coreAbbreviations } from '../utils/coreAbbreviations.ts';

import { accountCommandShape } from './accountCommandShape.ts';
import type {
  IAccountCommand,
  IDeploySeedCommand,
  IEncodedCommand,
  IExecutedAccountCommand,
  IExecutedPushedCommand,
  IExecutedServiceCommand,
  IFailedAccountCommand,
  IFailedPushedCommand,
  IFailedServiceCommand,
  IFailedStagedCommand,
  IPushedBlock,
  IPushedCommand,
  IServiceCommand,
  IStagedCommand,
} from './types.ts';

export const UnknownCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  version: Schema.String,
  commandType: Schema.Literal('account'),
  accountId: Schema.String,
  accountName: Schema.String,
  systemName: Schema.String,
  systemVersion: Schema.String,
  sessionId: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema('sesn')),
    { default: () => null },
  ),
  actorId: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  actorName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  frontendName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  pushedCursor: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.pushedCursor)),
    { default: () => null },
  ),
}) satisfies Schema.Schema<IAccountCommand, any>;

export const UnknownServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.Unknown,
  version: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
  systemVersion: Schema.String,
}) satisfies Schema.Schema<IServiceCommand, any>;

export const DeploySeedCommandSchema = Schema.Union(
  UnknownCommandSchema,
  UnknownServiceCommandSchema,
) satisfies Schema.Schema<IDeploySeedCommand, any>;

export const AccountCommandSchema = makeEffectSchema(
  accountCommandShape,
) satisfies Schema.Schema<
  IEncodedCommand<IAccountCommand>,
  IEncodedCommand<IAccountCommand>
>;

export const EncodedAccountCommandSchema = AccountCommandSchema;

export const StagedCommandSchema: Schema.Schema<
  IEncodedCommand<IStagedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  systemVersion: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('frontend'),
  accountId: Schema.String,
  accountName: Schema.String,
  frontendName: Schema.String,
  actorId: Schema.String,
  actorName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
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
  systemVersion: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('frontend'),
  accountId: Schema.String,
  accountName: Schema.String,
  frontendName: Schema.String,
  actorId: Schema.String,
  actorName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  status: Schema.Literal('pushed'),
});

export const FailedStagedCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedStagedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  systemName: Schema.String,
  systemVersion: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('frontend'),
  accountId: Schema.String,
  accountName: Schema.String,
  frontendName: Schema.String,
  actorId: Schema.String,
  actorName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  ),
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
});

export const PushedBlockSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('pblk'),
  sessionId: makeAbbreviationIdSchema('sesn'),
  admissionLastAccountCursor: Schema.NullOr(
    makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  ),
  commands: Schema.Array(PushedCommandSchema),
}) satisfies Schema.Schema<IPushedBlock, any>;

export const EncodedExecutedAccountCommandSchema: Schema.Schema<
  IEncodedCommand<IExecutedAccountCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('account'),
  accountId: Schema.String,
  accountName: Schema.String,
  systemName: Schema.String,
  systemVersion: Schema.String,
  mode: Schema.Literal('authoritative', 'optimistic-lww'),
  accountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  accountIndex: Schema.Number,
  executedAt: Schema.Date,
  status: Schema.Literal('executed'),
  sessionId: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema('sesn')),
    { default: () => null },
  ),
  actorId: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  actorName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  frontendName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  pushedCursor: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.pushedCursor)),
    { default: () => null },
  ),
});

export const ExecutedPushedCommandSchema: Schema.Schema<
  IEncodedCommand<IExecutedPushedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('frontend'),
  systemName: Schema.String,
  systemVersion: Schema.String,
  accountId: Schema.String,
  accountName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  actorId: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  mode: Schema.Literal('authoritative', 'optimistic-lww'),
  accountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  accountIndex: Schema.Number,
  executedAt: Schema.Date,
  status: Schema.Literal('executed'),
});

export const EncodedFailedAccountCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedAccountCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('account'),
  accountId: Schema.String,
  accountName: Schema.String,
  systemName: Schema.String,
  systemVersion: Schema.String,
  accountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  accountIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
  sessionId: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema('sesn')),
    { default: () => null },
  ),
  actorId: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  actorName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  frontendName: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  pushedCursor: Schema.optionalWith(
    Schema.NullOr(makeAbbreviationIdSchema(coreAbbreviations.pushedCursor)),
    { default: () => null },
  ),
});

export const FailedPushedCommandSchema: Schema.Schema<
  IEncodedCommand<IFailedPushedCommand>,
  any
> = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('frontend'),
  systemName: Schema.String,
  systemVersion: Schema.String,
  accountId: Schema.String,
  accountName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  actorId: Schema.String,
  actorName: Schema.String,
  frontendName: Schema.String,
  stagedCursor: makeAbbreviationIdSchema(coreAbbreviations.stagedCursor),
  stagedAt: Schema.Date,
  pushedAt: Schema.Date,
  pushedCursor: makeAbbreviationIdSchema(coreAbbreviations.pushedCursor),
  accountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  accountIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
});

export const EncodedExecutedServiceCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  version: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
  systemVersion: Schema.String,
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
  version: Schema.String,
  commandType: Schema.Literal('service'),
  serviceName: Schema.String,
  systemVersion: Schema.String,
  serviceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  serviceIndex: Schema.Number,
  failedAt: Schema.Date,
  failure: Schema.String,
  status: Schema.Literal('failed'),
}) satisfies Schema.Schema<IEncodedCommand<IFailedServiceCommand>, any>;
