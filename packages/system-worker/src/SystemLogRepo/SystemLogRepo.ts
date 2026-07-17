/*
 * System-worker annotation:
 * Defines the generation-scoped SystemLogRepo Durable Object shell and log row storage.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeDbConfig } from '@zerospin/core/drizzle/makeDbConfig';
import { makeTable } from '@zerospin/core/models/makeTable';
import { makeEffectSchema } from '@zerospin/core/models/primitiveMaps';
import { primitives } from '@zerospin/core/models/primitives';
import type { IAnyTables, InferDecodedRow } from '@zerospin/core/models/types';
import type {
  ISystemLogLevel,
  ISystemLogRow,
} from '@zerospin/core/system/types';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { type IAnyErrorJson } from '@zerospin/error';
import type {
  ILogRecord,
  ISpanLinkRecord,
  ISpanRecord,
  ITelemetryBatch,
} from '@zerospin/logger';
import { Effect, Schema } from 'effect';
import { BrandTypeId } from 'effect/Brand';
import { assert, type Equals } from 'tsafe';

import { makeRepo } from '../makeRepo/makeRepo.js';
import { makeRepoUtils } from '../makeRepo/makeRepoUtils.js';
import { managedRuntime } from '../managedRuntime.js';

import { appendLogRow } from './appendLogRow/appendLogRow.js';
import { appendTelemetryBatch } from './appendTelemetryBatch/appendTelemetryBatch.js';
import { getSystemLogRows } from './getSystemLogRows/getSystemLogRows.js';

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
    abbreviation: cloudIdAbbreviations.systemRecord,
  }),
  generationId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.generation,
  }),
  deployId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.deploy,
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
    schema: Schema.Record({
      key: Schema.String,
      value: Schema.Unknown,
    }),
    nullable: true,
  }),
  systemId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.systemRecord,
  }),
  generationId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.generation,
  }),
  deployId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.deploy,
  }),
};

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<typeof telemetrySpanShape>,
        'systemId' | 'generationId' | 'deployId'
      >
    >,
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
    abbreviation: cloudIdAbbreviations.systemRecord,
  }),
  generationId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.generation,
  }),
  deployId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.deploy,
  }),
};

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<typeof telemetryLogShape>,
        'systemId' | 'generationId' | 'deployId'
      >
    >,
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
    abbreviation: cloudIdAbbreviations.systemRecord,
  }),
  generationId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.generation,
  }),
  deployId: primitives.opaqueId({
    abbreviation: cloudIdAbbreviations.deploy,
  }),
};

assert<
  Equals<
    Readonly<
      Omit<
        InferDecodedRow<typeof telemetryLinkShape>,
        'systemId' | 'generationId' | 'deployId'
      >
    >,
    ISpanLinkRecord
  >
>();

const systemLogRepoTables = {
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

const systemLogRepoDbConfig = makeDbConfig({ tables: systemLogRepoTables });

export const systemLogRepoDrizzleSchemas = systemLogRepoDbConfig.schema;

export const systemLogRowSchema = makeEffectSchema(logRowShape);

const systemLogRepoUtils = makeRepoUtils({
  abbreviation: coreAbbreviations.systemLogRepo,
  repoType: 'SystemLogRepo',
  namePattern: RoutePattern.parse('/:generationId'),
  managedRuntime,
  getDbConfig: Effect.fn('SystemLogRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return systemLogRepoDbConfig;
  }),
});

export class SystemLogRepo extends makeRepo({ repoUtils: systemLogRepoUtils }) {
  declare [BrandTypeId]: { readonly TargetApi: 'TargetApi' };

  static override readonly repoUtils = systemLogRepoUtils;

  async appendLogRow(props: {
    deployId: string;
    level: ISystemLogLevel;
    message: string;
    payload?: unknown | null;
    source: string;
  }): Promise<Schema.EitherEncoded<ISystemLogRow, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      appendLogRow({
        db: this.db,
        deployId: props.deployId,
        generationId: this.key.generationId,
        level: props.level,
        message: props.message,
        payload: props.payload ?? null,
        source: props.source,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async appendTelemetryBatch(props: {
    batch: ITelemetryBatch;
    deployId: string;
  }): Promise<Schema.EitherEncoded<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      appendTelemetryBatch({
        batch: props.batch,
        db: this.db,
        deployId: props.deployId,
        generationId: this.key.generationId,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getSystemLogRows(props: {
    limit: number;
  }): Promise<Schema.EitherEncoded<readonly ISystemLogRow[], IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getSystemLogRows({
        db: this.db,
        limit: props.limit,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
