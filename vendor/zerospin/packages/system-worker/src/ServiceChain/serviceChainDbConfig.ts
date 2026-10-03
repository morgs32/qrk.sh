import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { AsyncCommandInputSchema } from '@zerospin/core/contracts/AsyncCommandInputSchema';
import { ServiceCallerSchema } from '@zerospin/core/contracts/ServiceCallerSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';
export const serviceChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text({ unique: true }),
        commandName: primitives.text(),
        caller: primitives.json({
          schema: ServiceCallerSchema,
          nullable: true,
        }),
        payload: primitives.text(),
        asyncInput: primitives.json({
          schema: AsyncCommandInputSchema,
          nullable: true,
        }),
        contractVersion: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        serviceIndex: primitives.integer({ primaryKey: true }),
        admission: primitives.json({ schema: AdmissionResultSchema }),
      },
    }),
    serviceSubscribers: makeTable({
      name: 'serviceSubscribers',
      shape: {
        serviceVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.serviceVersionRepo,
        }),
        serviceVersion: primitives.text({ unique: true }),
        active: primitives.boolean(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.json({
          schema: PublicFailureSchema,
          nullable: true,
        }),
      },
    }),
  },
});
