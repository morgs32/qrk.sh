import { AdmissionResultSchema } from '@zerospin/core/contracts/AdmissionResultSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { PublicFailureSchema } from '@zerospin/error';
import { makeTable, primitives } from '@zerospin/schema';
import { Schema } from 'effect';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: {
        id: primitives.text({ unique: true }),
        commandName: primitives.text(),
        payload: primitives.text(),
        contractVersion: primitives.text(),
        aggregateId: primitives.text(),
        aggregateName: primitives.text(),
        systemName: primitives.text(),
        aggregateVersion: primitives.text({ nullable: true }),
        nodeId: primitives.text({ nullable: true }),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        claims: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionName: primitives.text({ nullable: true }),
        nodeIndex: primitives.integer({ nullable: true }),
        aggregateIndex: primitives.integer({ primaryKey: true }),
        admission: primitives.json({ schema: AdmissionResultSchema }),
      },
      indexes: [
        {
          name: 'commands_node',
          columns: ['nodeId', 'nodeIndex'],
          unique: true,
        },
      ],
    }),
    aggregateVersionRepos: makeTable({
      name: 'aggregateVersionRepos',
      shape: {
        aggregateVersionRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.aggregateVersionRepo,
        }),
        aggregateVersion: primitives.text({ unique: true }),
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
