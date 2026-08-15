import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { makeIdbSQLite3 } from '../../../../packages/shared-worker/src/drizzle/makeIdbSQLite3.js';
import {
  getLastUserPartition,
  openLastUserPartitionStore,
  setLastUserPartition,
} from '../../../../packages/shared-worker/src/SharedWorker/lastUserPartitionStore.js';

const locatorDatabaseName = 'zerospin/056/last-user-partition-store';
const locatorStoreName = 'lastUserPartitions';
const testRunId = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

describe('lastUserPartitionStore', () => {
  it('isolates exact configuration keys, returns missing records, and reopens non-empty state with last-write-wins', async () => {
    let database: IDBDatabase | null = null;
    try {
      database = await Effect.runPromise(openLastUserPartitionStore());
      expect(
        await Effect.runPromise(
          getLastUserPartition({ database, key: 'configuration-a' }),
        ),
      ).toBeNull();

      await Effect.runPromise(
        setLastUserPartition({
          database,
          record: {
            key: 'configuration-a',
            systemId: 'sys_locator_a',
            userId: 'user-a',
          },
        }),
      );
      await Effect.runPromise(
        setLastUserPartition({
          database,
          record: {
            key: 'configuration-b',
            systemId: 'sys_locator_b',
            userId: 'user-b',
          },
        }),
      );
      await Effect.runPromise(
        setLastUserPartition({
          database,
          record: {
            key: 'configuration-a',
            systemId: 'sys_locator_a_replacement',
            userId: 'user-a-replacement',
          },
        }),
      );

      database.close();
      database = await Effect.runPromise(openLastUserPartitionStore());
      await expect(
        Effect.runPromise(
          getLastUserPartition({ database, key: 'configuration-a' }),
        ),
      ).resolves.toEqual({
        key: 'configuration-a',
        systemId: 'sys_locator_a_replacement',
        userId: 'user-a-replacement',
      });
      await expect(
        Effect.runPromise(
          getLastUserPartition({ database, key: 'configuration-b' }),
        ),
      ).resolves.toEqual({
        key: 'configuration-b',
        systemId: 'sys_locator_b',
        userId: 'user-b',
      });
    } finally {
      database?.close();
      await new Promise<void>((resolve, reject) => {
        const request =
          globalThis.indexedDB.deleteDatabase(locatorDatabaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to delete locator test DB'),
          ),
        );
        request.addEventListener('blocked', () =>
          reject(new Error('Deleting locator test DB was blocked')),
        );
      });
    }
  });

  it('strictly rejects corrupt records and maps native open, get, and set failures at their operation boundaries', async () => {
    const databasesFailure = vi
      .spyOn(globalThis.indexedDB, 'databases')
      .mockRejectedValueOnce(new Error('enumeration unavailable'));
    await expect(
      Effect.runPromise(openLastUserPartitionStore()),
    ).rejects.toThrow('open-last-user-partition-store-failed');
    databasesFailure.mockRestore();

    let database: IDBDatabase | null = null;
    try {
      database = await Effect.runPromise(openLastUserPartitionStore());
      await new Promise<void>((resolve, reject) => {
        const transaction = database?.transaction(
          locatorStoreName,
          'readwrite',
        );
        if (transaction === undefined) {
          reject(new Error('Locator database was not open'));
          return;
        }
        transaction.objectStore(locatorStoreName).put({
          key: 'corrupt-configuration',
          systemId: 'sys_corrupt',
          userId: 'user-corrupt',
          legacyField: true,
        });
        transaction.addEventListener('complete', () => resolve());
        transaction.addEventListener('abort', () =>
          reject(
            transaction.error ?? new Error('Corrupt record write aborted'),
          ),
        );
        transaction.addEventListener('error', () =>
          reject(transaction.error ?? new Error('Corrupt record write failed')),
        );
      });

      await expect(
        Effect.runPromise(
          getLastUserPartition({
            database,
            key: 'corrupt-configuration',
          }),
        ),
      ).rejects.toThrow('browser-persistence-reset-required');

      database.close();
      await expect(
        Effect.runPromise(
          getLastUserPartition({ database, key: 'closed-read' }),
        ),
      ).rejects.toThrow('get-last-user-partition-failed');
      await expect(
        Effect.runPromise(
          setLastUserPartition({
            database,
            record: {
              key: 'closed-write',
              systemId: 'sys_closed',
              userId: 'user-closed',
            },
          }),
        ),
      ).rejects.toThrow('set-last-user-partition-failed');
    } finally {
      database?.close();
      await new Promise<void>((resolve, reject) => {
        const request =
          globalThis.indexedDB.deleteDatabase(locatorDatabaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to delete corrupt locator DB'),
          ),
        );
        request.addEventListener('blocked', () =>
          reject(new Error('Deleting corrupt locator DB was blocked')),
        );
      });
    }
  });

  it('rejects incompatible locator versions and layouts without upgrading or mutating them', async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(locatorDatabaseName, 2);
        request.addEventListener('upgradeneeded', () => {
          request.result
            .createObjectStore(locatorStoreName, { keyPath: 'key' })
            .put({
              key: 'preserved-version-record',
              systemId: 'sys_preserved',
              userId: 'user-preserved',
            });
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to create version-2 locator'),
          ),
        );
      });
      await expect(
        Effect.runPromise(openLastUserPartitionStore()),
      ).rejects.toThrow('browser-persistence-reset-required');
      expect(
        (await globalThis.indexedDB.databases()).find(
          databaseInfo => databaseInfo.name === locatorDatabaseName,
        )?.version,
      ).toBe(2);

      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(locatorDatabaseName);
        request.addEventListener('success', () => {
          const database = request.result;
          const transaction = database.transaction(
            locatorStoreName,
            'readonly',
          );
          const getRequest = transaction
            .objectStore(locatorStoreName)
            .get('preserved-version-record');
          transaction.addEventListener('complete', () => {
            database.close();
            try {
              expect(getRequest.result).toEqual({
                key: 'preserved-version-record',
                systemId: 'sys_preserved',
                userId: 'user-preserved',
              });
              resolve();
            } catch (cause) {
              reject(cause);
            }
          });
          transaction.addEventListener('error', () => {
            database.close();
            reject(
              transaction.error ??
                new Error('Failed to verify preserved locator record'),
            );
          });
        });
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to reopen version-2 locator'),
          ),
        );
      });

      await new Promise<void>((resolve, reject) => {
        const request =
          globalThis.indexedDB.deleteDatabase(locatorDatabaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to replace locator DB')),
        );
      });
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(locatorDatabaseName, 1);
        request.addEventListener('upgradeneeded', () => {
          request.result
            .createObjectStore(locatorStoreName, { keyPath: 'key' })
            .createIndex('legacyIndex', 'userId');
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(
            request.error ??
              new Error('Failed to create incompatible locator layout'),
          ),
        );
      });
      await expect(
        Effect.runPromise(openLastUserPartitionStore()),
      ).rejects.toThrow('browser-persistence-reset-required');
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(locatorDatabaseName);
        request.addEventListener('success', () => {
          const database = request.result;
          const transaction = database.transaction(
            locatorStoreName,
            'readonly',
          );
          try {
            expect(
              Array.from(transaction.objectStore(locatorStoreName).indexNames),
            ).toEqual(['legacyIndex']);
            database.close();
            resolve();
          } catch (cause) {
            database.close();
            reject(cause);
          }
        });
        request.addEventListener('error', () =>
          reject(
            request.error ??
              new Error('Failed to inspect incompatible locator layout'),
          ),
        );
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        const request =
          globalThis.indexedDB.deleteDatabase(locatorDatabaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(
            request.error ??
              new Error('Failed to delete incompatible locator DB'),
          ),
        );
        request.addEventListener('blocked', () =>
          reject(new Error('Deleting incompatible locator DB was blocked')),
        );
      });
    }
  });

  it('rejects non-empty pre-056 databases without creating, upgrading, mutating, or deleting browser state', async () => {
    const legacyDatabaseName = `zerospin/055/legacy-${testRunId}`;
    try {
      expect(
        (await globalThis.indexedDB.databases()).some(
          databaseInfo => databaseInfo.name === locatorDatabaseName,
        ),
      ).toBe(false);
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(legacyDatabaseName, 3);
        request.addEventListener('upgradeneeded', () => {
          request.result.createObjectStore('legacy', { keyPath: 'key' }).put({
            key: 'preserved',
            value: 'legacy-data',
          });
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to create legacy database'),
          ),
        );
      });

      const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
      await expect(
        Effect.runPromise(openLastUserPartitionStore()),
      ).rejects.toThrow('browser-persistence-reset-required');
      expect(deleteDatabase).not.toHaveBeenCalled();
      deleteDatabase.mockRestore();
      expect(
        (await globalThis.indexedDB.databases()).find(
          databaseInfo => databaseInfo.name === legacyDatabaseName,
        )?.version,
      ).toBe(3);
      expect(
        (await globalThis.indexedDB.databases()).some(
          databaseInfo => databaseInfo.name === locatorDatabaseName,
        ),
      ).toBe(false);

      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(legacyDatabaseName);
        request.addEventListener('success', () => {
          const database = request.result;
          const transaction = database.transaction('legacy', 'readonly');
          const getRequest = transaction.objectStore('legacy').get('preserved');
          transaction.addEventListener('complete', () => {
            database.close();
            try {
              expect(getRequest.result).toEqual({
                key: 'preserved',
                value: 'legacy-data',
              });
              resolve();
            } catch (cause) {
              reject(cause);
            }
          });
          transaction.addEventListener('error', () => {
            database.close();
            reject(
              transaction.error ??
                new Error('Failed to verify legacy database contents'),
            );
          });
        });
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to reopen legacy database'),
          ),
        );
      });
    } finally {
      vi.restoreAllMocks();
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.deleteDatabase(legacyDatabaseName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to delete legacy DB')),
        );
        request.addEventListener('blocked', () =>
          reject(new Error('Deleting legacy DB was blocked')),
        );
      });
    }
  });

  it('rejects incompatible VFS versions, stores, and indexes without constructing or upgrading a VFS', async () => {
    const versionDatabaseName = `zerospin/056/vfs-version-${testRunId}`;
    const storeDatabaseName = `zerospin/056/vfs-store-${testRunId}`;
    const indexDatabaseName = `zerospin/056/vfs-index-${testRunId}`;
    const moduleFactory = vi.fn(async () => {
      throw new Error('The SQLite module must not be constructed');
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(versionDatabaseName, 4);
        request.addEventListener('upgradeneeded', () => {
          request.result.createObjectStore('blocks');
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to create version VFS')),
        );
      });
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(storeDatabaseName, 5);
        request.addEventListener('upgradeneeded', () => {
          request.result.createObjectStore('wrongStore');
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to create store VFS')),
        );
      });
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(indexDatabaseName, 5);
        request.addEventListener('upgradeneeded', () => {
          request.result
            .createObjectStore('blocks', {
              keyPath: ['path', 'offset', 'version'],
            })
            .createIndex('version', ['path', 'offset']);
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to create index VFS')),
        );
      });

      for (const vfsName of [
        versionDatabaseName,
        storeDatabaseName,
        indexDatabaseName,
      ]) {
        await expect(
          makeIdbSQLite3({
            databaseName: 'replicas.db',
            mode: 'existing-only',
            moduleFactory,
            vfsName,
          }),
        ).rejects.toThrow('browser-persistence-reset-required');
      }
      expect(moduleFactory).not.toHaveBeenCalled();
      expect(
        (await globalThis.indexedDB.databases())
          .filter(databaseInfo =>
            [
              versionDatabaseName,
              storeDatabaseName,
              indexDatabaseName,
            ].includes(databaseInfo.name ?? ''),
          )
          .map(databaseInfo => ({
            name: databaseInfo.name,
            version: databaseInfo.version,
          }))
          .sort((left, right) =>
            (left.name ?? '').localeCompare(right.name ?? ''),
          ),
      ).toEqual(
        [
          { name: versionDatabaseName, version: 4 },
          { name: storeDatabaseName, version: 5 },
          { name: indexDatabaseName, version: 5 },
        ].sort((left, right) => left.name.localeCompare(right.name)),
      );
    } finally {
      for (const databaseName of [
        versionDatabaseName,
        storeDatabaseName,
        indexDatabaseName,
      ]) {
        await new Promise<void>((resolve, reject) => {
          const request = globalThis.indexedDB.deleteDatabase(databaseName);
          request.addEventListener('success', () => resolve());
          request.addEventListener('error', () =>
            reject(
              request.error ?? new Error(`Failed to delete ${databaseName}`),
            ),
          );
          request.addEventListener('blocked', () =>
            reject(new Error(`Deleting ${databaseName} was blocked`)),
          );
        });
      }
    }
  });

  it('reopens a valid non-empty post-056 VFS in existing-only mode', async () => {
    const vfsName = `zerospin/056/vfs-valid-${testRunId}`;
    let sqlite: Awaited<ReturnType<typeof makeIdbSQLite3>> | null = null;
    try {
      sqlite = await makeIdbSQLite3({
        databaseName: 'valid.db',
        mode: 'create-or-open',
        vfsName,
      });
      await sqlite.sqlite3.exec(
        sqlite.db,
        "CREATE TABLE preserved (value TEXT NOT NULL); INSERT INTO preserved (value) VALUES ('kept');",
      );
      await sqlite.sqlite3.close(sqlite.db);
      await sqlite.vfs.close();
      sqlite = null;

      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(vfsName);
        request.addEventListener('success', () => {
          const database = request.result;
          const transaction = database.transaction('blocks', 'readonly');
          const countRequest = transaction.objectStore('blocks').count();
          transaction.addEventListener('complete', () => {
            database.close();
            try {
              expect(countRequest.result).toBeGreaterThan(0);
              resolve();
            } catch (cause) {
              reject(cause);
            }
          });
          transaction.addEventListener('error', () => {
            database.close();
            reject(
              transaction.error ??
                new Error('Failed to inspect the valid non-empty VFS'),
            );
          });
        });
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to inspect valid VFS')),
        );
      });

      sqlite = await makeIdbSQLite3({
        databaseName: 'valid.db',
        mode: 'existing-only',
        vfsName,
      });
      const rows = new Array<unknown[]>();
      await sqlite.sqlite3.exec(sqlite.db, 'SELECT value FROM preserved', row =>
        rows.push(row),
      );
      expect(rows).toEqual([['kept']]);
    } finally {
      if (sqlite !== null) {
        await sqlite.sqlite3.close(sqlite.db).catch(() => undefined);
        await sqlite.vfs.close().catch(() => undefined);
      }
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.deleteDatabase(vfsName);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to delete valid VFS')),
        );
        request.addEventListener('blocked', () =>
          reject(new Error('Deleting valid VFS was blocked')),
        );
      });
    }
  });

  it('documents the scoped operator reset without any runtime deletion or unrelated-origin data loss', async () => {
    const extraZerospinDatabaseName = `zerospin/056/operator-reset-${testRunId}`;
    const unrelatedDatabaseName = `unrelated-operator-reset-${testRunId}`;
    const zerospinStorageKey = `zerospin:operator-reset:${testRunId}`;
    const unrelatedStorageKey = `unrelated:operator-reset:${testRunId}`;
    let locatorDatabase: IDBDatabase | null = null;
    const deleteDatabase = vi.spyOn(globalThis.indexedDB, 'deleteDatabase');
    try {
      expect(
        (await globalThis.indexedDB.databases()).filter(databaseInfo =>
          databaseInfo.name?.startsWith('zerospin/'),
        ),
      ).toEqual([]);
      locatorDatabase = await Effect.runPromise(openLastUserPartitionStore());
      await Effect.runPromise(
        setLastUserPartition({
          database: locatorDatabase,
          record: {
            key: 'operator-reset',
            systemId: 'sys_operator_reset',
            userId: 'user-operator-reset',
          },
        }),
      );
      locatorDatabase.close();
      locatorDatabase = null;
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(extraZerospinDatabaseName, 1);
        request.addEventListener('upgradeneeded', () => {
          request.result.createObjectStore('records').put('zerospin', 'key');
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(
            request.error ?? new Error('Failed to create reset-target DB'),
          ),
        );
      });
      await new Promise<void>((resolve, reject) => {
        const request = globalThis.indexedDB.open(unrelatedDatabaseName, 1);
        request.addEventListener('upgradeneeded', () => {
          request.result.createObjectStore('records').put('unrelated', 'key');
        });
        request.addEventListener('success', () => {
          request.result.close();
          resolve();
        });
        request.addEventListener('error', () =>
          reject(request.error ?? new Error('Failed to create unrelated DB')),
        );
      });
      globalThis.localStorage.setItem(zerospinStorageKey, 'remove');
      globalThis.localStorage.setItem(unrelatedStorageKey, 'preserve');

      expect(deleteDatabase).not.toHaveBeenCalled();
      expect(
        (await globalThis.indexedDB.databases())
          .map(databaseInfo => databaseInfo.name)
          .filter(
            (databaseName): databaseName is string =>
              databaseName?.startsWith('zerospin/') === true,
          )
          .sort(),
      ).toEqual([extraZerospinDatabaseName, locatorDatabaseName].sort());

      for (const databaseInfo of await globalThis.indexedDB.databases()) {
        if (!databaseInfo.name?.startsWith('zerospin/')) continue;
        await new Promise<void>((resolve, reject) => {
          const request = globalThis.indexedDB.deleteDatabase(
            databaseInfo.name ?? '',
          );
          request.addEventListener('success', () => resolve());
          request.addEventListener('error', () =>
            reject(
              request.error ??
                new Error(`Failed to reset ${databaseInfo.name ?? ''}`),
            ),
          );
          request.addEventListener('blocked', () =>
            reject(
              new Error(`Resetting ${databaseInfo.name ?? ''} was blocked`),
            ),
          );
        });
      }
      for (
        let storageIndex = globalThis.localStorage.length - 1;
        storageIndex >= 0;
        storageIndex -= 1
      ) {
        const key = globalThis.localStorage.key(storageIndex);
        if (key?.startsWith('zerospin:')) {
          globalThis.localStorage.removeItem(key);
        }
      }

      expect(
        (await globalThis.indexedDB.databases()).some(databaseInfo =>
          databaseInfo.name?.startsWith('zerospin/'),
        ),
      ).toBe(false);
      expect(
        (await globalThis.indexedDB.databases()).some(
          databaseInfo => databaseInfo.name === unrelatedDatabaseName,
        ),
      ).toBe(true);
      expect(globalThis.localStorage.getItem(zerospinStorageKey)).toBeNull();
      expect(globalThis.localStorage.getItem(unrelatedStorageKey)).toBe(
        'preserve',
      );
      expect(deleteDatabase).toHaveBeenCalledTimes(2);
      expect(
        deleteDatabase.mock.calls.map(([databaseName]) => databaseName).sort(),
      ).toEqual([extraZerospinDatabaseName, locatorDatabaseName].sort());
    } finally {
      locatorDatabase?.close();
      deleteDatabase.mockRestore();
      globalThis.localStorage.removeItem(zerospinStorageKey);
      globalThis.localStorage.removeItem(unrelatedStorageKey);
      for (const databaseName of [
        locatorDatabaseName,
        extraZerospinDatabaseName,
        unrelatedDatabaseName,
      ]) {
        await new Promise<void>((resolve, reject) => {
          const request = globalThis.indexedDB.deleteDatabase(databaseName);
          request.addEventListener('success', () => resolve());
          request.addEventListener('error', () =>
            reject(
              request.error ?? new Error(`Failed to clean ${databaseName}`),
            ),
          );
          request.addEventListener('blocked', () =>
            reject(new Error(`Cleaning ${databaseName} was blocked`)),
          );
        });
      }
    }
  });
});
