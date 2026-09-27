import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { EncodedMutationSchema } from '@zerospin/core/contracts/encodeAppliedMutation';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { ServiceActorCommandSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

export const serviceActorVersionRepoDbConfig = makeDbConfig({
  tables: {
    automationState: makeTable({
      name: 'automationState',
      shape: {
        id: primitives.integer({ primaryKey: true }),
        startIndex: primitives.integer(),
      },
    }),
    actorState: makeTable({
      name: 'actorState',
      shape: {
        id: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        serviceHash: primitives.text(),
        serviceVersion: primitives.text(),
      },
    }),
    commands: makeTable({
      name: 'commands',
      shape: {
        rowId: primitives.primaryKey({ abbreviation: 'row' }),
        id: primitives.text(),
        commandName: primitives.text(),
        contractVersion: primitives.text(),
        payload: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        automationName: primitives.text({ nullable: true }),
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
        actorServiceIndex: primitives.integer({ nullable: true }),
        serviceHash: primitives.text({ nullable: true }),
        actorDelta: primitives.json({
          schema: ServiceActorCommandSchema.fields.actorDelta,
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
          name: 'commands_source_identity',
          columns: ['serviceName', 'id'],
          unique: true,
        },
        {
          name: 'commands_service_index',
          columns: ['serviceIndex'],
          unique: true,
        },
        {
          name: 'commands_actor_service_index',
          columns: ['actorServiceIndex'],
          unique: true,
        },
      ],
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
        { name: 'pending_command', columns: ['commandRowId'], unique: true },
      ],
    }),
    automationGroups: makeTable({
      name: 'automationGroups',
      shape: {
        serviceIndex: primitives.integer({ primaryKey: true }),
        status: primitives.text(),
      },
    }),
    automationRuns: makeTable({
      name: 'automationRuns',
      shape: {
        serviceIndex: primitives.ref({
          table: 'automationGroups',
          column: 'serviceIndex',
          relation: 'group',
          inverse: 'runs',
        }),
        automationName: primitives.text(),
        programStatus: primitives.text(),
        outputCommandRowId: primitives.ref({
          table: 'commands',
          column: 'rowId',
          relation: 'output',
          inverse: 'run',
          nullable: true,
        }),
        programFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
        stagingFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'automation_run_identity',
          columns: ['serviceIndex', 'automationName'],
          unique: true,
        },
        {
          name: 'automation_run_output',
          columns: ['outputCommandRowId'],
          unique: true,
        },
      ],
    }),
  },
});
