import type { ICommittedSqlStatement } from '@zerospin/core/drizzle/WaSqliteSession';
import type { ISessionId } from '@zerospin/core/session/types';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type {
  IAnyError,
  IAnyErrorJson,
  IEncodedResult,
} from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect } from 'effect';

import type { OpfsBackupLeaderApi } from '../OpfsBackupLeader/OpfsBackupLeaderApi.ts';
import { applyTransaction } from './applyTransaction/applyTransaction.ts';
import { closeSessionBackup } from './closeSessionBackup/closeSessionBackup.ts';
import { deleteSessionBackup } from './deleteSessionBackup/deleteSessionBackup.ts';
import { dispose } from './dispose/dispose.ts';
import { exportSnapshot } from './exportSnapshot/exportSnapshot.ts';
import { listSessionBackups } from './listSessionBackups/listSessionBackups.ts';
import { replaceSnapshot } from './replaceSnapshot/replaceSnapshot.ts';

export class OpfsBackupRouterApi extends RpcTarget {
  readonly backupClientId: number;
  readonly routeRequest: <T>(
    request: (
      api: RpcStub<OpfsBackupLeaderApi>,
    ) => Promise<IEncodedResult<T, IAnyErrorJson>>,
  ) => Effect.Effect<T, IAnyError>;
  readonly release: () => Effect.Effect<void>;

  constructor(props: {
    backupClientId: number;
    routeRequest: <T>(
      request: (
        api: RpcStub<OpfsBackupLeaderApi>,
      ) => Promise<IEncodedResult<T, IAnyErrorJson>>,
    ) => Effect.Effect<T, IAnyError>;
    release(): Effect.Effect<void>;
  }) {
    super();
    this.backupClientId = props.backupClientId;
    this.routeRequest = props.routeRequest;
    this.release = props.release;
  }

  async listSessionBackups(props: {
    backupKey: string;
  }): Promise<IEncodedResult<readonly ISessionId[], IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(listSessionBackups({ api: this, ...props })),
    );
  }

  async exportSnapshot(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<Uint8Array | null, IAnyErrorJson>> {
    return Effect.runPromise(encodeRpc(exportSnapshot({ api: this, ...props })));
  }

  async replaceSnapshot(props: {
    backupKey: string;
    sessionId: ISessionId;
    snapshot: Uint8Array;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(replaceSnapshot({ api: this, ...props })),
    );
  }

  async applyTransaction(props: {
    backupKey: string;
    sessionId: ISessionId;
    statements: readonly ICommittedSqlStatement[];
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(applyTransaction({ api: this, ...props })),
    );
  }

  async closeSessionBackup(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(closeSessionBackup({ api: this, ...props })),
    );
  }

  async deleteSessionBackup(props: {
    backupKey: string;
    sessionId: ISessionId;
  }): Promise<IEncodedResult<'deleted' | 'missing' | 'in-use', IAnyErrorJson>> {
    return Effect.runPromise(
      encodeRpc(deleteSessionBackup({ api: this, ...props })),
    );
  }

  [Symbol.dispose](): void {
    Effect.runFork(dispose({ api: this }));
  }
}
