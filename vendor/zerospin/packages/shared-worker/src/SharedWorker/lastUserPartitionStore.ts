import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { ZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

const lastUserPartitionSchema = Schema.Struct({
  key: Schema.String,
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  userId: Schema.NonEmptyString,
});

const lastUserPartitionDatabaseName = 'zerospin/056/last-user-partition-store';
const lastUserPartitionStoreName = 'lastUserPartitions';

export const openLastUserPartitionStore = Effect.fn(
  'openLastUserPartitionStore',
)(function* (): Effect.fn.Return<IDBDatabase, IAnyError> {
  const databaseInfos = yield* Effect.tryPromise({
    try: () => globalThis.indexedDB.databases(),
    catch: cause =>
      new ZerospinError({
        code: 'open-last-user-partition-store-failed',
        message: 'Failed to enumerate browser persistence',
        cause: ZerospinError.prettyUnknownFailure(cause),
      }),
  });

  for (const databaseInfo of databaseInfos) {
    const databaseName = databaseInfo.name;
    if (
      databaseName === undefined ||
      !databaseName.startsWith('zerospin/') ||
      databaseName.startsWith('zerospin/056/')
    ) {
      continue;
    }

    const containsData = yield* Effect.tryPromise({
      try: () =>
        new Promise<boolean>((resolve, reject) => {
          const request = globalThis.indexedDB.open(databaseName);
          let settled = false;

          request.addEventListener('upgradeneeded', () => {
            request.transaction?.abort();
            if (settled) return;
            settled = true;
            reject(
              new Error(
                `Legacy IndexedDB database disappeared while opening: ${databaseName}`,
              ),
            );
          });
          request.addEventListener('blocked', () => {
            if (settled) return;
            settled = true;
            reject(
              new Error(
                `Legacy IndexedDB database open was blocked: ${databaseName}`,
              ),
            );
          });
          request.addEventListener('error', () => {
            if (settled) return;
            settled = true;
            reject(
              request.error ??
                new Error(
                  `Legacy IndexedDB database open failed: ${databaseName}`,
                ),
            );
          });
          request.addEventListener('success', () => {
            const database = request.result;
            if (settled) {
              database.close();
              return;
            }

            const objectStoreNames = Array.from(database.objectStoreNames);
            if (objectStoreNames.length === 0) {
              settled = true;
              database.close();
              resolve(false);
              return;
            }

            try {
              const transaction = database.transaction(
                objectStoreNames,
                'readonly',
              );
              let hasRecords = false;
              for (const objectStoreName of objectStoreNames) {
                const countRequest = transaction
                  .objectStore(objectStoreName)
                  .count();
                countRequest.addEventListener('success', () => {
                  if (countRequest.result > 0) hasRecords = true;
                });
              }
              transaction.addEventListener('complete', () => {
                if (settled) return;
                settled = true;
                database.close();
                resolve(hasRecords);
              });
              transaction.addEventListener('abort', () => {
                if (settled) return;
                settled = true;
                database.close();
                reject(
                  transaction.error ??
                    new Error(
                      `Legacy IndexedDB inspection aborted: ${databaseName}`,
                    ),
                );
              });
              transaction.addEventListener('error', () => {
                if (settled) return;
                settled = true;
                database.close();
                reject(
                  transaction.error ??
                    new Error(
                      `Legacy IndexedDB inspection failed: ${databaseName}`,
                    ),
                );
              });
            } catch (cause) {
              settled = true;
              database.close();
              reject(cause);
            }
          });
        }),
      catch: cause =>
        ZerospinError.isZerospinError(cause)
          ? cause
          : new ZerospinError({
              code: 'open-last-user-partition-store-failed',
              message: 'Failed to inspect legacy browser persistence',
              cause: ZerospinError.prettyUnknownFailure(cause),
            }),
    });

    if (containsData) {
      return yield* new ZerospinError({
        code: 'browser-persistence-reset-required',
        message:
          "Browser persistence predates this Zerospin build. Clear this site's browser data, then reload while online.",
      });
    }
  }

  const existingDatabaseInfo = databaseInfos.find(
    databaseInfo => databaseInfo.name === lastUserPartitionDatabaseName,
  );
  if (
    existingDatabaseInfo?.version !== undefined &&
    existingDatabaseInfo.version !== 1
  ) {
    return yield* new ZerospinError({
      code: 'browser-persistence-reset-required',
      message:
        "The browser user locator does not match this Zerospin build. Clear this site's browser data, then reload while online.",
    });
  }

  return yield* Effect.tryPromise({
    try: () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request =
          existingDatabaseInfo === undefined
            ? globalThis.indexedDB.open(lastUserPartitionDatabaseName, 1)
            : globalThis.indexedDB.open(lastUserPartitionDatabaseName);
        let settled = false;

        request.addEventListener('upgradeneeded', event => {
          if (
            existingDatabaseInfo !== undefined ||
            event.oldVersion !== 0 ||
            request.result.objectStoreNames.length !== 0
          ) {
            request.transaction?.abort();
            if (settled) return;
            settled = true;
            reject(
              new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  "The browser user locator does not match this Zerospin build. Clear this site's browser data, then reload while online.",
              }),
            );
            return;
          }
          request.result.createObjectStore(lastUserPartitionStoreName, {
            keyPath: 'key',
          });
        });
        request.addEventListener('blocked', () => {
          if (settled) return;
          settled = true;
          reject(
            new Error('Opening the browser user locator store was blocked'),
          );
        });
        request.addEventListener('error', () => {
          if (settled) return;
          settled = true;
          reject(
            request.error ??
              new Error('Opening the browser user locator store failed'),
          );
        });
        request.addEventListener('success', () => {
          const database = request.result;
          if (settled) {
            database.close();
            return;
          }
          database.addEventListener('versionchange', () => database.close());

          if (
            database.version !== 1 ||
            JSON.stringify(Array.from(database.objectStoreNames)) !==
              JSON.stringify([lastUserPartitionStoreName])
          ) {
            settled = true;
            database.close();
            reject(
              new ZerospinError({
                code: 'browser-persistence-reset-required',
                message:
                  "The browser user locator does not match this Zerospin build. Clear this site's browser data, then reload while online.",
              }),
            );
            return;
          }

          try {
            const transaction = database.transaction(
              lastUserPartitionStoreName,
              'readonly',
            );
            const objectStore = transaction.objectStore(
              lastUserPartitionStoreName,
            );
            const isCompatible =
              objectStore.keyPath === 'key' &&
              objectStore.autoIncrement === false &&
              objectStore.indexNames.length === 0;
            transaction.addEventListener('complete', () => {
              if (settled) return;
              settled = true;
              if (!isCompatible) {
                database.close();
                reject(
                  new ZerospinError({
                    code: 'browser-persistence-reset-required',
                    message:
                      "The browser user locator does not match this Zerospin build. Clear this site's browser data, then reload while online.",
                  }),
                );
                return;
              }
              resolve(database);
            });
            transaction.addEventListener('abort', () => {
              if (settled) return;
              settled = true;
              database.close();
              reject(
                transaction.error ??
                  new Error('Browser user locator layout inspection aborted'),
              );
            });
            transaction.addEventListener('error', () => {
              if (settled) return;
              settled = true;
              database.close();
              reject(
                transaction.error ??
                  new Error('Browser user locator layout inspection failed'),
              );
            });
          } catch (cause) {
            settled = true;
            database.close();
            reject(cause);
          }
        });
      }),
    catch: cause =>
      ZerospinError.isZerospinError(cause)
        ? cause
        : new ZerospinError({
            code: 'open-last-user-partition-store-failed',
            message: 'Failed to open the browser user locator store',
            cause: ZerospinError.prettyUnknownFailure(cause),
          }),
  });
});

