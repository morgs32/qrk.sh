import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const dist = new URL('../dist/', import.meta.url);
const alternateBundle = new URL('test-runtime.bundle.js', dist);
const alternateEntry = new URL('test-runtime.worker.js', dist);
let originalVersion: string;
let alternateVersion: string;

test.beforeAll(async () => {
  const runtime = await readFile(
    new URL('makeSharedWorker.bundle.js', dist),
    'utf8',
  );
  const versionModule = await readFile(
    new URL('sharedWorkerVersion.js', dist),
    'utf8',
  );
  const version = versionModule.match(/[a-f0-9]{64}/)?.[0];
  if (version === undefined) throw new Error('Missing built runtime version');
  originalVersion = version;
  const wasm = await readFile(new URL('sqlite.wasm', dist));
  const canonical = runtime.replaceAll(
    version,
    '__ZEROSPIN_SHARED_WORKER_VERSION__',
  );
  const hash = (code: string, bytes: Uint8Array) =>
    createHash('sha256').update(code).update(bytes).digest('hex');
  expect(hash(canonical, wasm)).toBe(version);
  const changedWasm = Buffer.concat([wasm, Buffer.from([0])]);
  expect(hash(canonical, changedWasm)).not.toBe(version);
  const variant = canonical + '\nglobalThis.__zerospinRuntimeVariant = true;\n';
  alternateVersion = hash(variant, wasm);
  expect(alternateVersion).not.toBe(version);
  await writeFile(
    alternateBundle,
    variant.replaceAll('__ZEROSPIN_SHARED_WORKER_VERSION__', alternateVersion),
  );
  await writeFile(
    alternateEntry,
    "import { makeSharedWorker } from './test-runtime.bundle.js';\nmakeSharedWorker({ sqliteWasmUrl: new URL('./sqlite.wasm', import.meta.url).href });\n",
  );
});
test.afterAll(async () => {
  await Promise.all([unlink(alternateBundle), unlink(alternateEntry)]);
});

test('distinct runtime builds isolate pending work and reject a mismatched tab before attachment', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Start game', exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const controls =
    '/@fs' +
    fileURLToPath(
      new URL('../../fixtures/src/browser/browserControls.ts', import.meta.url),
    );
  await page.evaluate(async controls => {
    const { gameEntry } = await import(controls);
    await gameEntry().setPushPaused({ pushPaused: true });
  }, controls);
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  const result = await page.evaluate(
    async ({
      distUrl,
      workerUrl,
      rpcUrl,
      originalVersion,
      alternateVersion,
      controls,
    }) => {
      const { gameEntry } = await import(controls);
      const first = gameEntry().session.store.getState().nodeState;
      const entries = await new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open(`zerospin:${originalVersion}:discovery`);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const read = db
            .transaction('identities')
            .objectStore('identities')
            .getAll();
          read.onsuccess = () => {
            resolve(read.result);
            db.close();
          };
          read.onerror = () => {
            reject(read.error);
            db.close();
          };
        };
      });
      const entry = entries.find(
        value =>
          typeof value === 'object' && value !== null && 'eligible' in value,
      );
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('key' in entry) ||
        !('claims' in entry) ||
        !('request' in entry) ||
        !('targetId' in entry)
      ) {
        throw new Error('Missing verified identity');
      }
      const { newMessagePortRpcSession, RpcStub } = await import(rpcUrl);
      const worker = new SharedWorker(workerUrl, {
        type: 'module',
        name: `zerospin:${alternateVersion}:${entry.key}`,
      });
      const rpc = newMessagePortRpcSession(worker.port);
      worker.port.start();
      const ready = await rpc.ready();
      if (ready._tag !== 'Success') throw new Error(JSON.stringify(ready));
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('zerospin.executed.disposition.v1'),
      );
      const executedHash = [...new Uint8Array(digest)]
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      const admission = new RpcStub(async () => ({ claims: entry.claims }));
      const attached = await rpc.attach(
        {
          request: entry.request,
          claims: entry.claims,
          targetId: entry.targetId,
          revision: 0,
          online: true,
          baseline: {
            executedIndex: 0,
            executedHash,
            aggregateIndex: 0,
            resolvedThrough: 0,
            resources: [],
          },
        },
        admission,
      );
      if (attached._tag !== 'Success') {
        throw new Error(JSON.stringify(attached));
      }
      const incompatible = await rpc.attach(
        {
          request: entry.request,
          claims: entry.claims,
          targetId: 'different-target',
          revision: 0,
          online: false,
          baseline: null,
        },
        admission,
      );
      if (
        incompatible._tag !== 'Failure' ||
        incompatible.failure.message !== 'node-attachment-identity-mismatch'
      ) {
        throw new Error(
          `Unexpected attachment result: ${JSON.stringify(incompatible)}`,
        );
      }
      const snapshot = await attached.success.snapshot();
      if (snapshot._tag !== 'Success') {
        throw new Error(JSON.stringify(snapshot));
      }
      const { connectBrowserNode } = await import(
        distUrl + 'connectBrowserNode.js'
      );
      const mismatched = await connectBrowserNode({
        request: entry.request,
        expectedClaims: entry.claims,
        getAdmission: async () => ({
          _tag: 'Success',
          success: { claims: entry.claims },
        }),
        sharedWorker: () =>
          new SharedWorker(workerUrl, {
            type: 'module',
            name: `zerospin:${alternateVersion}:${entry.key}`,
          }),
        receive: async () => {},
        state: () => {},
        reconnect: async () => {},
      });
      let mismatch = '';
      try {
        await mismatched.ready();
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          mismatch = String(error.code);
        }
      }
      await mismatched.dispose();
      const names = (await indexedDB.databases()).map(db => db.name);
      const second = snapshot.success;
      await attached.success.dispose();
      rpc[Symbol.dispose]();
      admission[Symbol.dispose]();
      worker.port.close();
      return {
        version: ready.success.version,
        differentId: second.metadata.nodeId !== first.nodeId,
        pending: second.unresolvedCommands.length,
        index: second.metadata.nextNodeIndex,
        firstIndex: gameEntry().session.store.getState().nodeState.nodeIndex,
        originalStorage: names.includes(
          `zerospin:${originalVersion}:${entry.key}`,
        ),
        alternateStorage: names.includes(
          `zerospin:${alternateVersion}:${entry.key}`,
        ),
        mismatch,
      };
    },
    {
      distUrl: '/@fs' + fileURLToPath(dist),
      workerUrl: '/@fs' + fileURLToPath(alternateEntry),
      rpcUrl:
        '/@fs' +
        fileURLToPath(
          new URL('../node_modules/capnweb/dist/index.js', import.meta.url),
        ),
      originalVersion,
      alternateVersion,
      controls,
    },
  );
  expect(result).toEqual({
    version: alternateVersion,
    differentId: true,
    pending: 0,
    index: 1,
    firstIndex: 1,
    originalStorage: true,
    alternateStorage: true,
    mismatch: 'node-worker-version-mismatch',
  });
});
