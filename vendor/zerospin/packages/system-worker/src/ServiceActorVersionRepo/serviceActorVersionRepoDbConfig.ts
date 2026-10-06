import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { ExecutionResultSchema } from '@zerospin/core/contracts/ExecutionResultSchema';
import { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { ActorDeltaSchema } from '@zerospin/core/models/ActorDeltaSchema';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/shapes';

import { serviceVersionChainDbConfig } from '../ServiceVersionChain/serviceVersionChainDbConfig.js';
export const serviceActorVersionRepoDbConfig = makeDbConfig({
  tables: {
    commands: serviceVersionChainDbConfig.tables.commands,
    asyncOperations: serviceVersionChainDbConfig.tables.asyncOperations,
    modelOperations: serviceVersionChainDbConfig.tables.modelOperations,
    actorState: makeTable({
      name: 'actorState',
      shape: {
        id: primitives.integer({ primaryKey: true }),
        executedIndex: primitives.integer(),
        serviceHash: primitives.text(),
        serviceIndex: primitives.integer(),
        serviceVersion: primitives.text(),
      },
    }),
    browserCommandOutbox: makeTable({
      name: 'browserCommandOutbox',
      shape: {
        executedIndex: primitives.integer({ primaryKey: true }),
        id: primitives.text(),
        commandName: primitives.text(),
        caller: primitives.json({
          schema: ServiceCallerSchema,
          nullable: true,
        }),
        serviceIndex: primitives.integer(),
        admission: primitives.json({
          schema: AdmissionResultSchema,
          nullable: true,
        }),
        execution: primitives.json({
          schema: ExecutionResultSchema,
          nullable: true,
        }),
        delta: primitives.json({ schema: ActorDeltaSchema }),
        serviceHash: primitives.text(),
        lastDeliveryFailure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
