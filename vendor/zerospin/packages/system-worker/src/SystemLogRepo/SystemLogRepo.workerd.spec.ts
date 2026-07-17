/*
 * System-worker annotation:
 * Verifies structured telemetry persistence through the real SystemLogRepo Durable
 * Object, including retry idempotence, transaction rollback, and retention.
 */

import { it } from '@effect/vitest';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { ITelemetryBatch } from '@zerospin/logger';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { managedRuntime } from '../managedRuntime.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';
import { executeInRepo } from '../workerd-utils/executeInRepo.js';

import { getSystemLogRepo } from './getSystemLogRepo/getSystemLogRepo.js';
import { SystemLogRepo } from './SystemLogRepo.js';

describe('SystemLogRepo telemetry', () => {
  it.effect('assigns increasing log indexes and reads newest rows first', () =>
    Effect.gen(function* () {
      const generationId = 'gen_log_indexes';
      const systemLogRepoName = yield* SystemLogRepo.repoUtils.nameUtils.makeName({
        generationId,
      });
      expect(systemLogRepoName).toBe('syslogrepo_gen_log_indexes');
      const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });

      const first = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
          deployId: 'dpl_log_indexes',
          level: 'info',
          message: 'first',
          payload: null,
          source: 'SystemLogRepo.workerd.spec',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const second = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
          deployId: 'dpl_log_indexes',
          level: 'info',
          message: 'second',
          payload: null,
          source: 'SystemLogRepo.workerd.spec',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const third = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
          deployId: 'dpl_log_indexes',
          level: 'info',
          message: 'third',
          payload: null,
          source: 'SystemLogRepo.workerd.spec',
        }),
      ).pipe(Effect.flatMap(decodeRpc));

      expect(first.logIndex).toBe(1);
      expect(second.logIndex).toBe(2);
      expect(third.logIndex).toBe(3);

      const rows = yield* Effect.promise(() =>
        systemLogRepo.getSystemLogRows({ limit: 3 }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(rows).toHaveLength(3);
      expect(rows[0]?.id).toBe(third.id);
      expect(rows[0]?.logIndex).toBe(3);
      expect(rows[1]?.id).toBe(second.id);
      expect(rows[1]?.logIndex).toBe(2);
      expect(rows[2]?.id).toBe(first.id);
      expect(rows[2]?.logIndex).toBe(1);
      const registrations = yield* Effect.promise(() =>
        SystemRepo.getRepo({ generationId }).getRepoRegistrations({
          repoType: 'SystemLogRepo',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(registrations).toEqual([
        expect.objectContaining({
          repoName: systemLogRepoName,
          repoType: 'SystemLogRepo',
        }),
      ]);
    }),
  );

  it.effect('stores one row per stable ID when a batch is retried', () =>
    Effect.gen(function* () {
      const deployId = 'dpl_telemetry_idempotent';
      const generationId = 'gen_telemetry_idempotent';
      const systemId = 'sys_local';
      const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });
      const batch = {
        spans: [
          {
            spanId: 'spn_idempotent',
            traceId: 'trc_idempotent',
            parentSpanId: null,
            name: 'test.idempotent',
            status: 'ok',
            startedAt: 10,
            endedAt: 20,
            attributes: { phase: 'test' },
          },
        ],
        logs: [
          {
            logId: 'lgr_idempotent',
            traceId: 'trc_idempotent',
            spanId: 'spn_idempotent',
            createdAt: 15,
            level: 'info',
            message: 'stored once',
            source: 'test.idempotent',
            payload: { phase: 'test' },
          },
        ],
        links: [
          {
            linkId: 'lnk_idempotent',
            traceId: 'trc_idempotent',
            spanId: 'spn_idempotent',
            priorTraceId: 'trc_prior',
            priorSpanId: 'spn_prior',
            kind: 'causedBy',
          },
        ],
      } satisfies ITelemetryBatch;

      yield* Effect.promise(() =>
        systemLogRepo.appendTelemetryBatch({ batch, deployId }),
      ).pipe(
        Effect.flatMap(decodeRpc),
      );
      yield* Effect.promise(() =>
        systemLogRepo.appendTelemetryBatch({ batch, deployId }),
      ).pipe(
        Effect.flatMap(decodeRpc),
      );

      const rows = yield* Effect.promise(() =>
        executeInRepo({
          managedRuntime,
          getRepo: getSystemLogRepo,
          repo: SystemLogRepo,
          key: { generationId },
          fn: ({ db, schema }) => ({
            spans: db.select().from(schema.telemetrySpans).all(),
            logs: db.select().from(schema.telemetryLogs).all(),
            links: db.select().from(schema.telemetryLinks).all(),
          }),
        }),
      );

      expect(rows.spans).toHaveLength(1);
      expect(rows.logs).toHaveLength(1);
      expect(rows.links).toHaveLength(1);
      expect(rows.spans[0]).toEqual(
        expect.objectContaining({
          spanId: 'spn_idempotent',
          systemId,
          generationId,
          deployId,
        }),
      );
      expect(rows.logs[0]).toEqual(
        expect.objectContaining({
          logId: 'lgr_idempotent',
          systemId,
          generationId,
          deployId,
        }),
      );
      expect(rows.links[0]).toEqual(
        expect.objectContaining({
          linkId: 'lnk_idempotent',
          systemId,
          generationId,
          deployId,
        }),
      );
    }),
  );

  it.effect('rolls back the entire batch when one encoded row fails', () =>
    Effect.gen(function* () {
      const deployId = 'dpl_telemetry_rollback';
      const generationId = 'gen_telemetry_rollback';
      const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });
      const result = yield* Effect.promise(() =>
        systemLogRepo.appendTelemetryBatch({
          deployId,
          batch: {
            spans: [
              {
                spanId: 'spn_rollback',
                traceId: 'trc_rollback',
                parentSpanId: null,
                name: 'test.rollback',
                status: 'error',
                startedAt: 10,
                endedAt: 20,
                attributes: null,
              },
            ],
            logs: [
              {
                logId: 'lgr_rollback',
                traceId: 'trc_rollback',
                spanId: 'spn_rollback',
                createdAt: 15,
                level: 'error',
                message: 'cannot encode payload',
                source: 'test.rollback',
                payload: 1n,
              },
            ],
            links: [],
          },
        }),
      ).pipe(Effect.flatMap(decodeRpc), Effect.either);

      expect(result._tag).toBe('Left');

      const rows = yield* Effect.promise(() =>
        executeInRepo({
          managedRuntime,
          getRepo: getSystemLogRepo,
          repo: SystemLogRepo,
          key: { generationId },
          fn: ({ db, schema }) => ({
            spans: db.select().from(schema.telemetrySpans).all(),
            logs: db.select().from(schema.telemetryLogs).all(),
          }),
        }),
      );

      expect(rows.spans).toEqual([]);
      expect(rows.logs).toEqual([]);
    }),
  );

  it.effect(
    'keeps every row kind for only the newest one thousand traces',
    () =>
      Effect.gen(function* () {
        const deployId = 'dpl_telemetry_retention';
        const generationId = 'gen_telemetry_retention';
        const systemId = 'sys_local';
        const systemLogRepo = yield* getSystemLogRepo({ key: { generationId } });

        yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getSystemLogRepo,
            repo: SystemLogRepo,
            key: { generationId },
            fn: ({ db, schema }) => {
              db.run(sql`
              WITH RECURSIVE sequence(value) AS (
                SELECT 0
                UNION ALL
                SELECT value + 1 FROM sequence WHERE value < 1000
              )
              INSERT INTO ${schema.telemetrySpans} (
                spanId, traceId, parentSpanId, name, status,
                startedAt, endedAt, attributes, systemId, generationId, deployId
              )
              SELECT
                printf('spn_retention_%04d', value),
                printf('trc_retention_%04d', value),
                NULL,
                'test.retention',
                'ok',
                value,
                value,
                NULL,
                ${systemId},
                ${generationId},
                ${deployId}
              FROM sequence
            `);
              db.run(sql`
              WITH RECURSIVE sequence(value) AS (
                SELECT 0
                UNION ALL
                SELECT value + 1 FROM sequence WHERE value < 1000
              )
              INSERT INTO ${schema.telemetryLogs} (
                logId, traceId, spanId, createdAt, level,
                message, source, payload, systemId, generationId, deployId
              )
              SELECT
                printf('lgr_retention_%04d', value),
                printf('trc_retention_%04d', value),
                printf('spn_retention_%04d', value),
                value,
                'info',
                'retention',
                'test.retention',
                NULL,
                ${systemId},
                ${generationId},
                ${deployId}
              FROM sequence
            `);
              db.run(sql`
              WITH RECURSIVE sequence(value) AS (
                SELECT 0
                UNION ALL
                SELECT value + 1 FROM sequence WHERE value < 1000
              )
              INSERT INTO ${schema.telemetryLinks} (
                linkId, traceId, spanId, priorTraceId, priorSpanId,
                kind, systemId, generationId, deployId
              )
              SELECT
                printf('lnk_retention_%04d', value),
                printf('trc_retention_%04d', value),
                printf('spn_retention_%04d', value),
                'trc_prior',
                'spn_prior',
                'causedBy',
                ${systemId},
                ${generationId},
                ${deployId}
              FROM sequence
            `);
            },
          }),
        );

        yield* Effect.promise(() =>
          systemLogRepo.appendTelemetryBatch({
            batch: { spans: [], logs: [], links: [] },
            deployId,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const rows = yield* Effect.promise(() =>
          executeInRepo({
            managedRuntime,
            getRepo: getSystemLogRepo,
            repo: SystemLogRepo,
            key: { generationId },
            fn: ({ db, schema }) => ({
              spans: db.select().from(schema.telemetrySpans).all(),
              logs: db.select().from(schema.telemetryLogs).all(),
              links: db.select().from(schema.telemetryLinks).all(),
            }),
          }),
        );

        expect(rows.spans).toHaveLength(1000);
        expect(rows.logs).toHaveLength(1000);
        expect(rows.links).toHaveLength(1000);
        expect(rows.spans).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
        expect(rows.logs).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
        expect(rows.links).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
      }),
  );
});
