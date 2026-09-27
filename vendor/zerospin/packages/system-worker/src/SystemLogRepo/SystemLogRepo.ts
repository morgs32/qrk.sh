import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
/*
 * System-worker annotation:
 * Defines the system-scoped SystemLogRepo Durable Object shell and log row storage.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */
import type { ISystemLogLevel } from '@zerospin/core/system/types';
import { makeRpcEnvelope, type ITelemetryBatch } from '@zerospin/logger';
import config from 'config';
import { Effect } from 'effect';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { appendLogRow } from './appendLogRow/appendLogRow.js';
import { appendTelemetryBatch } from './appendTelemetryBatch/appendTelemetryBatch.js';
import { beginAggregateAdmissionAttempt } from './beginAggregateAdmissionAttempt/beginAggregateAdmissionAttempt.js';
import { beginServiceAdmissionAttempt } from './beginServiceAdmissionAttempt/beginServiceAdmissionAttempt.js';
import { completeAdmissionAttempt } from './completeAdmissionAttempt/completeAdmissionAttempt.js';
import { getSystemLogRows } from './getSystemLogRows/getSystemLogRows.js';
import { systemLogRepoDbConfig } from './systemLogRepoDbConfig.js';

const systemLogFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.systemLogRepo,
  repoType: 'SystemLogRepo',
  namePattern: RoutePattern.parse('/:systemId'),
  managedRuntime: config.system.runtime,
  dbConfig: systemLogRepoDbConfig,
});

export class SystemLogRepo extends makeFixedDORepo({
  namespaceBinding: 'SYSTEM_LOG_REPO',
  fixedDORepoConfig: systemLogFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig = systemLogFixedDORepoConfig;

  async beginAggregateAdmissionAttempt(
    props: Omit<Parameters<typeof beginAggregateAdmissionAttempt>[0], 'db'>,
  ) {
    return config.system.runtime.runPromise(
      beginAggregateAdmissionAttempt({ ...props, db: this.db }).pipe(
        makeRpcEnvelope,
      ),
    );
  }

  async beginServiceAdmissionAttempt(
    props: Omit<Parameters<typeof beginServiceAdmissionAttempt>[0], 'db'>,
  ) {
    return config.system.runtime.runPromise(
      beginServiceAdmissionAttempt({ ...props, db: this.db }).pipe(
        makeRpcEnvelope,
      ),
    );
  }

  async completeAdmissionAttempt(
    props: Omit<Parameters<typeof completeAdmissionAttempt>[0], 'db'>,
  ) {
    return config.system.runtime.runPromise(
      completeAdmissionAttempt({ ...props, db: this.db }).pipe(makeRpcEnvelope),
    );
  }

  /*
   * SystemLogRepo.appendLogRow is the runtime boundary for the same-named operation.
   *
   * 1. Run the bound domain operation.
   */
  async appendLogRow(props: {
    level: ISystemLogLevel;
    message: string;
    payload?: unknown | null;
    source: string;
  }) {
    const { level, message, payload, source } = props;

    // 1 — run appendLogRow with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      appendLogRow({
        db: this.db,
        level,
        message,
        payload: payload ?? null,
        source,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }

  /*
   * Linked RPC handlers persist completed telemetry batches in SystemLogRepo.
   * Stable record IDs make retries idempotent, and retention removes old trace
   * links, logs, and spans in the same transaction as the incoming batch.
   *
   * 1. Run the bound domain operation.
   */
  async appendTelemetryBatch(props: { batch: ITelemetryBatch }) {
    const { batch } = props;

    // 1 — run appendTelemetryBatch with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      appendTelemetryBatch({
        batch,
        db: this.db,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), program =>
        makeRpcEnvelope(program, { collectTelemetry: false }),
      ),
    );
  }

  /*
   * Log dashboard and live-tail bootstrap read newest retained log rows here.
   * The reader caps the requested window and validates each persisted row.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRows(props: { limit: number }) {
    const { limit } = props;

    // 1 — run getSystemLogRows with the instance-bound dependencies and encode its RPC outcome
    return config.system.runtime.runPromise(
      getSystemLogRows({
        db: this.db,
        limit,
      }).pipe(Effect.provide(AsyncLive), makeRpcEnvelope),
    );
  }
}
