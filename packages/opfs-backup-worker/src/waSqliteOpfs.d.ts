declare module 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js' {
  export class OPFSCoopSyncVFS {
    static create(
      name: string,
      module: unknown,
    ): Promise<
      Parameters<
        ReturnType<typeof import('wa-sqlite').Factory>['vfs_register']
      >[0]
    >;
  }
}
