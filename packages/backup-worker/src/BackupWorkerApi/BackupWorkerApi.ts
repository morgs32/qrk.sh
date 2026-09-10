import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import type { IAnyErrorJson, IEncodedResult } from '@zerospin/error';
import { RpcTarget, type RpcStub } from 'capnweb';
import { Effect, type Semaphore } from 'effect';
import type * as SQLite from 'wa-sqlite';

import type { BackupDbApi } from '../BackupDbApi/BackupDbApi.ts';

import { acquireDb } from './acquireDb/acquireDb.ts';
import { dispose } from './dispose/dispose.ts';
import { ready } from './ready/ready.ts';

export class BackupWorkerApi extends RpcTarget {
  disposed = false;
  readonly targets = new Map<
    string,
    { target: BackupDbApi; stub: RpcStub<BackupDbApi> }
  >();

  constructor(
    readonly runtime: Promise<{
      sqlite3: ReturnType<typeof SQLite.Factory>;
      module: {
        readonly HEAPU8: Uint8Array;
        readonly HEAPU32: Uint32Array;
        cwrap(
          name: string,
          result: 'number',
          args: readonly string[],
          options: { async: true },
        ): (...args: number[]) => Promise<number>;
        _sqlite3_malloc(size: number): number;
        _sqlite3_free(pointer: number): void;
        _sqlite3_deserialize(
          db: number,
          schema: number,
          data: number,
          sizeLow: number,
          sizeHigh: number,
          bufferLow: number,
          bufferHigh: number,
          flags: number,
        ): number;
        _sqlite3_serialize(
          db: number,
          schema: number,
          size: number,
          flags: number,
        ): number;
      };
      semaphore: Semaphore.Semaphore;
      current: Map<string, BackupDbApi>;
      handles: Map<string, number>;
    }>,
  ) {
    super();
  }

  async ready(): Promise<IEncodedResult<void, IAnyErrorJson>> {
    return Effect.runPromise(encodeRpc(ready({ api: this })));
  }

  async acquireDb(props: {
    backupKey: string;
    onRevoked: RpcStub<() => void>;
  }): Promise<
    IEncodedResult<
      | { status: 'current'; db: RpcStub<BackupDbApi> }
      | {
          status: 'acquired';
          db: RpcStub<BackupDbApi>;
          snapshot: Uint8Array | null;
        },
      IAnyErrorJson
    >
  > {
    return Effect.runPromise(encodeRpc(acquireDb({ api: this, ...props })));
  }

  [Symbol.dispose](): void {
    Effect.runFork(dispose({ api: this }));
  }
}
