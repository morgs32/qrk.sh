import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import { makeRpcEnvelope } from '@zerospin/logger';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { BackupWorkerApi } from '../BackupWorkerApi/BackupWorkerApi.ts';

import { applyStatements } from './applyStatements/applyStatements.ts';
import { dispose } from './dispose/dispose.ts';
import { exportSnapshot } from './exportSnapshot/exportSnapshot.ts';
import { overwriteDb } from './overwriteDb/overwriteDb.ts';

export class BackupDbApi extends RpcTarget {
  revoked = false;
  readonly granted = Promise.withResolvers<void>();
  constructor(
    readonly backupKey: string,
    readonly owner: BackupWorkerApi,
    readonly runtime: Awaited<BackupWorkerApi['runtime']>,
    readonly onRevoked: RpcStub<() => void>,
  ) {
    super();
    void this.granted.promise.catch(() => undefined);
  }

  async overwriteDb(props: { snapshot: Uint8Array }) {
    return Effect.runPromise(
      makeRpcEnvelope(overwriteDb({ api: this, ...props })),
    );
  }

  async applyStatements(props: {
    statements: readonly ICommittedSqlStatement[];
  }) {
    return Effect.runPromise(
      makeRpcEnvelope(applyStatements({ api: this, ...props })),
    );
  }

  async exportSnapshot() {
    return Effect.runPromise(makeRpcEnvelope(exportSnapshot({ api: this })));
  }

  async dispose() {
    return Effect.runPromise(makeRpcEnvelope(dispose({ api: this })));
  }

  [Symbol.dispose](): void {
    Effect.runFork(dispose({ api: this }));
  }
}