export const getLastUserPartition = Effect.fn('getLastUserPartition')(
  function* (props: {
    database: IDBDatabase;
    key: string;
  }): Effect.fn.Return<
    Readonly<{ key: string; systemId: ISystemId; userId: string }> | null,
    IAnyError
  > {
    const stored = yield* Effect.tryPromise({
      try: () =>
        new Promise<unknown>((resolve, reject) => {
          try {
            const transaction = props.database.transaction(
              lastUserPartitionStoreName,
              'readonly',
            );
            const request = transaction
              .objectStore(lastUserPartitionStoreName)
              .get(props.key);
            let result: unknown;
            let settled = false;
            request.addEventListener('success', () => {
              result = request.result;
            });
            request.addEventListener('error', () => {
              if (settled) return;
              settled = true;
              reject(
                request.error ??
                  new Error('Reading the browser user locator failed'),
              );
            });
            transaction.addEventListener('complete', () => {
              if (settled) return;
              settled = true;
              resolve(result);
            });
            transaction.addEventListener('abort', () => {
              if (settled) return;
              settled = true;
              reject(
                transaction.error ??
                  new Error('Browser user locator read aborted'),
              );
            });
            transaction.addEventListener('error', () => {
              if (settled) return;
              settled = true;
              reject(
                transaction.error ??
                  new Error('Browser user locator read failed'),
              );
            });
          } catch (cause) {
            reject(cause);
          }
        }),
      catch: cause =>
        new ZerospinError({
          code: 'get-last-user-partition-failed',
          message: 'Failed to read the browser user locator',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });

    if (stored === undefined) return null;
    const decoded = yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(lastUserPartitionSchema)(stored, {
          onExcessProperty: 'error',
        }),
      catch: () =>
        new ZerospinError({
          code: 'browser-persistence-reset-required',
          message:
            "The browser user locator is invalid. Clear this site's browser data, then reload while online.",
        }),
    });
    if (decoded.key !== props.key) {
      return yield* new ZerospinError({
        code: 'browser-persistence-reset-required',
        message:
          "The browser user locator key is invalid. Clear this site's browser data, then reload while online.",
      });
    }
    return decoded;
  },
);

