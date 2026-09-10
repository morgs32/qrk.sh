import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type CDPSession } from '@playwright/test';
import { backupWorkerPlugin } from '@zerospin/backup-worker/vite';
import { build, createServer } from 'vite';

const shoppingRoot = fileURLToPath(new URL('..', import.meta.url));
const outputRoot = path.join(shoppingRoot, 'dist/__backup-acceptance');

test.beforeAll(async () => {
  for (const identity of ['build-a', 'build-b']) {
    const outDir = path.join(outputRoot, identity);
    await build({
      configFile: false,
      root: shoppingRoot,
      plugins: [backupWorkerPlugin()],
      define: { __BACKUP_BUILD__: JSON.stringify(identity) },
      build: {
        outDir,
        emptyOutDir: true,
        target: 'esnext',
        lib: {
          entry: path.join(shoppingRoot, 'tests/browser/backupBuildFixture.ts'),
          formats: ['es'],
          fileName: () => 'frontend.js',
        },
      },
      logLevel: 'warn',
    });
    await mkdir(outDir, { recursive: true });
    await writeFile(
      path.join(outDir, 'index.html'),
      '<!doctype html><script type="module" src="./frontend.js"></script>',
    );
  }
  expect(
    await readFile(path.join(outputRoot, 'build-a/frontend.js'), 'utf8'),
  ).not.toBe(
    await readFile(path.join(outputRoot, 'build-b/frontend.js'), 'utf8'),
  );
});

test.afterAll(async () => {
  await rm(outputRoot, { recursive: true, force: true });
});

test('emitted JavaScript and WASM are real assets and are precached', async ({
  request,
}) => {
  const worker = await request.get('/__zerospin/backup-worker.js');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toMatch(/javascript/);
  expect(await worker.text()).toContain('IDBBatchAtomicVFS');
  const wasm = await request.get('/__zerospin/wa-sqlite-async.wasm');
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  expect(Array.from((await wasm.body()).subarray(0, 4))).toEqual([
    0, 97, 115, 109,
  ]);
  const sw = await request.get('/sw.js');
  expect(sw.status()).toBe(200);
  const serviceWorker = await sw.text();
  expect(serviceWorker).toContain('__zerospin/backup-worker.js');
  expect(serviceWorker).toContain('__zerospin/wa-sqlite-async.wasm');
});

test('two separately emitted builds share storage and take over from a frozen page without awaiting it', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const key = `/zerospin/cross-build-${Date.now()}/user/service/catalog/web/${'a'.repeat(64)}/backup.sqlite3`;
  await page.goto('/__backup-acceptance/build-a/index.html');
  await page.waitForFunction(() => Reflect.has(globalThis, 'backupAcceptance'));
  expect(
    await page.evaluate(
      () => Reflect.get(globalThis, 'backupAcceptance').build,
    ),
  ).toBe('build-a');
  expect(
    await page.evaluate(
      key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
      key,
    ),
  ).toMatchObject({ status: 'acquired', snapshot: null });
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').apply([
        {
          sql: 'CREATE TABLE shared_build (id INTEGER PRIMARY KEY, value TEXT)',
          parameters: [],
        },
        {
          sql: 'INSERT INTO shared_build VALUES (1, ?)',
          parameters: ['build-a'],
        },
      ]),
    ),
  ).toMatchObject({ _tag: 'Success' });
  const baseline = await page.evaluate(() =>
    Reflect.get(globalThis, 'backupAcceptance').snapshot(),
  );
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
  const successor = await context.newPage();
  try {
    await successor.goto('/__backup-acceptance/build-b/index.html');
    await successor.waitForFunction(() =>
      Reflect.has(globalThis, 'backupAcceptance'),
    );
    expect(
      await successor.evaluate(
        () => Reflect.get(globalThis, 'backupAcceptance').build,
      ),
    ).toBe('build-b');
    expect(
      await successor.evaluate(
        key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
        key,
      ),
    ).toEqual({ status: 'acquired', snapshot: baseline });
    expect(
      await successor.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: 'INSERT INTO shared_build VALUES (2, ?)',
            parameters: ['build-b'],
          },
        ]),
      ),
    ).toMatchObject({ _tag: 'Success' });
    const committed = await successor.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').snapshot(),
    );
    const targets = await cdp.send('Target.getTargets');
    expect(
      targets.targetInfos.filter(
        target =>
          target.type === 'shared_worker' &&
          target.url.endsWith('/__zerospin/backup-worker.js'),
      ),
    ).toHaveLength(1);
    expect(
      targets.targetInfos.filter(
        target => target.type === 'worker' && /backup/i.test(target.url),
      ),
    ).toHaveLength(0);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await expect
      .poll(() =>
        page.evaluate(
          () => Reflect.get(globalThis, 'backupAcceptance').revoked,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          { sql: 'DELETE FROM shared_build', parameters: [] },
        ]),
      ),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-revoked' },
    });
    expect(
      await page.evaluate(
        bytes => Reflect.get(globalThis, 'backupAcceptance').overwrite(bytes),
        baseline,
      ),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-revoked' },
    });
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').disposeDb(),
    );
    expect(
      await successor.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').snapshot(),
      ),
    ).toEqual(committed);
  } finally {
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').close(),
    );
    await successor.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance')?.close(),
    );
    await successor.close();
  }
});

