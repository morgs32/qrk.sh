import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import { ServiceFrontendLockSchema } from '@zerospin/core/frontendController/makeServiceFrontendLock';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Context, Schema } from 'effect';

export const systemRepoTables = {
  lockedAggregateVersions: makeTable({
    name: 'lockedAggregateVersions',
    shape: {
      name: primitives.text(),
      version: primitives.text(),
      spec: primitives.json({
        schema: SystemSpecSchema.fields.aggregates.value.value,
      }),
    },
    indexes: [
      {
        name: 'lockedAggregateVersions_name_version_unique',
        columns: ['name', 'version'],
        unique: true,
      },
    ],
  }),
  lockedServiceVersions: makeTable({
    name: 'lockedServiceVersions',
    shape: {
      name: primitives.text(),
      version: primitives.text(),
      spec: primitives.json({
        schema: SystemSpecSchema.fields.services.value.value,
      }),
    },
    indexes: [
      {
        name: 'lockedServiceVersions_name_version_unique',
        columns: ['name', 'version'],
        unique: true,
      },
    ],
  }),
  aggregateFrontendWebSocketTickets: makeTable({
    name: 'aggregateFrontendWebSocketTickets',
    shape: {
      ticketHash: primitives.text(),
      repoName: primitives.text(),
      aggregateId: primitives.foreignKey({
        abbreviation: coreAbbreviations.aggregate,
      }),
      aggregateName: primitives.text(),
      aggregateVersion: primitives.text(),
      selectionPath: primitives.text(),
      authentication: primitives.json({
        schema: Schema.Record(Schema.String, Schema.Unknown),
      }),
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
      serviceVersion: primitives.text(),
      selectionPath: primitives.text(),
      authentication: primitives.json({
        schema: Schema.Record(Schema.String, Schema.Unknown),
      }),
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

export class SystemRepoDb extends Context.Service<
  SystemRepoDb,
  IDb<typeof systemRepoDbConfig>
>()('@zerospin/system-worker/SystemRepoDb') {
  static readonly Tx = Context.Service<
    '@zerospin/system-worker/SystemRepoDb.Tx',
    ITx<typeof systemRepoDbConfig>
  >('@zerospin/system-worker/SystemRepoDb.Tx');
}
