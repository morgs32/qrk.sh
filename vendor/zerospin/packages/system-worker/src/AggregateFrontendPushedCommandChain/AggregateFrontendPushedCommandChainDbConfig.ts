import { EncodedAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import {
  AggregateFrontendPushedCommandSchema,
  SessionCommandSchema,
} from '@zerospin/core/session/AggregateFrontendCommandSchema';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';

export const aggregateFrontendPushedCommandChainTables = {
  chainState: makeTable({
    name: 'chainState',
    shape: {
      id: primitives.integer({ primaryKey: true }),
      haltedAt: primitives.date({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
  }),
  commands: makeTable({
    name: 'commands',
    shape: {
      pushIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({ schema: SessionCommandSchema }),
      chainedAt: primitives.date(),
      result: primitives.json({
        schema: AggregateFrontendPushedCommandSchema,
        nullable: true,
      }),
      materializedAggregateFrontendRepoName: primitives.text(),
      aggregateCommandChainName: primitives.text(),
    },
  }),
  aggregateForwardOutbox: makeTable({
    name: 'aggregateForwardOutbox',
    shape: {
      pushIndex: primitives.integer({ primaryKey: true }),
      commandId: primitives.text({ unique: true }),
      canonicalBytes: primitives.text(),
      command: primitives.json({ schema: EncodedAggregateCommandSchema }),
      aggregateCommandChainName: primitives.text(),
      forwardedAt: primitives.date({ nullable: true }),
      failure: primitives.text({ nullable: true }),
    },
  }),
} satisfies IAnyTables;

export const aggregateFrontendPushedCommandChainDbConfig = makeDbConfig({
  tables: aggregateFrontendPushedCommandChainTables,
});

export const aggregateFrontendPushedCommandChainDrizzleSchemas =
  aggregateFrontendPushedCommandChainDbConfig.schema;
