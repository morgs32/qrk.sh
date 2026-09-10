import { EncodedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable, primitives } from '@zerospin/schema';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const serviceAdmittedChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        fanoutIndex: primitives.integer({ primaryKey: true }),
        commandId: primitives.text({ unique: true }),
        canonicalBytes: primitives.text(),
        chainedAt: primitives.date(),
        command: primitives.json({ schema: EncodedServiceCommandSchema }),
      },
    }),
    serviceSubscribers: makeTable({
      name: 'serviceSubscribers',
      shape: {
        versionedServiceRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.versionedServiceRepo,
        }),
        serviceVersion: primitives.text({ unique: true }),
        active: primitives.boolean(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
  },
});
