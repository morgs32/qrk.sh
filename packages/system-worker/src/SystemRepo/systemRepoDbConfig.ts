import { AggregateSessionLockSchema } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { ServiceSessionLockSchema } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

export const systemRepoDbConfig = makeDbConfig({
  tables: {
    lockedAggregateActorVersions: makeTable({
      name: 'lockedAggregateActorVersions',
      shape: {
        aggregateName: primitives.text(),
        name: primitives.text(),
        version: primitives.text(),
        spec: primitives.json({
          schema:
            SystemSpecSchema.fields.aggregates.value.value.fields.actors.value,
        }),
      },
      indexes: [
        {
          name: 'lockedAggregateActorVersions_identity_unique',
          columns: ['aggregateName', 'name', 'version'],
          unique: true,
        },
      ],
    }),
    lockedServiceActorVersions: makeTable({
      name: 'lockedServiceActorVersions',
      shape: {
        serviceName: primitives.text(),
        name: primitives.text(),
        version: primitives.text(),
        spec: primitives.json({
          schema:
            SystemSpecSchema.fields.services.value.value.fields.actors.value,
        }),
      },
      indexes: [
        {
          name: 'lockedServiceActorVersions_identity_unique',
          columns: ['serviceName', 'name', 'version'],
          unique: true,
        },
      ],
    }),
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
    aggregateSessionWebSocketTickets: makeTable({
      name: 'aggregateSessionWebSocketTickets',
      shape: {
        ticketHash: primitives.text(),
        repoName: primitives.text(),
        aggregateId: primitives.foreignKey({
          abbreviation: coreAbbreviations.aggregate,
        }),
        aggregateName: primitives.text(),
        aggregateVersion: primitives.text(),
        actorName: primitives.text(),
        actorVersion: primitives.text(),
        actorPath: primitives.text(),
        identity: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionName: primitives.text(),
        aggregateSessionLock: primitives.json({
          schema: AggregateSessionLockSchema,
        }),
        expiresAt: primitives.date(),
      },
      indexes: [
        {
          name: 'aggregateSessionWebSocketTickets_ticketHash_unique',
          columns: ['ticketHash'],
          unique: true,
        },
      ],
    }),
    serviceSessionWebSocketTickets: makeTable({
      name: 'serviceSessionWebSocketTickets',
      shape: {
        ticketHash: primitives.text(),
        repoName: primitives.text(),
        serviceName: primitives.text(),
        serviceVersion: primitives.text(),
        actorPath: primitives.text(),
        identity: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
        }),
        sessionName: primitives.text(),
        serviceSessionLock: primitives.json({
          schema: ServiceSessionLockSchema,
        }),
        expiresAt: primitives.date(),
      },
      indexes: [
        {
          name: 'serviceSessionWebSocketTickets_ticketHash_unique',
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
  } satisfies IAnyTables,
});
