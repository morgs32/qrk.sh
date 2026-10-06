import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import { Schema } from 'effect';

import { AdmissionResultSchema } from './AdmissionResultSchema.ts';
import { ExecutionResultSchema } from './ExecutionResultSchema.ts';
import { ServiceCallerSchema } from './ServiceCallerSchema.ts';

const position = Schema.Int.check(Schema.isGreaterThan(0));
const common = {
  id: makeAbbreviationIdSchema('cmd'),
  commandName: Schema.NonEmptyString,
  contractVersion: Schema.NonEmptyString,
  payload: Schema.String,
  response: Schema.NullOr(Schema.fromJsonString(Schema.Json)),
  admission: Schema.fromJsonString(
    Schema.Union([
      AdmissionResultSchema.members[1],
      AdmissionResultSchema.members[2],
    ]),
  ),
  execution: Schema.fromJsonString(
    Schema.Union([
      ExecutionResultSchema.members[1],
      ExecutionResultSchema.members[2],
      ExecutionResultSchema.members[3],
    ]),
  ),
  dispositionHash: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  originalExecutionVersion: Schema.NonEmptyString,
};
const aggregate = Schema.Struct({
  ...common,
  ownerKind: Schema.Literal('aggregate'),
  aggregateId: Schema.NonEmptyString,
  aggregateName: Schema.NonEmptyString,
  systemName: Schema.NonEmptyString,
  aggregateVersion: Schema.NullOr(Schema.NonEmptyString),
  actorName: Schema.NonEmptyString,
  actorVersion: Schema.NonEmptyString,
  claims: Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
  nodeId: Schema.NullOr(Schema.NonEmptyString),
  nodeIndex: Schema.NullOr(position),
  sessionName: Schema.NullOr(Schema.NonEmptyString),
  originalAggregateIndex: position,
  originalServiceIndex: Schema.Null,
  serviceName: Schema.Null,
  serviceVersion: Schema.Null,
  caller: Schema.Null,
});
const service = Schema.Struct({
  ...common,
  ownerKind: Schema.Literal('service'),
  serviceName: Schema.NonEmptyString,
  serviceVersion: Schema.NonEmptyString,
  caller: Schema.NullOr(Schema.fromJsonString(ServiceCallerSchema)),
  originalServiceIndex: position,
  originalAggregateIndex: Schema.Null,
  aggregateId: Schema.Null,
  aggregateName: Schema.Null,
  systemName: Schema.Null,
  aggregateVersion: Schema.Null,
  actorName: Schema.Null,
  actorVersion: Schema.Null,
  claims: Schema.Null,
  nodeId: Schema.Null,
  nodeIndex: Schema.Null,
  sessionName: Schema.Null,
});
const terminal = (command: {
  admission: { status: string };
  execution: { status: string };
}) =>
  (command.admission.status === 'failed') ===
    (command.execution.status === 'skipped') ||
  'Execution is skipped exactly when admission failed';
export const ExecutedAggregateCommandSchema = aggregate.check(
  Schema.makeFilter(terminal),
  Schema.makeFilter(
    command =>
      (command.nodeId === null
        ? command.nodeIndex === null &&
          command.sessionName === null &&
          command.aggregateVersion !== null
        : command.nodeIndex !== null && command.sessionName !== null) ||
      'Aggregate command provenance must retain the complete submitting context',
  ),
);
export const ExecutedServiceCommandSchema = service.check(
  Schema.makeFilter(terminal),
);
export const ExecutedCommandSchema = Schema.Union([
  ExecutedAggregateCommandSchema,
  ExecutedServiceCommandSchema,
]);
export type IExecutedAggregateCommand =
  typeof ExecutedAggregateCommandSchema.Type;
export type IExecutedServiceCommand = typeof ExecutedServiceCommandSchema.Type;
export type IExecutedCommand = typeof ExecutedCommandSchema.Type;
export type IEncodedExecutedCommand = typeof ExecutedCommandSchema.Encoded;
