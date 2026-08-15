import {
  EncodedAggregateCommandSchema,
  EncodedServiceCommandSchema,
  PushBlockSchema,
  StagedReplicaCommandSchema,
} from '@zerospin/core/contracts/CommandSchema';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ZerospinError } from '@zerospin/error';
import { Schema } from 'effect';

import {
  AggregateFinalizationReceiptSchema,
  ServiceFinalizationReceiptSchema,
} from '../blockSchemas.js';

export const SystemWriteOperationSchema = Schema.Literal(
  'pushCommands',
  'finalizeAggregateCommands',
  'finalizeServiceCommands',
);

export const PushCommandsSystemWriteTargetSchema = Schema.Struct({
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  userId: Schema.String,
  frontendName: Schema.String,
  aggregateFrontendLock: AggregateFrontendLockSchema,
});

export const FinalizeAggregateCommandsSystemWriteTargetSchema = Schema.Struct({
  aggregateId: Schema.String,
  aggregateName: Schema.String,
});

export const FinalizeServiceCommandsSystemWriteTargetSchema = Schema.Struct({
  serviceName: Schema.String,
});

export const SystemWriteTargetSchema = Schema.Union(
  PushCommandsSystemWriteTargetSchema,
  FinalizeAggregateCommandsSystemWriteTargetSchema,
  FinalizeServiceCommandsSystemWriteTargetSchema,
);

export const PushCommandsSystemWriteCommandsSchema = Schema.Array(
  StagedReplicaCommandSchema,
);

export const FinalizeAggregateCommandsSystemWriteCommandsSchema = Schema.Array(
  EncodedAggregateCommandSchema,
);

export const FinalizeServiceCommandsSystemWriteCommandsSchema = Schema.Array(
  EncodedServiceCommandSchema,
);

export const SystemWriteCommandsSchema = Schema.Union(
  PushCommandsSystemWriteCommandsSchema,
  FinalizeAggregateCommandsSystemWriteCommandsSchema,
  FinalizeServiceCommandsSystemWriteCommandsSchema,
);

export const PushCommandsSystemWriteResultSchema = Schema.Either({
  left: ZerospinError.schema,
  right: PushBlockSchema,
});

export const FinalizeAggregateCommandsSystemWriteResultSchema = Schema.Either({
  left: ZerospinError.schema,
  right: AggregateFinalizationReceiptSchema,
});

export const FinalizeServiceCommandsSystemWriteResultSchema = Schema.Either({
  left: ZerospinError.schema,
  right: ServiceFinalizationReceiptSchema,
});

export const SystemWriteResultSchema = Schema.Union(
  PushCommandsSystemWriteResultSchema,
  FinalizeAggregateCommandsSystemWriteResultSchema,
  FinalizeServiceCommandsSystemWriteResultSchema,
);
