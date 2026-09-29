import { ActorDeltaSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

export const aggregateActorVersionRepoDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        rowId: primitives.primaryKey({ abbreviation: 'row' }),
        id: primitives.text(),
        commandName: primitives.text(),
        contractVersion: primitives.text(),
        payload: primitives.text(),
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
        sessionName: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        serviceName: primitives.text({ nullable: true }),
        serviceVersion: primitives.text({ nullable: true }),
        aggregateIndex: primitives.integer({ nullable: true }),
        serviceIndex: primitives.integer({ nullable: true }),
        admission: primitives.json({
          schema: AdmissionResultSchema,
          nullable: true,
        }),
        execution: primitives.json({
          schema: ExecutionResultSchema,
          nullable: true,
        }),
        dispositionHash: primitives.text({ nullable: true }),
        executedIndex: primitives.integer({ nullable: true }),
        executedHash: primitives.text({ nullable: true }),
        actorAggregateIndex: primitives.integer({ nullable: true }),
        actorDelta: primitives.json({
          schema: ActorDeltaSchema,
          nullable: true,
        }),
        acknowledgedAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'commands_aggregate_identity',
          columns: ['aggregateName', 'aggregateId', 'id'],
          unique: true,
        },
        {
          name: 'commands_service_identity',
          columns: ['serviceName', 'id'],
          unique: true,
        },
        {
          name: 'commands_aggregate_index',
          columns: ['aggregateIndex'],
          unique: true,
        },
        {
          name: 'commands_service_index',
          columns: ['serviceName', 'serviceIndex'],
          unique: true,
        },
        {
          name: 'commands_executed_index',
          columns: ['executedIndex'],
          unique: true,
        },
        {
          name: 'commands_node',
          columns: ['nodeId', 'nodeIndex'],
          unique: true,
        },
      ],
    }),
    actorState: makeTable({
      name: 'actorState',
      shape: {
        id: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        executedIndex: primitives.integer(),
        executedHash: primitives.text(),
        aggregateVersion: primitives.text(),
      },
    }),
    pendingCommands: makeTable({
      name: 'pendingCommands',
      shape: {
        stageIndex: primitives.integer({ primaryKey: true }),
        commandRowId: primitives.ref({
          table: 'commands',
          column: 'rowId',
          relation: 'command',
          inverse: 'pending',
        }),
        stagedAt: primitives.date(),
        mutations: primitives.json({
          schema: Schema.Array(EncodedMutationSchema),
        }),
        resolvedAt: primitives.date({ nullable: true }),
        acknowledgedAt: primitives.date({ nullable: true }),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'pendingCommands_commandRowId',
          columns: ['commandRowId'],
          unique: true,
        },
      ],
    }),
  },
});