test('a loaded page restarts its backup worker offline using the precached worker and WASM', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const key = `/zerospin/offline-${Date.now()}/user/service/catalog/web/${'b'.repeat(64)}/backup.sqlite3`;
  await page.goto('/__backup-acceptance/build-a/index.html');
  await page.waitForFunction(() => Reflect.has(globalThis, 'backupAcceptance'));
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // The host's SPA navigation fallback serves its normal app after registration.
  // Load the emitted acceptance client into that controlled page while online.
  await page.addScriptTag({
    type: 'module',
    url: '/__backup-acceptance/build-a/frontend.js',
  });
  await page.waitForFunction(() => Reflect.has(globalThis, 'backupAcceptance'));
  await page.evaluate(
    key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
    key,
  );
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').apply([
        { sql: 'CREATE TABLE offline_backup (value TEXT)', parameters: [] },
        {
          sql: 'INSERT INTO offline_backup VALUES (?)',
          parameters: ['retained'],
        },
      ]),
    ),
  ).toMatchObject({ _tag: 'Success' });
  const baseline = await page.evaluate(() =>
    Reflect.get(globalThis, 'backupAcceptance').snapshot(),
  );
  const cdp = await context.newCDPSession(page);
  const targets = await cdp.send('Target.getTargets');
  const target = targets.targetInfos.find(
    target =>
      target.type === 'shared_worker' &&
      target.url.endsWith('/__zerospin/backup-worker.js'),
  );
  if (!target) throw new Error('Expected running backup worker');
  await context.setOffline(true);
  try {
    expect(
      (await cdp.send('Target.closeTarget', { targetId: target.targetId }))
        .success,
    ).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () => Reflect.get(globalThis, 'backupAcceptance').disconnected,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
        key,
      ),
    ).toEqual({ status: 'acquired', snapshot: baseline });
    expect(
      await page.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: 'INSERT INTO offline_backup VALUES (?)',
            parameters: ['offline successor'],
          },
        ]),
      ),
    ).toMatchObject({ _tag: 'Success' });
  } finally {
    await context.setOffline(false);
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').close(),
    );
  }
});

