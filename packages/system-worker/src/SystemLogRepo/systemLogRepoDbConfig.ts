import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeTable, primitives, type IAnyTables } from '@zerospin/schema';
import { Schema } from 'effect';

const telemetrySpansTable = makeTable({
  name: 'telemetrySpans',
  shape: {
    spanId: primitives.primaryKey({ abbreviation: 'spn' }),
    traceId: primitives.foreignKey({ abbreviation: 'trc' }),
    parentSpanId: primitives.foreignKey({
      abbreviation: 'spn',
      nullable: true,
    }),
    name: primitives.text(),
    status: primitives.enum({ values: ['ok', 'error', 'lost'] }),
    startedAt: primitives.integer(),
    endedAt: primitives.integer(),
    attributes: primitives.json({
      schema: Schema.Record(Schema.String, Schema.Json),
      nullable: true,
    }),
    systemId: primitives.foreignKey({
      abbreviation: coreAbbreviations.system,
    }),
  },
  indexes: [
    {
      name: 'telemetrySpans_traceId_idx',
      columns: ['traceId'],
    },
    {
      name: 'telemetrySpans_parentSpanId_idx',
      columns: ['parentSpanId'],
    },
    {
      name: 'telemetrySpans_endedAt_idx',
      columns: ['endedAt'],
    },
  ],
});

export const systemLogRepoDbConfig = makeDbConfig({
  tables: {
    admissionAttempts: makeTable({
      name: 'admissionAttempts',
      shape: {
        attemptId: primitives.primaryKey({ abbreviation: 'aat' }),
        aggregateName: primitives.text({ nullable: true }),
        aggregateVersion: primitives.text({ nullable: true }),
        serviceName: primitives.text({ nullable: true }),
        serviceVersion: primitives.text({ nullable: true }),
        startedAt: primitives.date(),
        completedAt: primitives.date({ nullable: true }),
        status: primitives.enum({
          values: ['unfinished', 'succeeded', 'failed'],
        }),
        identity: primitives.json({
          schema: Schema.Record(Schema.String, Schema.Unknown),
          nullable: true,
        }),
        identityHash: primitives.text({ nullable: true }),
        selection: primitives.json({
          schema: Schema.Record(Schema.String, Schema.String),
          nullable: true,
        }),
        actorPath: primitives.text({ nullable: true }),
        failure: primitives.json({
          schema: Schema.Struct({
            code: Schema.String,
            message: Schema.String,
          }),
          nullable: true,
        }),
      },
    }),
    logs: makeTable({
      name: 'logs',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'log' }),
        logIndex: primitives.integer(),
        createdAt: primitives.date(),
        source: primitives.text(),
        message: primitives.text(),
        level: primitives.enum({ values: ['debug', 'info', 'warn', 'error'] }),
        systemId: primitives.foreignKey({
          abbreviation: coreAbbreviations.system,
        }),
        payload: primitives.json({
          schema: Schema.Unknown,
          nullable: true,
        }),
      },
      indexes: [
        {
          name: 'logs_logIndex_idx',
          columns: ['logIndex'],
        },
        {
          name: 'logs_source_idx',
          columns: ['source'],
        },
      ],
    }),
    telemetrySpans: telemetrySpansTable,
    telemetryLogs: makeTable({
      name: 'telemetryLogs',
      shape: {
        logId: primitives.primaryKey({ abbreviation: 'lgr' }),
        traceId: primitives.foreignKey({ abbreviation: 'trc', nullable: true }),
        spanId: primitives.ref({
          table: telemetrySpansTable,
          relation: 'span',
          inverse: 'logs',
          nullable: true,
        }),
        createdAt: primitives.integer(),
        level: primitives.enum({ values: ['debug', 'info', 'warn', 'error'] }),
        message: primitives.text(),
        source: primitives.text(),
        payload: primitives.json({
          schema: Schema.Json,
          nullable: true,
        }),
        systemId: primitives.foreignKey({
          abbreviation: coreAbbreviations.system,
        }),
      },
      indexes: [
        {
          name: 'telemetryLogs_traceId_idx',
          columns: ['traceId'],
        },
        {
          name: 'telemetryLogs_spanId_idx',
          columns: ['spanId'],
        },
        {
          name: 'telemetryLogs_createdAt_idx',
          columns: ['createdAt'],
        },
      ],
    }),
    telemetryLinks: makeTable({
      name: 'telemetryLinks',
      shape: {
        linkId: primitives.primaryKey({ abbreviation: 'lnk' }),
        traceId: primitives.foreignKey({ abbreviation: 'trc' }),
        spanId: primitives.ref({
          table: telemetrySpansTable,
          relation: 'span',
          inverse: 'links',
        }),
        priorTraceId: primitives.foreignKey({ abbreviation: 'trc' }),
        priorSpanId: primitives.foreignKey({ abbreviation: 'spn' }),
        kind: primitives.enum({ values: ['causedBy', 'retryOf'] }),
        systemId: primitives.foreignKey({
          abbreviation: coreAbbreviations.system,
        }),
      },
      indexes: [
        {
          name: 'telemetryLinks_traceId_idx',
          columns: ['traceId'],
        },
        {
          name: 'telemetryLinks_spanId_idx',
          columns: ['spanId'],
        },
        {
          name: 'telemetryLinks_priorTraceId_idx',
          columns: ['priorTraceId'],
        },
      ],
    }),
  } satisfies IAnyTables,
});
