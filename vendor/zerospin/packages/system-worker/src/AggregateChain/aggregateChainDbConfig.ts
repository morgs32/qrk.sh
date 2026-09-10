import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { makeTable, primitives } from '@zerospin/schema';
import { Context } from 'effect';

import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

export const aggregateChainDbConfig = makeDbConfig({
  tables: {
    admittedCommands: makeTable({
      name: 'admittedCommands',
      shape: {
        aggregateIndex: primitives.integer({ primaryKey: true }),
        commandId: primitives.text({ unique: true }),
        canonicalBytes: primitives.text(),
        chainedAt: primitives.date(),
        command: primitives.json({
          schema: EncodedAggregateCommandSchema,
        }),
      },
    }),
    versionedAggregateRepos: makeTable({
      name: 'versionedAggregateRepos',
      shape: {
        versionedAggregateRepoName: primitives.primaryKey({
          abbreviation: systemWorkerAbbreviations.versionedAggregateRepo,
        }),
        aggregateVersion: primitives.text({ unique: true }),
        active: primitives.boolean(),
        currentIndex: primitives.integer({ nullable: true }),
        failure: primitives.text({ nullable: true }),
      },
    }),
  },
});

export class AggregateChainDb extends Context.Service<
  AggregateChainDb,
  IDb<typeof aggregateChainDbConfig>
>()('@zerospin/system-worker/AggregateChainDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/AggregateChainDb.Tx',
    ITx<typeof aggregateChainDbConfig>
  >('@zerospin/system-worker/AggregateChainDb.Tx');
}
