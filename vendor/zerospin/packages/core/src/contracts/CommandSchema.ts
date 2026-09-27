/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded types are invariant. */
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema, Tuple } from 'effect';

import { AdmissionResultSchema } from './AdmissionResultSchema.ts';
import { ExecutionResultSchema } from './ExecutionResultSchema.ts';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
  ISessionCommandInput,
} from './types.ts';

const positiveIndexSchema = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
);

const UnknownAggregateCommandBaseSchema = Schema.Struct({
  automationName: Schema.optionalKey(Schema.NullOr(Schema.String)),
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
    nodeId: Schema.Null,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    actorName: Schema.String,
    actorVersion: Schema.String,
    sessionName: Schema.Null,
    nodeIndex: Schema.Null,
  })(UnknownAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    nodeId: Schema.String,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    actorName: Schema.String,
    actorVersion: Schema.String,
    sessionName: Schema.String,
    nodeIndex: positiveIndexSchema,
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
  automationName: Schema.optionalKey(Schema.NullOr(Schema.String)),
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
    nodeId: Schema.Null,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    actorName: Schema.String,
    actorVersion: Schema.String,
    sessionName: Schema.Null,
    nodeIndex: Schema.Null,
  })(EncodedAggregateCommandBaseSchema),
  Schema.fieldsAssign({
    nodeId: Schema.String,
    claims: Schema.Record(Schema.String, Schema.Unknown),
    actorName: Schema.String,
    actorVersion: Schema.String,
    sessionName: Schema.String,
    nodeIndex: positiveIndexSchema,
  })(EncodedAggregateCommandBaseSchema),
]) satisfies Schema.Codec<IEncodedCommand<IAggregateCommand>, any>;

export const EncodedSessionCommandSchema = Schema.Struct({
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.String,
  payload: Schema.String,
  contractVersion: Schema.String,
  aggregateId: Schema.String,
  aggregateName: Schema.String,
  sessionId: makeAbbreviationIdSchema('sesn'),
  claims: Schema.Record(Schema.String, Schema.Unknown),
  actorName: Schema.String,
  actorVersion: Schema.String,
  sessionName: Schema.String,
  pushIndex: Schema.NullOr(positiveIndexSchema),
}) satisfies Schema.Codec<IEncodedCommand<ISessionCommandInput>, any>;

const LowercaseSha256Schema = Schema.String.check(
  Schema.isPattern(/^[a-f0-9]{64}$/u),
);
const commandResults = {
  admission: Schema.Union([
    AdmissionResultSchema.members[1],
    AdmissionResultSchema.members[2],
  ]),
  execution: ExecutionResultSchema,
  dispositionHash: Schema.NullOr(LowercaseSha256Schema),
};
export const ServiceChainedCommandSchema = Schema.fieldsAssign({
  ...commandResults,
  serviceIndex: positiveIndexSchema,
})(EncodedServiceCommandSchema);
export const AggregateChainedCommandSchema =
  EncodedAggregateCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        ...commandResults,
        aggregateIndex: positiveIndexSchema,
      }),
    ),
  );

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

/** Completed results include admission rejections without claiming execution took place. */
export const AggregateExecutedCommandSchema =
  AggregateChainedCommandSchema.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        dispositionHash: LowercaseSha256Schema,
        execution: Schema.Union([
          ExecutionResultSchema.members[1],
          ExecutionResultSchema.members[2],
          ExecutionResultSchema.members[3],
        ]),
      }),
    ),
  ).check(
    Schema.makeFilter(
      command =>
        (command.admission.status === 'failed') ===
          (command.execution.status === 'skipped') ||
        'Execution is skipped exactly when admission failed',
    ),
  );
export const ServiceExecutedCommandSchema = Schema.fieldsAssign({
  dispositionHash: LowercaseSha256Schema,
  execution: Schema.Union([
    ExecutionResultSchema.members[1],
    ExecutionResultSchema.members[2],
    ExecutionResultSchema.members[3],
  ]),
})(ServiceChainedCommandSchema).check(
  Schema.makeFilter(
    command =>
      (command.admission.status === 'failed') ===
        (command.execution.status === 'skipped') ||
      'Execution is skipped exactly when admission failed',
  ),
);