export const setLastUserPartition = Effect.fn('setLastUserPartition')(
  function* (props: {
    database: IDBDatabase;
    record: Readonly<{ key: string; systemId: ISystemId; userId: string }>;
  }): Effect.fn.Return<void, IAnyError> {
    const record = yield* Effect.try({
      try: () =>
        Schema.decodeUnknownSync(lastUserPartitionSchema)(props.record, {
          onExcessProperty: 'error',
        }),
      catch: () =>
        new ZerospinError({
          code: 'browser-persistence-reset-required',
          message:
            "The browser user locator write is invalid. Clear this site's browser data, then reload while online.",
        }),
    });

    yield* Effect.tryPromise({
      try: () =>
        new Promise<void>((resolve, reject) => {
          try {
            const transaction = props.database.transaction(
              lastUserPartitionStoreName,
              'readwrite',
            );
            const request = transaction
              .objectStore(lastUserPartitionStoreName)
              .put(record);
            let settled = false;
            request.addEventListener('error', () => {
              if (settled) return;
              settled = true;
              reject(
                request.error ??
                  new Error('Writing the browser user locator failed'),
              );
            });
            transaction.addEventListener('complete', () => {
              if (settled) return;
              settled = true;
              resolve();
            });
            transaction.addEventListener('abort', () => {
              if (settled) return;
              settled = true;
              reject(
                transaction.error ??
                  new Error('Browser user locator write aborted'),
              );
            });
            transaction.addEventListener('error', () => {
              if (settled) return;
              settled = true;
              reject(
                transaction.error ??
                  new Error('Browser user locator write failed'),
              );
            });
          } catch (cause) {
            reject(cause);
          }
        }),
      catch: cause =>
        new ZerospinError({
          code: 'set-last-user-partition-failed',
          message: 'Failed to write the browser user locator',
          cause: ZerospinError.prettyUnknownFailure(cause),
        }),
    });
  },
);