test('takeover waits for an in-flight IndexedDB transaction and rejects queued stale SQL', async ({
  context,
  page,
}) => {
  test.setTimeout(120_000);
  const key = `/zerospin/transaction-${Date.now()}/user/service/catalog/web/${'c'.repeat(64)}/backup.sqlite3`;
  await page.goto('/__backup-acceptance/build-a/index.html');
  await page.waitForFunction(() => Reflect.has(globalThis, 'backupAcceptance'));
  await page.evaluate(
    key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
    key,
  );
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').apply([
        { sql: 'CREATE TABLE transaction_test (value TEXT)', parameters: [] },
      ]),
    ),
  ).toMatchObject({ _tag: 'Success' });
  const successor = await context.newPage();
  await successor.goto('/__backup-acceptance/build-b/index.html');
  await successor.waitForFunction(() =>
    Reflect.has(globalThis, 'backupAcceptance'),
  );
  // Hold the native stores, dispatch one SQLite operation, then queue another.
  // A same-owner acquisition reply proves the worker processed the first call.
  await page.evaluate(async () => {
    const opened = indexedDB.open('zerospin-backups-idb-v1');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      opened.onsuccess = () => resolve(opened.result);
      opened.onerror = () => reject(opened.error);
    });
    const transaction = db.transaction(['blocks', 'metadata'], 'readwrite');
    let released = false;
    Reflect.set(globalThis, 'releaseBackupTransaction', () => {
      released = true;
    });
    transaction.oncomplete = () => db.close();
    const store = transaction.objectStore('metadata');
    await new Promise<void>(resolve => {
      const request = store.get('__test_barrier__');
      request.onsuccess = function keepTransactionActive() {
        resolve();
        if (!released) {
          store.get('__test_barrier__').onsuccess = keepTransactionActive;
        }
      };
    });
    Reflect.set(
      globalThis,
      'inFlightBackupWrite',
      Reflect.get(globalThis, 'backupAcceptance').apply([
        {
          sql: 'INSERT INTO transaction_test VALUES (?)',
          parameters: ['in-flight'],
        },
      ]),
    );
  });
  try {
    expect(
      await page.evaluate(
        key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
        key,
      ),
    ).toMatchObject({ status: 'current' });
    await page.evaluate(() => {
      Reflect.set(
        globalThis,
        'queuedBackupWrite',
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: 'INSERT INTO transaction_test VALUES (?)',
            parameters: ['stale-queued'],
          },
        ]),
      );
    });
    const takeover = successor.evaluate(
      key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
      key,
    );
    // Revocation precedes waiting on SQLite and never waits for a page response.
    await expect
      .poll(() =>
        page.evaluate(
          () => Reflect.get(globalThis, 'backupAcceptance').revoked,
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      Reflect.get(globalThis, 'releaseBackupTransaction')(),
    );
    await page.evaluate(() => Reflect.get(globalThis, 'inFlightBackupWrite'));
    expect(
      await page.evaluate(() => Reflect.get(globalThis, 'queuedBackupWrite')),
    ).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'backup-db-revoked' },
    });
    expect(await takeover).toMatchObject({ status: 'acquired' });
    expect(
      await successor.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: 'CREATE TEMP TABLE verify_transaction (committed INTEGER CHECK(committed = 1), stale INTEGER CHECK(stale = 0))',
            parameters: [],
          },
          {
            sql: "INSERT INTO verify_transaction SELECT (SELECT COUNT(*) FROM transaction_test WHERE value = 'in-flight'), (SELECT COUNT(*) FROM transaction_test WHERE value = 'stale-queued')",
            parameters: [],
          },
          { sql: 'DROP TABLE verify_transaction', parameters: [] },
        ]),
      ),
    ).toMatchObject({ _tag: 'Success' });
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').disposeDb(),
    );
    expect(
      await successor.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: 'INSERT INTO transaction_test VALUES (?)',
            parameters: ['successor-still-open'],
          },
        ]),
      ),
    ).toMatchObject({ _tag: 'Success' });
  } finally {
    await page.evaluate(() =>
      Reflect.get(globalThis, 'releaseBackupTransaction')(),
    );
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').close(),
    );
    await successor.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').close(),
    );
    await successor.close();
  }
});

// Test-only CDP inspection: the production worker keeps its normal RPC surface.
async function inspectBackupWorker(cdp: CDPSession) {
  const { targetInfos } = await cdp.send('Target.getTargets');
  const target = targetInfos.find(
    target =>
      target.type === 'shared_worker' &&
      target.url.endsWith('/__zerospin/backup-worker.js'),
  );
  if (!target) throw new Error('Expected running backup worker');
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: false,
  });
  let sequence = 0;
  const send = (method: string, params: object = {}) =>
    new Promise<unknown>((resolve, reject) => {
      const id = ++sequence;
      const received = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const message: {
          id?: number;
          result?: { result?: { value?: unknown }; exceptionDetails?: unknown };
          error?: unknown;
        } = JSON.parse(event.message);
        if (message.id !== id) return;
        cdp.off('Target.receivedMessageFromTarget', received);
        if (message.error || message.result?.exceptionDetails) {
          reject(
            new Error(
              JSON.stringify(message.error ?? message.result?.exceptionDetails),
            ),
          );
        } else {
          resolve(message.result?.result?.value);
        }
      };
      cdp.on('Target.receivedMessageFromTarget', received);
      void cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });
  await send('Runtime.enable');
  return {
    detach: () =>
      cdp.send('Target.detachFromTarget', { sessionId }).catch(() => undefined),
    evaluate: (expression: string) =>
      send('Runtime.evaluate', { expression, returnByValue: true }),
  };
}

