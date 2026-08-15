/*
 * System-worker annotation:
 * Defines the block JSON schemas shared by the ledger pipeline.
 * These shapes are the durable storage and RPC contract for aggregate,
 * service, and frontend blocks.
 */

/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type is invariant */
import {
  EncodedExecutedAggregateCommandSchema,
  EncodedExecutedServiceCommandSchema,
  EncodedFailedAggregateCommandSchema,
  EncodedFailedServiceCommandSchema,
  ExecutedPushedCommandSchema,
  FinalizedFailedStagedReplicaCommandSchema,
  FailedPushedCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { EncodedAppliedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { Schema } from 'effect';

import type { IAggregateBlock, IServiceBlock } from './types.js';

export const AggregateFinalizationReceiptSchema = Schema.Struct({
  executedCommands: Schema.Array(EncodedExecutedAggregateCommandSchema),
  failedCommands: Schema.Array(EncodedFailedAggregateCommandSchema),
  appliedMutations: Schema.Array(EncodedAppliedMutationSchema),
  lastAggregateCursor: makeAbbreviationIdSchema(
    coreAbbreviations.aggregateCursor,
  ),
  aggregateIndex: Schema.Number,
});

export const ServiceFinalizationReceiptSchema = Schema.Struct({
  executedCommands: Schema.Array(EncodedExecutedServiceCommandSchema),
  failedCommands: Schema.Array(EncodedFailedServiceCommandSchema),
});

export const AggregateBlockSchema = Schema.Struct({
  writeIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  executedCommands: Schema.Array(
    Schema.Union(
      EncodedExecutedAggregateCommandSchema,
      ExecutedPushedCommandSchema,
    ),
  ),
  failedCommands: Schema.Array(
    Schema.Union(
      EncodedFailedAggregateCommandSchema,
      FinalizedFailedStagedReplicaCommandSchema,
      FailedPushedCommandSchema,
    ),
  ),
  appliedMutations: Schema.Array(EncodedAppliedMutationSchema),
  lastAggregateCursor: makeAbbreviationIdSchema(
    coreAbbreviations.aggregateCursor,
  ),
  aggregateIndex: Schema.Number,
}) satisfies Schema.Schema<IAggregateBlock, any>;

export const ServiceBlockSchema = Schema.Struct({
  writeIndex: Schema.Number.pipe(Schema.int(), Schema.positive()),
  executedCommands: Schema.Array(EncodedExecutedServiceCommandSchema),
  failedCommands: Schema.Array(EncodedFailedServiceCommandSchema),
  appliedMutations: Schema.Array(EncodedAppliedMutationSchema),
  lastServiceCursor: makeAbbreviationIdSchema(coreAbbreviations.serviceCursor),
  serviceIndex: Schema.Number,
}) satisfies Schema.Schema<IServiceBlock, any>;
