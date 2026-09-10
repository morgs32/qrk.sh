declare module 'wa-sqlite/src/examples/IDBBatchAtomicVFS.js' {
  export class IDBBatchAtomicVFS {
    static create(
      name: string,
      module: unknown,
      options: { idbName: string },
    ): Promise<
      Parameters<
        ReturnType<typeof import('wa-sqlite').Factory>['vfs_register']
      >[0]
    >;
  }
}
