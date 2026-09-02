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
import { systemLogRepoDbConfig } from './SystemLogRepoDbConfig.js';

const systemLogFixedDORepoConfig = makeFixedDORepoConfig({
  abbreviation: systemWorkerAbbreviations.systemLogRepo,
  repoType: 'SystemLogRepo',
  namePattern: RoutePattern.parse('/:systemId'),
  managedRuntime,
  getDbConfig: Effect.fn('SystemLogRepo.getDbConfig')(function* () {
    yield* Effect.void;
    return systemLogRepoDbConfig;
  }),
});

export class SystemLogRepo extends makeFixedDORepo({
  fixedDORepoConfig: systemLogFixedDORepoConfig,
}) {
  static override readonly fixedDORepoConfig = systemLogFixedDORepoConfig;

  async appendLogRow(props: {
    level: ISystemLogLevel;
    message: string;
    payload?: unknown | null;
    source: string;
  }): Promise<IEncodedResult<ISystemLogRow, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      appendLogRow({
        db: this.db,
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
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return managedRuntime.runPromise(
      appendTelemetryBatch({
        batch: props.batch,
        db: this.db,
        systemId: this.env.ZEROSPIN_SYSTEM_ID,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }

  async getSystemLogRows(props: {
    limit: number;
  }): Promise<IEncodedResult<readonly ISystemLogRow[], IAnyErrorJson>> {
    return managedRuntime.runPromise(
      getSystemLogRows({
        db: this.db,
        limit: props.limit,
      }).pipe(Effect.provide(AsyncLive), encodeRpc),
    );
  }
}
