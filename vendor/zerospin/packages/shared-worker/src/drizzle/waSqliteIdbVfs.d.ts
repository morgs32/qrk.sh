declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  import * as VFS from 'wa-sqlite/src/VFS.js';

  export class IDBBatchAtomicVFS extends VFS.Base {
    name: string;

    mxPathName: number;

    constructor(
      idbDatabaseName?: string,
      options?: {
        durability?: 'default' | 'strict' | 'relaxed';
        purge?: 'deferred' | 'manual';
        purgeAtLeast?: number;
      },
    );

    close(): Promise<void>;
  }
}
