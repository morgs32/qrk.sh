/*
 * System-worker annotation:
 * Defines the system-scoped SystemLogRepo Durable Object shell and log row storage.
 * Public RPC methods delegate to same-named Effect functions in method folders.
 */

import { RoutePattern } from '@remix-run/route-pattern';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import type {
  ISystemLogLevel,
  ISystemLogRow,
} from '@zerospin/core/system/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import { type IAnyErrorJson, type IEncodedResult } from '@zerospin/error';
import type { ITelemetryBatch } from '@zerospin/logger';
import { Effect } from 'effect';

import { makeFixedDORepo } from '../makeFixedDORepo/makeFixedDORepo.js';
import { makeFixedDORepoConfig } from '../makeFixedDORepo/makeFixedDORepoConfig.js';
import { managedRuntime } from '../managedRuntime.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import { appendLogRow } from './appendLogRow/appendLogRow.js';
import { appendTelemetryBatch } from './appendTelemetryBatch/appendTelemetryBatch.js';
import { getSystemLogRows } from './getSystemLogRows/getSystemLogRows.js';
import { systemLogRepoDbConfig } from './systemLogRepoDbConfig.js';

const systemLogFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.systemLogRepo,
  repoType: 'SystemLogRepo',
  namePattern: RoutePattern.parse('/:systemId'),
  managedRuntime,
  dbConfig: systemLogRepoDbConfig,
});

export class SystemLogRepo extends makeFixedDORepo({
  namespaceBinding: 'SYSTEM_LOG_REPO',
  fixedDORepoConfig: systemLogFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig = systemLogFixedDORepoConfig;

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
  }): Promise<IEncodedResult<ISystemLogRow, IAnyErrorJson>> {
    const { level, message, payload, source } = props;

    // 1 — run appendLogRow with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      appendLogRow({
        db: this.db,
        level,
        message,
        payload: payload ?? null,
        source,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /*
   * Linked RPC handlers persist completed telemetry batches in SystemLogRepo.
   * Stable record IDs make retries idempotent, and retention removes old trace
   * links, logs, and spans in the same transaction as the incoming batch.
   *
   * 1. Run the bound domain operation.
   */
  async appendTelemetryBatch(props: {
    batch: ITelemetryBatch;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    const { batch } = props;

    // 1 — run appendTelemetryBatch with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      appendTelemetryBatch({
        batch,
        db: this.db,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  /*
   * Log dashboard and live-tail bootstrap read newest retained log rows here.
   * The reader caps the requested window and validates each persisted row.
   *
   * 1. Run the bound domain operation.
   */
  async getSystemLogRows(props: {
    limit: number;
  }): Promise<IEncodedResult<readonly ISystemLogRow[], IAnyErrorJson>> {
    const { limit } = props;

    // 1 — run getSystemLogRows with the instance-bound dependencies and encode its RPC outcome
    return managedRuntime.runPromise(
      getSystemLogRows({
        db: this.db,
        limit,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
