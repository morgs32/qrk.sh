import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { ISessionId } from '@zerospin/core/session/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import { RpcTarget } from 'capnweb';
import { Effect } from 'effect';
import type * as Semaphore from 'effect/Semaphore';
import type * as SQLite from 'wa-sqlite';

import { applyTransaction } from './applyTransaction/applyTransaction.ts';
import { closeSessionBackup } from './closeSessionBackup/closeSessionBackup.ts';
import { deleteSessionBackup } from './deleteSessionBackup/deleteSessionBackup.ts';
import { dispose } from './dispose/dispose.ts';
import { exportSnapshot } from './exportSnapshot/exportSnapshot.ts';
import { listSessionBackups } from './listSessionBackups/listSessionBackups.ts';
import { releaseClient } from './releaseClient/releaseClient.ts';
import { replaceSnapshot } from './replaceSnapshot/replaceSnapshot.ts';

export class OpfsBackupLeaderApi extends RpcTarget {
  readonly semaphore: Semaphore.Semaphore;
  readonly sqlite3: ReturnType<typeof SQLite.Factory>;
  readonly module: {
    readonly HEAPU8: Uint8Array;
    readonly HEAPU32: Uint32Array;
    pendingOps: Promise<unknown>[];
    retryOps: Promise<unknown>[];
    _sqlite3_backup_finish(backup: number): number;
    _sqlite3_backup_init(
      destinationDb: number,
      destinationName: number,
      sourceDb: number,
      sourceName: number,
    ): number;
    _sqlite3_backup_step(backup: number, pages: number): number;
    _sqlite3_deserialize(
      db: number,
      schemaName: number,
      data: number,
      databaseSizeLow: number,
      databaseSizeHigh: number,
      bufferSizeLow: number,
      bufferSizeHigh: number,
      flags: number,
    ): number;
    _sqlite3_free(pointer: number): void;
    _sqlite3_malloc(size: number): number;
    _sqlite3_serialize(
      db: number,
      schemaName: number,
      size: number,
      flags: number,
    ): number;
  };
  readonly handles: Map<
    string,
    Readonly<{
      backupClientId: number;
      db: number;
      releaseLock(): void;
    }>
  >;

  constructor(props: {
    semaphore: Semaphore.Semaphore;
    sqlite3: ReturnType<typeof SQLite.Factory>;
    module: {
      readonly HEAPU8: Uint8Array;
      readonly HEAPU32: Uint32Array;
      pendingOps: Promise<unknown>[];
      retryOps: Promise<unknown>[];
      _sqlite3_backup_finish(backup: number): number;
      _sqlite3_backup_init(
        destinationDb: number,
        destinationName: number,
        sourceDb: number,
        sourceName: number,
      ): number;
      _sqlite3_backup_step(backup: number, pages: number): number;
      _sqlite3_deserialize(
        db: number,
        schemaName: number,
        data: number,
        databaseSizeLow: number,
        databaseSizeHigh: number,
        bufferSizeLow: number,
        bufferSizeHigh: number,
        flags: number,
      ): number;
      _sqlite3_free(pointer: number): void;
      _sqlite3_malloc(size: number): number;
      _sqlite3_serialize(
        db: number,
        schemaName: number,
        size: number,
        flags: number,
      ): number;
    };
    handles: Map<
      string,
      Readonly<{
        backupClientId: number;
        db: number;
        releaseLock(): void;
      }>
    >;
  }) {
    super();
    this.semaphore = props.semaphore;
    this.sqlite3 = props.sqlite3;
    this.module = props.module;
    this.handles = props.handles;
  }

  async listSessionBackups(props: {
    backupClientId: number;
    backupKey: string;
  }): Promise<IEncodedResult<readonly ISessionId[], IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(listSessionBackups({ api: this, ...props })),
    );
  }

  async exportSnapshot(props: {
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<Uint8Array | null, IAnyErrorJson>> {
    return Effect.runPromise(encodeRpc(exportSnapshot({ api: this, ...props })));
  }

  async replaceSnapshot(props: {
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
    snapshot: Uint8Array;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(
        replaceSnapshot({ api: this, ...props }).pipe(
          Effect.catchDefect(cause =>
            Effect.fail(
              new ZerospinError({
                code: 'opfs-backup-replace-failed',
                message: ZerospinError.prettyUnknownFailure(cause),
                cause: ZerospinError.prettyUnknownFailure(cause),
              }),
            ),
          ),
        ),
      ),
    );
  }

  async applyTransaction(props: {
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
    statements: readonly ICommittedSqlStatement[];
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(applyTransaction({ api: this, ...props })),
    );
  }

  async closeSessionBackup(props: {
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(closeSessionBackup({ api: this, ...props })),
    );
  }

  async deleteSessionBackup(props: {
    backupClientId: number;
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<'deleted' | 'missing' | 'in-use', IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(deleteSessionBackup({ api: this, ...props })),
    );
  }

  async releaseClient(props: {
    backupClientId: number;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(encodeRpc(releaseClient({ api: this, ...props })));
  }

  [Symbol.dispose](): void {
    Effect.runFork(dispose({ api: this }));
  }
}
