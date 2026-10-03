import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import {
  ExecutedCommandSchema,
  type IEncodedExecutedCommand,
} from '@zerospin/core/contracts/ExecutedCommandSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { mapParseError } from '@zerospin/error';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import type { aggregateVersionChainDbConfig } from './AggregateVersionChain/aggregateVersionChainDbConfig.js';
import type { serviceVersionRepoDbConfig } from './ServiceVersionRepo/serviceVersionRepoDbConfig.js';

/** Original command fields; receiving positions and application state stay separate. */
export const forwardedCommandShape = {
  id: primitives.text(),
  commandName: primitives.text(),
  payload: primitives.text(),
  asyncInput: primitives.json({
    schema: AsyncCommandInputSchema,
    nullable: true,
  }),
  contractVersion: primitives.text(),
  ownerKind: primitives.enum({ values: ['aggregate', 'service'] }),
  aggregateId: primitives.text({ nullable: true }),
  aggregateName: primitives.text({ nullable: true }),
  aggregateVersion: primitives.text({ nullable: true }),
  systemName: primitives.text({ nullable: true }),
  actorName: primitives.text({ nullable: true }),
  actorVersion: primitives.text({ nullable: true }),
  claims: primitives.json({
    schema: Schema.Record(Schema.String, Schema.Unknown),
    nullable: true,
  }),
  nodeId: primitives.text({ nullable: true }),
  nodeIndex: primitives.integer({ nullable: true }),
  sessionName: primitives.text({ nullable: true }),
  serviceName: primitives.text({ nullable: true }),
  serviceVersion: primitives.text({ nullable: true }),
  caller: primitives.json({ schema: ServiceCallerSchema, nullable: true }),
  originalAggregateIndex: primitives.integer({ nullable: true }),
  originalServiceIndex: primitives.integer({ nullable: true }),
  originalExecutionVersion: primitives.text({ nullable: true }),
  admission: primitives.json({ schema: AdmissionResultSchema }),
  execution: primitives.json({ schema: ExecutionResultSchema }),
  dispositionHash: primitives.text({ nullable: true }),
};

type IOriginalAggregateRow =
  typeof aggregateVersionChainDbConfig.schema.aggregateCommands.$inferSelect;
type IOriginalServiceRow =
  typeof serviceVersionRepoDbConfig.schema.commands.$inferSelect;
type IOriginalAggregateCommand = Omit<
  IOriginalAggregateRow,
  | 'lastDeliveryFailure'
  | 'executedIndex'
  | 'executionVersion'
  | 'originalExecutionVersion'
> & {
  executionVersion: string;
  originalExecutionVersion?: string;
  executedIndex?: number;
};
type IOriginalServiceCommand = Omit<IOriginalServiceRow, 'executedIndex'> & {
  executedIndex?: number;
};
export type IExecutedCommandSource =
  | IOriginalAggregateCommand
  | IOriginalServiceCommand
  | IEncodedExecutedCommand
  | Pick<
      typeof serviceVersionRepoDbConfig.schema.executedCommandOutbox.$inferSelect,
      keyof typeof forwardedCommandShape
    >;

/** Copy encoded fields directly; never serialize or re-author the enclosing command. */
function commandFields(command: IExecutedCommandSource) {
  return {
    id: command.id,
    commandName: command.commandName,
    payload: command.payload,
    asyncInput: command.asyncInput ?? null,
    contractVersion: command.contractVersion,
    ownerKind:
      ('ownerKind' in command ? command.ownerKind : undefined) ??
      (('serviceName' in command ? command.serviceName : undefined) == null
        ? 'aggregate'
        : 'service'),
    aggregateId:
      ('aggregateId' in command ? command.aggregateId : undefined) ?? null,
    aggregateName:
      ('aggregateName' in command ? command.aggregateName : undefined) ?? null,
    aggregateVersion:
      ('aggregateVersion' in command ? command.aggregateVersion : undefined) ??
      null,
    systemName:
      ('systemName' in command ? command.systemName : undefined) ?? null,
    actorName: ('actorName' in command ? command.actorName : undefined) ?? null,
    actorVersion:
      ('actorVersion' in command ? command.actorVersion : undefined) ?? null,
    claims: ('claims' in command ? command.claims : undefined) ?? null,
    nodeId: ('nodeId' in command ? command.nodeId : undefined) ?? null,
    nodeIndex: ('nodeIndex' in command ? command.nodeIndex : undefined) ?? null,
    sessionName:
      ('sessionName' in command ? command.sessionName : undefined) ?? null,
    serviceName:
      ('serviceName' in command ? command.serviceName : undefined) ?? null,
    serviceVersion:
      ('serviceVersion' in command ? command.serviceVersion : undefined) ??
      null,
    caller: ('caller' in command ? command.caller : undefined) ?? null,
    originalAggregateIndex:
      ('ownerKind' in command ? command.ownerKind : undefined) === undefined
        ? (('aggregateIndex' in command ? command.aggregateIndex : undefined) ??
          null)
        : (('originalAggregateIndex' in command
            ? command.originalAggregateIndex
            : undefined) ?? null),
    originalServiceIndex:
      ('ownerKind' in command ? command.ownerKind : undefined) === undefined
        ? (('serviceIndex' in command ? command.serviceIndex : undefined) ??
          null)
        : (('originalServiceIndex' in command
            ? command.originalServiceIndex
            : undefined) ?? null),
    originalExecutionVersion:
      ('originalExecutionVersion' in command
        ? command.originalExecutionVersion
        : undefined) ??
      ('executionVersion' in command ? command.executionVersion : undefined) ??
      null,
    admission: command.admission,
    execution: command.execution,
    dispositionHash: command.dispositionHash,
  };
}

export function forwardCommand(command: IExecutedCommandSource) {
  return Schema.decodeUnknownSync(Schema.toEncoded(ExecutedCommandSchema))(
    commandFields(command),
  );
}

/** Decode terminal owner-specific provenance at every retained delivery boundary. */
export const validateForwardedCommand = Effect.fn('validateForwardedCommand')(
  function* (input: IExecutedCommandSource) {
    yield* Schema.decodeUnknownEffect(ExecutedCommandSchema)(
      commandFields(input),
    ).pipe(
      mapParseError({
        code: 'executed-command-invalid',
        prefix: 'Invalid executed command',
      }),
    );
  },
);
