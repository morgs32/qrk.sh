import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import type {
  ISystemLogLevel,
  ISystemLogRow,
} from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
} from '@zerospin/logger';
import {
  makeEffectSchema,
  makeTable,
  primitives,
  type IAnyTables,
  type InferDecodedRow,
} from '@zerospin/schema';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

const systemLogLevelValues: [ISystemLogLevel, ...ISystemLogLevel[]] = [
  'debug',
  'info',
  'warn',
  'error',
];

const logRowShape = Object.freeze({
  id: primitives.primaryKey({ abbreviation: 'log' }),
  logIndex: primitives.integer(),
  createdAt: primitives.date(),
  source: primitives.text(),
  message: primitives.text(),
  level: primitives.enum({ values: systemLogLevelValues }),
  systemId: primitives.opaqueId({
    abbreviation: coreAbbreviations.system,
  }),
  payload: primitives.json({
    schema: Schema.Unknown,
    nullable: true,
  }),
});

assert<Equals<InferDecodedRow<typeof logRowShape>, ISystemLogRow>>();

const telemetrySpanShape = {
  spanId: primitives.primaryKey({ abbreviation: 'spn' }),
  traceId: primitives.opaqueId({ abbreviation: 'trc' }),
  parentSpanId: primitives.opaqueId({
    abbreviation: 'spn',
    nullable: true,
  }),
  name: primitives.text(),
  status: primitives.enum({ values: ['ok', 'error', 'lost'] }),
  startedAt: primitives.integer(),
  endedAt: primitives.integer(),
  attributes: primitives.json({
    schema: Schema.Record(Schema.String, Schema.Unknown),
    nullable: true,
  }),
  systemId: primitives.opaqueId({
    abbreviation: coreAbbreviations.system,
  }),
};

assert<
  Equals<
    Readonly<Omit<InferDecodedRow<typeof telemetrySpanShape>, 'systemId'>>,
    ISpanRecord
  >
>();

const telemetrySpansTable = makeTable({
  name: 'telemetrySpans',
  shape: telemetrySpanShape,
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

const telemetryLogShape = {
  logId: primitives.primaryKey({ abbreviation: 'lgr' }),
  traceId: primitives.opaqueId({ abbreviation: 'trc', nullable: true }),
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
    schema: Schema.Unknown,
    nullable: true,
  }),
  systemId: primitives.opaqueId({
    abbreviation: coreAbbreviations.system,
  }),
};

assert<
  Equals<
    Readonly<Omit<InferDecodedRow<typeof telemetryLogShape>, 'systemId'>>,
    ILogRecord
  >
>();

const telemetryLinkShape = {
  linkId: primitives.primaryKey({ abbreviation: 'lnk' }),
  traceId: primitives.opaqueId({ abbreviation: 'trc' }),
  spanId: primitives.ref({
    table: telemetrySpansTable,
    relation: 'span',
    inverse: 'links',
  }),
  priorTraceId: primitives.opaqueId({ abbreviation: 'trc' }),
  priorSpanId: primitives.opaqueId({ abbreviation: 'spn' }),
  kind: primitives.enum({ values: ['causedBy', 'retryOf'] }),
  systemId: primitives.opaqueId({
    abbreviation: coreAbbreviations.system,
  }),
};

assert<
  Equals<
    Readonly<Omit<InferDecodedRow<typeof telemetryLinkShape>, 'systemId'>>,
    ISpanLinkRecord
  >
>();

export const systemLogRepoTables = {
  logs: makeTable({
    name: 'logs',
    shape: logRowShape,
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
    shape: telemetryLogShape,
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
    shape: telemetryLinkShape,
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
} satisfies IAnyTables;

export const systemLogRepoDbConfig = makeDbConfig({
  tables: systemLogRepoTables,
});

export const systemLogRepoDrizzleSchemas = systemLogRepoDbConfig.schema;

export const systemLogRowSchema = makeEffectSchema(logRowShape);
