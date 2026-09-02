import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

const systemRepoTables = {
  aggregateFrontendWebSocketTickets: makeTable({
    name: 'aggregateFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      repoName: primitives.text(),
      aggregateId: primitives.opaqueId({
        abbreviation: coreAbbreviations.aggregate,
      }),
      aggregateName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      aggregateFrontendLock: primitives.json({
        schema: AggregateFrontendLockSchema,
      }),
      expiresAt: primitives.date(),
    },
    indexes: [
      {
        name: 'aggregateFrontendWebSocketTickets_ticketHash_unique',
        columns: ['ticketHash'],
        unique: true,
      },
    ],
  }),
  serviceFrontendWebSocketTickets: makeTable({
    name: 'serviceFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      repoName: primitives.text(),
      serviceName: primitives.text(),
      userId: primitives.text(),
      frontendName: primitives.text(),
      serviceFrontendLock: primitives.json({
        schema: ServiceFrontendLockSchema,
      }),
      expiresAt: primitives.date(),
    },
    indexes: [
      {
        name: 'serviceFrontendWebSocketTickets_ticketHash_unique',
        columns: ['ticketHash'],
        unique: true,
      },
    ],
  }),
  aggregates: makeTable({
    name: 'aggregates',
    shape: {
      aggregateId: primitives.opaqueId({
        abbreviation: coreAbbreviations.aggregate,
      }),
    },
    indexes: [
      {
        name: 'aggregates_aggregateId_unique',
        columns: ['aggregateId'],
        unique: true,
      },
    ],
  }),
  repos: makeTable({
    name: 'repos',
    shape: {
      repoType: primitives.text(),
      repoName: primitives.text(),
      tableNames: primitives.json({
        schema: Schema.Array(Schema.String),
      }),
    },
    indexes: [
      {
        name: 'repos_repo_type_repo_name_unique',
        columns: ['repoType', 'repoName'],
        unique: true,
      },
    ],
  }),
} satisfies IAnyTables;

export const systemRepoDbConfig = makeDbConfig({ tables: systemRepoTables });
export const systemRepoDrizzleSchemas = systemRepoDbConfig.schema;