test('backup acknowledgements follow completed strict IndexedDB content transactions', async ({
  browser,
  page,
}) => {
  const key = `/zerospin/strict-${Date.now()}/user/service/catalog/web/${'d'.repeat(64)}/backup.sqlite3`;
  await page.goto('/__backup-acceptance/build-a/index.html');
  await page.waitForFunction(() => Reflect.has(globalThis, 'backupAcceptance'));
  await page.evaluate(
    key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
    key,
  );
  expect(
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').apply([
        { sql: 'CREATE TABLE strict_backup(value TEXT)', parameters: [] },
        {
          sql: "INSERT INTO strict_backup VALUES ('baseline')",
          parameters: [],
        },
      ]),
    ),
  ).toMatchObject({ _tag: 'Success' });
  const baseline = await page.evaluate(() =>
    Reflect.get(globalThis, 'backupAcceptance').snapshot(),
  );
  const cdp = await browser.newBrowserCDPSession();
  const worker = await inspectBackupWorker(cdp);
  try {
    await worker.evaluate(`
      globalThis.backupTransactions = [];
      globalThis.backupAcknowledgement = null;
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) {
        const tx = Reflect.apply(transaction, this, args);
        if (args[1] === 'readwrite') {
          const observed = { durability: tx.durability, complete: false };
          backupTransactions.push(observed);
          tx.addEventListener('complete', () => { observed.complete = true; });
        }
        return tx;
      };
      const postMessage = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function(message, ...args) {
        if (Array.isArray(message) && message[0] === 'resolve' && JSON.stringify(message).includes('Success')) {
          globalThis.backupAcknowledgement = {
            strictCompleted: backupTransactions.some(tx => tx.durability === 'strict' && tx.complete),
            allCompleted: backupTransactions.every(tx => tx.complete),
          };
        }
        return Reflect.apply(postMessage, this, [message, ...args]);
      };
    `);
    expect(
      await page.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').apply([
          {
            sql: "INSERT INTO strict_backup VALUES ('committed')",
            parameters: [],
          },
        ]),
      ),
    ).toMatchObject({ _tag: 'Success' });
    expect(await worker.evaluate('backupAcknowledgement')).toEqual({
      strictCompleted: true,
      allCompleted: true,
    });
    await worker.evaluate(
      'backupTransactions.length = 0; backupAcknowledgement = null;',
    );
    expect(
      await page.evaluate(
        bytes => Reflect.get(globalThis, 'backupAcceptance').overwrite(bytes),
        baseline,
      ),
    ).toMatchObject({ _tag: 'Success' });
    expect(await worker.evaluate('backupAcknowledgement')).toEqual({
      strictCompleted: true,
      allCompleted: true,
    });
  } finally {
    await worker.detach();
    await cdp.detach();
    await page.evaluate(() =>
      Reflect.get(globalThis, 'backupAcceptance').close(),
    );
  }
});

