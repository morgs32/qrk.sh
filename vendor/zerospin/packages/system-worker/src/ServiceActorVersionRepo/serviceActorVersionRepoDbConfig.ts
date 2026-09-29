import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { ServiceActorCommandSchema } from '@zerospin/core/serviceSession/ServiceActorCommandSchema';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';

export const serviceActorVersionRepoDbConfig = makeDbConfig({
  tables: {
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
  },
});
