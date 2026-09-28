import { hashNodeValue, nodeKey } from '@zerospin/core/Node/nodeKey';
import { makeZerospinError } from '@zerospin/error';
import { Schema } from 'effect';

import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import { makeNodeDefinition } from './makeNodeDefinition.ts';
import { NodeRequestSchema, type INodeRequest } from './nodeRequest.ts';

const entrySchema = Schema.Struct({
  key: Schema.String,
  request: NodeRequestSchema,
  claims: Schema.Record(Schema.String, Schema.Unknown),
  targetId: Schema.String,
  eligible: Schema.Boolean,
  invalidatedAt: Schema.Number,
});

// Only verified identity metadata belongs here. Each node owns its own SQLite database.
async function transaction<A>(
  mode: IDBTransactionMode,
  work: (
    store: IDBObjectStore,
    complete: (value: A) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<A> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      `zerospin:${sharedWorkerVersion}:discovery`,
      1,
    );
    request.onupgradeneeded = () =>
      request.result.createObjectStore('identities');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(makeZerospinError({ code: 'node-discovery-blocked' }));
  });
  try {
    return await new Promise<A>((resolve, reject) => {
      const tx = db.transaction('identities', mode);
      let result: { value: A } | undefined;
      let failure: unknown;
      tx.oncomplete = () =>
        result === undefined
          ? reject(makeZerospinError({ code: 'node-discovery-incomplete' }))
          : resolve(result.value);
      tx.onabort = () => reject(failure ?? tx.error);
      tx.onerror = () => {
        failure ??= tx.error;
      };
      const fail = (error: unknown) => {
        failure = error;
        tx.abort();
      };
      try {
        work(
          tx.objectStore('identities'),
          value => {
            result = { value };
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    db.close();
  }
}

export const sessionDiscovery = {
  revision: () =>
    transaction<number>('readonly', (store, done, fail) => {
      const request = store.get('revision');
      request.onsuccess = () => {
        try {
          done(
            request.result === undefined
              ? 0
              : Schema.decodeUnknownSync(Schema.Number)(request.result),
          );
        } catch (error) {
          fail(error);
        }
      };
    }),
  async find(request: INodeRequest, claims: Readonly<Record<string, unknown>>) {
    const entries = await transaction<readonly (typeof entrySchema.Type)[]>(
      'readonly',
      (store, done, fail) => {
        const read = store.getAll();
        read.onsuccess = () => {
          try {
            done(
              Schema.decodeUnknownSync(Schema.Array(entrySchema))(
                read.result.filter(value => typeof value !== 'number'),
              ),
            );
          } catch (error) {
            fail(error);
          }
        };
      },
    );
    const locator = await hashNodeValue({ request, claims });
    const matches = [];
    for (const entry of entries) {
      if (
        entry.eligible &&
        (await hashNodeValue({
          request: entry.request,
          claims: entry.claims,
        })) === locator
      ) {
        matches.push(entry);
      }
    }
    if (matches.length !== 1 || matches[0] === undefined) {
      throw makeZerospinError({
        code:
          matches.length === 0
            ? 'node-offline-identity-missing'
            : 'node-offline-identity-ambiguous',
      });
    }
    return matches[0];
  },
  async check(key: string, revision: number, offline: boolean) {
    await transaction<void>('readonly', (store, done, fail) => {
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          const entry =
            read.result === undefined
              ? undefined
              : Schema.decodeUnknownSync(entrySchema)(read.result);
          if (
            (entry?.invalidatedAt ?? 0) > revision ||
            (offline && !entry?.eligible)
          ) {
            throw makeZerospinError({ code: 'node-authentication-cancelled' });
          }
          done(undefined);
        } catch (error) {
          fail(error);
        }
      };
    });
  },
  async update(
    request: INodeRequest,
    claims: Readonly<Record<string, unknown>>,
    targetId: string,
    revision: number,
    eligible: boolean,
  ) {
    const key = await nodeKey(
      (await makeNodeDefinition(request, claims, targetId)).identity,
    );
    await transaction<void>('readwrite', (store, done, fail) => {
      const read = store.get(key);
      read.onsuccess = () => {
        try {
          const prior =
            read.result === undefined
              ? undefined
              : Schema.decodeUnknownSync(entrySchema)(read.result);
          if (eligible) {
            if ((prior?.invalidatedAt ?? 0) > revision) {
              throw makeZerospinError({
                code: 'node-authentication-cancelled',
              });
            }
            store.put(
              {
                key,
                request,
                claims,
                targetId,
                eligible,
                invalidatedAt: prior?.invalidatedAt ?? 0,
              },
              key,
            );
            done(undefined);
          } else {
            const counter = store.get('revision');
            counter.onsuccess = () => {
              try {
                const next =
                  (counter.result === undefined
                    ? 0
                    : Schema.decodeUnknownSync(Schema.Number)(counter.result)) +
                  1;
                store.put(next, 'revision');
                store.put(
                  {
                    key,
                    request,
                    claims,
                    targetId,
                    eligible,
                    invalidatedAt: next,
                  },
                  key,
                );
                done(undefined);
              } catch (error) {
                fail(error);
              }
            };
          }
        } catch (error) {
          fail(error);
        }
      };
    });
  },
};
