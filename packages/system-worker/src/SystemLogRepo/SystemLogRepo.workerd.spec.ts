/*
 * System-worker annotation:
 * Verifies structured telemetry persistence through the real SystemLogRepo Durable
 * Object, including retry idempotence, transaction rollback, and retention.
 */

import { it } from '@effect/vitest';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import type { ITelemetryBatch } from '@zerospin/logger';
import { env } from 'cloudflare:test';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import { getSystemLogRepo } from './getSystemLogRepo/getSystemLogRepo.js';
import { SystemLogRepo } from './SystemLogRepo.js';

describe('SystemLogRepo telemetry', () => {
  it.effect('assigns increasing log indexes and reads newest rows first', () =>
    Effect.gen(function* () {
      const systemId = env.ZEROSPIN_SYSTEM_ID;
      const facetName =
        yield* SystemLogRepo.fixedDORepoConfig.nameUtils.makeName({
          systemId,
        });
      expect(facetName).toBe('syslogrepo_sys_local');
      const systemLogRepo = yield* getSystemLogRepo({ key: { systemId } });

      const first = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
          level: 'info',
          message: 'first',
          payload: null,
          source: 'SystemLogRepo.workerd.spec',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const second = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
          level: 'info',
          message: 'second',
          payload: null,
          source: 'SystemLogRepo.workerd.spec',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      const third = yield* Effect.promise(() =>
        systemLogRepo.appendLogRow({
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
        SystemRepo.getRepo({ systemId: 'sys_local' }).getRepoRegistrations({
          repoType: 'SystemLogRepo',
        }),
      ).pipe(Effect.flatMap(decodeRpc));
      expect(registrations).toEqual([
        expect.objectContaining({
          repoName: facetName,
          repoType: 'SystemLogRepo',
        }),
      ]);
    }),
  );

  it.effect('stores one row per stable ID when a batch is retried', () =>
    Effect.gen(function* () {
      const systemId = env.ZEROSPIN_SYSTEM_ID;
      const systemLogRepo = yield* getSystemLogRepo({ key: { systemId } });
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
        systemLogRepo.appendTelemetryBatch({ batch }),
      ).pipe(Effect.flatMap(decodeRpc));
      yield* Effect.promise(() =>
        systemLogRepo.appendTelemetryBatch({ batch }),
      ).pipe(Effect.flatMap(decodeRpc));

      const [spans, logs, links] = yield* Effect.all([
        Effect.promise(() =>
          systemLogRepo.getRepoTableRows({
            tableName: 'telemetrySpans',
          }),
        ).pipe(Effect.flatMap(decodeRpc)),
        Effect.promise(() =>
          systemLogRepo.getRepoTableRows({
            tableName: 'telemetryLogs',
          }),
        ).pipe(Effect.flatMap(decodeRpc)),
        Effect.promise(() =>
          systemLogRepo.getRepoTableRows({
            tableName: 'telemetryLinks',
          }),
        ).pipe(Effect.flatMap(decodeRpc)),
      ]);

      expect(spans.rows).toHaveLength(1);
      expect(logs.rows).toHaveLength(1);
      expect(links.rows).toHaveLength(1);
      expect(spans.rows[0]).toEqual(
        expect.objectContaining({
          spanId: 'spn_idempotent',
          systemId,
        }),
      );
      expect(logs.rows[0]).toEqual(
        expect.objectContaining({
          logId: 'lgr_idempotent',
          systemId,
        }),
      );
      expect(links.rows[0]).toEqual(
        expect.objectContaining({
          linkId: 'lnk_idempotent',
          systemId,
        }),
      );
    }),
  );

  it.effect('rolls back the entire batch when one encoded row fails', () =>
    Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { systemId: env.ZEROSPIN_SYSTEM_ID },
      });
      const result = yield* Effect.promise(() =>
        systemLogRepo.appendTelemetryBatch({
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
      ).pipe(Effect.flatMap(decodeRpc), Effect.result);

      expect(result._tag).toBe('Failure');

      const [spans, logs] = yield* Effect.all([
        Effect.promise(() =>
          systemLogRepo.getRepoTableRows({
            tableName: 'telemetrySpans',
          }),
        ).pipe(Effect.flatMap(decodeRpc)),
        Effect.promise(() =>
          systemLogRepo.getRepoTableRows({
            tableName: 'telemetryLogs',
          }),
        ).pipe(Effect.flatMap(decodeRpc)),
      ]);

      expect(spans.rows.filter(row => row.spanId === 'spn_rollback')).toEqual(
        [],
      );
      expect(logs.rows.filter(row => row.logId === 'lgr_rollback')).toEqual([]);
    }),
  );

  it.effect(
    'keeps every row kind for only the newest one thousand traces',
    () =>
      Effect.gen(function* () {
        const systemLogRepo = yield* getSystemLogRepo({
          key: { systemId: env.ZEROSPIN_SYSTEM_ID },
        });
        const values = Array.from({ length: 1_001 }, (_, value) => value);
        const batch = {
          spans: values.map(value => ({
            spanId: `spn_retention_${value.toString().padStart(4, '0')}`,
            traceId: `trc_retention_${value.toString().padStart(4, '0')}`,
            parentSpanId: null,
            name: 'test.retention',
            status: 'ok',
            startedAt: value,
            endedAt: value,
            attributes: null,
          })),
          logs: values.map(value => ({
            logId: `lgr_retention_${value.toString().padStart(4, '0')}`,
            traceId: `trc_retention_${value.toString().padStart(4, '0')}`,
            spanId: `spn_retention_${value.toString().padStart(4, '0')}`,
            createdAt: value,
            level: 'info',
            message: 'retention',
            source: 'test.retention',
            payload: null,
          })),
          links: values.map(value => ({
            linkId: `lnk_retention_${value.toString().padStart(4, '0')}`,
            traceId: `trc_retention_${value.toString().padStart(4, '0')}`,
            spanId: `spn_retention_${value.toString().padStart(4, '0')}`,
            priorTraceId: 'trc_prior',
            priorSpanId: 'spn_prior',
            kind: 'causedBy',
          })),
        } satisfies ITelemetryBatch;

        yield* Effect.promise(() =>
          systemLogRepo.appendTelemetryBatch({
            batch,
          }),
        ).pipe(Effect.flatMap(decodeRpc));

        const [spans, logs, links] = yield* Effect.all([
          Effect.promise(() =>
            systemLogRepo.getRepoTableRows({
              tableName: 'telemetrySpans',
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
          Effect.promise(() =>
            systemLogRepo.getRepoTableRows({
              tableName: 'telemetryLogs',
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
          Effect.promise(() =>
            systemLogRepo.getRepoTableRows({
              tableName: 'telemetryLinks',
            }),
          ).pipe(Effect.flatMap(decodeRpc)),
        ]);

        expect(spans.rows).toHaveLength(1000);
        expect(logs.rows).toHaveLength(1000);
        expect(links.rows).toHaveLength(1000);
        expect(spans.rows).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
        expect(logs.rows).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
        expect(links.rows).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ traceId: 'trc_retention_0000' }),
          ]),
        );
      }),
  );
});
