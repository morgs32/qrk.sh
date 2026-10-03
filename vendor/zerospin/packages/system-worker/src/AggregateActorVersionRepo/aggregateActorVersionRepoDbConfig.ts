import { aggregateBrowserCommandsTable } from '@zerospin/core/aggregateSession/aggregateBrowserCommandsTable';
import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import { EncodedOperationSchema } from '@zerospin/core/contracts/encodeAppliedOperation';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

const actorCommandTable = makeTable({
  name: 'commands',
  shape: {
    rowId: primitives.primaryKey({ abbreviation: 'row' }),
    id: primitives.text(),
    commandName: primitives.text(),
    contractVersion: primitives.text(),
    payload: primitives.text(),
    asyncInput: primitives.json({
      schema: AsyncCommandInputSchema,
      nullable: true,
    }),
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
    aggregateIndex: primitives.integer({ nullable: true }),
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
  },
  indexes: [
    {
      name: 'commands_aggregate_identity',
      columns: ['aggregateName', 'aggregateId', 'id'],
      unique: true,
    },
    {
      name: 'commands_aggregate_index',
      columns: ['aggregateIndex'],
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
});

const stagedCommandTable = makeTable({
  name: 'stagedCommands',
  shape: {
    stageIndex: primitives.integer({ primaryKey: true }),
    commandRowId: primitives.ref({
      table: 'commands',
      column: 'rowId',
      relation: 'command',
      inverse: 'pending',
    }),
    stagedAt: primitives.date(),
    operations: primitives.json({
      schema: Schema.Array(EncodedOperationSchema),
    }),
    resolvedAt: primitives.date({ nullable: true }),
  },
  indexes: [
    {
      name: 'stagedCommands_commandRowId',
      columns: ['commandRowId'],
      unique: true,
    },
  ],
});

export const aggregateActorVersionRepoDbConfig = makeDbConfig({
  tables: {
    browserCommandOutbox: makeTable({
      name: 'browserCommandOutbox',
      shape: aggregateBrowserCommandsTable.shape,
    }),
    commands: actorCommandTable,
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
    stagedCommands: stagedCommandTable,
    stagedAggregateCommandOutbox: makeTable({
      name: 'stagedAggregateCommandOutbox',
      shape: {
        id: actorCommandTable.shape.id,
        commandName: actorCommandTable.shape.commandName,
        contractVersion: actorCommandTable.shape.contractVersion,
        payload: actorCommandTable.shape.payload,
        asyncInput: actorCommandTable.shape.asyncInput,
        aggregateId: actorCommandTable.shape.aggregateId,
        aggregateName: actorCommandTable.shape.aggregateName,
        aggregateVersion: actorCommandTable.shape.aggregateVersion,
        systemName: actorCommandTable.shape.systemName,
        actorName: actorCommandTable.shape.actorName,
        actorVersion: actorCommandTable.shape.actorVersion,
        claims: actorCommandTable.shape.claims,
        nodeId: actorCommandTable.shape.nodeId,
        nodeIndex: actorCommandTable.shape.nodeIndex,
        sessionName: actorCommandTable.shape.sessionName,
        stageIndex: stagedCommandTable.shape.stageIndex,
        stagedAt: stagedCommandTable.shape.stagedAt,
        operations: stagedCommandTable.shape.operations,
        commandRowId: primitives.text(),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