for (const boundary of ['commit', 'overwrite']) {
  test(`worker death at ${boundary} preserves a complete database and expires the unanswered request`, async ({
    browser,
    page,
  }) => {
    // Prepend test-only native instrumentation to the actual emitted bundle.
    // Attaching a debugger changes SharedWorker termination behavior in Chromium.
    const emittedWorker = await readFile(
      path.join(outputRoot, 'build-a/__zerospin/backup-worker.js'),
      'utf8',
    );
    const emittedClient = await readFile(
      path.join(outputRoot, 'build-a/frontend.js'),
      'utf8',
    );
    const instrumentation = `
      const faultChannel = new BroadcastChannel('backup-fault');
      let faultMode = null;
      let observedTransactions = [];
      faultChannel.onmessage = event => {
        if (event.data === 'commit' || event.data === 'overwrite') {
          faultMode = event.data;
          observedTransactions = [];
          faultChannel.postMessage('armed');
        }
      };
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const originalTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) {
        const tx = Reflect.apply(originalTransaction, this, args);
        const observed = { durability: tx.durability, complete: false };
        if (args[1] === 'readwrite') observedTransactions.push(observed);
        Reflect.apply(originalAddEventListener, tx, ['complete', () => {
          observed.complete = true;
        }]);
        return tx;
      };
      EventTarget.prototype.addEventListener = function(type, callback, ...args) {
        if (this instanceof IDBTransaction && type === 'complete') {
          const tx = this;
          return Reflect.apply(originalAddEventListener, this, [type, function(event) {
            if (faultMode === 'overwrite' && tx.backupBlockWritten) {
              faultMode = null;
              faultChannel.postMessage({
                boundary: 'overwrite-native-complete-vfs-awaiting',
                durability: tx.durability,
              });
              return;
            }
            return typeof callback === 'function'
              ? callback.call(this, event)
              : callback.handleEvent(event);
          }, ...args]);
        }
        return Reflect.apply(originalAddEventListener, this, [type, callback, ...args]);
      };
      const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'blocks' && faultMode === 'overwrite') {
          this.transaction.backupBlockWritten = true;
        }
        return Reflect.apply(originalPut, this, args);
      };
      const originalPostMessage = MessagePort.prototype.postMessage;
      MessagePort.prototype.postMessage = function(message, ...args) {
        if (faultMode === 'commit' && Array.isArray(message) &&
            message[0] === 'resolve' && JSON.stringify(message).includes('Success')) {
          faultMode = null;
          faultChannel.postMessage({
            boundary: 'after-commit-before-reply',
            strictCompleted: observedTransactions.some(tx => tx.durability === 'strict' && tx.complete),
            allCompleted: observedTransactions.every(tx => tx.complete),
          });
          return;
        }
        return Reflect.apply(originalPostMessage, this, [message, ...args]);
      };
    `;
    const server = await createServer({
      configFile: false,
      root: shoppingRoot,
      plugins: [
        {
          name: 'backup-native-fault-fixture',
          enforce: 'pre',
          configureServer(server) {
            server.middlewares.use((request, response, next) => {
              if (request.url === '/__zerospin/backup-worker.js') {
                response.setHeader('Content-Type', 'text/javascript');
                response.end(`${instrumentation}\n${emittedWorker}`);
              } else if (request.url === '/frontend.js') {
                response.setHeader('Content-Type', 'text/javascript');
                response.end(emittedClient);
              } else if (request.url === '/') {
                response.setHeader('Content-Type', 'text/html');
                response.end(
                  '<!doctype html><script type="module" src="/frontend.js"></script>',
                );
              } else {
                next();
              }
            });
          },
        },
        backupWorkerPlugin(),
      ],
      server: { host: '127.0.0.1', port: 0, strictPort: true },
      optimizeDeps: { noDiscovery: true, entries: [] },
      logLevel: 'warn',
    });
    try {
      await server.listen();
      const address = server.resolvedUrls?.local[0];
      if (!address) throw new Error('Expected listening fault-fixture server');
      await page.addInitScript(() => {
        const channel = new BroadcastChannel('backup-fault');
        const messages: unknown[] = [];
        channel.onmessage = event => messages.push(event.data);
        Reflect.set(globalThis, 'backupFaultChannel', channel);
        Reflect.set(globalThis, 'backupFaultMessages', messages);
        Reflect.set(globalThis, 'backupReply', null);
      });
      await page.goto(address);
      await page.waitForFunction(() =>
        Reflect.has(globalThis, 'backupAcceptance'),
      );
      const key = `/zerospin/native-${boundary}/backup.sqlite3`;
      await page.evaluate(
        key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
        key,
      );
      expect(
        await page.evaluate(() =>
          Reflect.get(globalThis, 'backupAcceptance').apply([
            {
              sql: 'CREATE TABLE content(id INTEGER PRIMARY KEY, generation TEXT, payload BLOB)',
              parameters: [],
            },
            {
              sql: "WITH RECURSIVE n(id) AS (SELECT 1 UNION ALL SELECT id+1 FROM n WHERE id<256) INSERT INTO content SELECT id,'old',zeroblob(4096) FROM n",
              parameters: [],
            },
          ]),
        ),
      ).toMatchObject({ _tag: 'Success' });
      let replacement: number[] = [];
      if (boundary === 'overwrite') {
        await page.evaluate(() =>
          Reflect.get(globalThis, 'backupAcceptance').acquire(
            '/zerospin/native-replacement/backup.sqlite3',
          ),
        );
        expect(
          await page.evaluate(() =>
            Reflect.get(globalThis, 'backupAcceptance').apply([
              {
                sql: 'CREATE TABLE content(id INTEGER PRIMARY KEY, generation TEXT, payload BLOB)',
                parameters: [],
              },
              {
                sql: "WITH RECURSIVE n(id) AS (SELECT 1 UNION ALL SELECT id+1 FROM n WHERE id<512) INSERT INTO content SELECT id,'new',zeroblob(4096) FROM n",
                parameters: [],
              },
            ]),
          ),
        ).toMatchObject({ _tag: 'Success' });
        replacement = await page.evaluate(() =>
          Reflect.get(globalThis, 'backupAcceptance').snapshot(),
        );
        await page.evaluate(
          key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
          key,
        );
      }
      await page.evaluate(
        boundary =>
          Reflect.get(globalThis, 'backupFaultChannel').postMessage(boundary),
        boundary,
      );
      await page.waitForFunction(() =>
        Reflect.get(globalThis, 'backupFaultMessages').includes('armed'),
      );
      await page.evaluate(
        ({ boundary, replacement }) => {
          const fixture = Reflect.get(globalThis, 'backupAcceptance');
          const request =
            boundary === 'commit'
              ? fixture.apply([
                  {
                    sql: "INSERT INTO content VALUES (257, 'committed-once', zeroblob(4096))",
                    parameters: [],
                  },
                ])
              : fixture.overwrite(replacement);
          void request.then((result: unknown) =>
            Reflect.set(globalThis, 'backupReply', result),
          );
        },
        { boundary, replacement },
      );
      await page.waitForFunction(() =>
        Reflect.get(globalThis, 'backupFaultMessages').some(
          (message: { boundary?: string }) => message.boundary,
        ),
      );
      expect(
        await page.evaluate(() =>
          Reflect.get(globalThis, 'backupFaultMessages'),
        ),
      ).toContainEqual(
        boundary === 'commit'
          ? {
              boundary: 'after-commit-before-reply',
              strictCompleted: true,
              allCompleted: true,
            }
          : {
              boundary: 'overwrite-native-complete-vfs-awaiting',
              durability: 'strict',
            },
      );
      expect(
        await page.evaluate(() => Reflect.get(globalThis, 'backupReply')),
      ).toBeNull();
      const cdp = await browser.newBrowserCDPSession();
      try {
        const { targetInfos } = await cdp.send('Target.getTargets');
        const target = targetInfos.find(
          target =>
            target.type === 'shared_worker' &&
            target.url ===
              new URL('/__zerospin/backup-worker.js', address).href,
        );
        if (!target) throw new Error('Expected running uninspected worker');
        expect(
          await cdp.send('Target.closeTarget', { targetId: target.targetId }),
        ).toEqual({ success: true });
      } finally {
        await cdp.detach();
      }
      await page.waitForFunction(
        () => Reflect.get(globalThis, 'backupAcceptance').disconnected,
      );
      await page.waitForFunction(
        () => Reflect.get(globalThis, 'backupReply') !== null,
      );
      expect(
        await page.evaluate(() => Reflect.get(globalThis, 'backupReply')),
      ).toMatchObject({
        _tag: 'Failure',
        failure: { code: 'backup-request-uncertain' },
      });
      const restored = await page.evaluate(
        key => Reflect.get(globalThis, 'backupAcceptance').acquire(key),
        key,
      );
      expect(restored.status).toBe('acquired');
      expect(restored.snapshot.length).toBeGreaterThan(100);
      expect(
        await page.evaluate(
          boundary =>
            Reflect.get(globalThis, 'backupAcceptance').apply([
              {
                sql: "CREATE TABLE recovery_proof(value TEXT CHECK(value='ok'))",
                parameters: [],
              },
              {
                sql: 'INSERT INTO recovery_proof SELECT integrity_check FROM pragma_integrity_check',
                parameters: [],
              },
              {
                sql:
                  boundary === 'commit'
                    ? "INSERT INTO recovery_proof SELECT CASE WHEN count(*)=1 THEN 'ok' ELSE 'replayed-or-lost' END FROM content WHERE id=257 AND generation='committed-once'"
                    : "INSERT INTO recovery_proof SELECT CASE WHEN (count(*)=256 AND min(generation)='old' AND max(generation)='old') OR (count(*)=512 AND min(generation)='new' AND max(generation)='new') THEN 'ok' ELSE 'partial' END FROM content",
                parameters: [],
              },
              {
                sql: "INSERT INTO recovery_proof SELECT CASE WHEN count(*)=0 THEN 'ok' ELSE 'corrupt' END FROM content WHERE length(payload)<>4096",
                parameters: [],
              },
            ]),
          boundary,
        ),
      ).toMatchObject({ _tag: 'Success' });
      await page.evaluate(() =>
        Reflect.get(globalThis, 'backupAcceptance').close(),
      );
    } finally {
      await page.close();
      await server.close();
    }
  });
}
