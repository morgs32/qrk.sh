/*
 * System-worker annotation:
 * Defines the block JSON schemas shared by the ledger pipeline.
 * These shapes are the durable storage and RPC contract for finalized, actor,
 * and frontend blocks.
 */

/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant */
import {
  EncodedExecutedAccountCommandSchema,
  EncodedExecutedServiceCommandSchema,
  EncodedFailedAccountCommandSchema,
  EncodedFailedServiceCommandSchema,
  ExecutedPushedCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { EncodedResourceSchema } from '@zerospin/core/models/EncodedResourceSchema';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { RefSchema } from '@zerospin/core/models/ResourceSchema';
import type { IRefRecord } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { Schema } from 'effect';

import type {
  IAccountBlock,
  IActorBlock,
  IActorDelta,
  IServiceBlock,
} from './types.js';

export const RefRecordSchema = Schema.Record({
  key: Schema.String,
  value: RefSchema,
}) satisfies Schema.Schema<IRefRecord, any>;

export const ActorDeltaSchema: Schema.Schema<IActorDelta, any> = Schema.Struct({
  inserted: Schema.Record({
    key: Schema.String,
    value: EncodedResourceSchema,
  }),
  deleted: RefRecordSchema,
});

export const AccountBlockSchema = Schema.Struct({
  pushedBlockId: Schema.NullOr(makeAbbreviationIdSchema('pblk')),
  executedCommands: Schema.Array(
    Schema.Union(
      EncodedExecutedAccountCommandSchema,
      ExecutedPushedCommandSchema,
    ),
  ),
  failedCommands: Schema.Array(
    Schema.Union(EncodedFailedAccountCommandSchema, FailedPushedCommandSchema),
  ),
  appliedMutations: Schema.Array(EncodedAppliedMutationSchema),
  lastAccountCursor: makeAbbreviationIdSchema(coreAbbreviations.accountCursor),
  accountIndex: Schema.Number,
}) satisfies Schema.Schema<IAccountBlock, any>;

export const ActorBlockSchema = Schema.extend(
  AccountBlockSchema,
  Schema.Struct({
    deltas: Schema.Record({
      key: Schema.String,
      value: ActorDeltaSchema,
    }),
  }),
) satisfies Schema.Schema<IActorBlock, any>;

export const ServiceBlockSchema = Schema.Struct({
  executedCommands: Schema.Array(EncodedExecutedServiceCommandSchema),
  failedCommands: Schema.Array(EncodedFailedServiceCommandSchema),
  appliedMutations: Schema.Array(EncodedAppliedMutationSchema),
  lastServiceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  serviceIndex: Schema.Number,
}) satisfies Schema.Schema<IServiceBlock, any>;
